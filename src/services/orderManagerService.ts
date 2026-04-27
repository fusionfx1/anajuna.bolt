import type { ManagedOrder, OrderStatus, RiskCheckResult } from '../types/dataFeed';
import { riskManager } from './riskManagerService';
import { brokerService } from './brokerService';
import type { AccountState } from './riskManagerService';
import { supabase } from '../lib/supabase';

type OrderUpdateHandler = (order: ManagedOrder) => void;

function generateClientOrderId(): string {
  return `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

class OrderManagerService {
  private orders: Map<string, ManagedOrder> = new Map();
  private updateHandlers: Set<OrderUpdateHandler> = new Set();
  private userId: string | null = null;

  setUserId(userId: string): void {
    this.userId = userId;
  }

  onOrderUpdate(handler: OrderUpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => this.updateHandlers.delete(handler);
  }

  getOrders(): ManagedOrder[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }

  getOpenOrders(): ManagedOrder[] {
    return this.getOrders().filter(o =>
      o.status === 'pending' || o.status === 'submitted' || o.status === 'partially_filled'
    );
  }

  async submitOrder(params: {
    symbol: string;
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
    strategyId?: string;
    strategyName?: string;
    currentPrice: number;
    accountState: AccountState;
  }): Promise<{ order: ManagedOrder; riskCheck: RiskCheckResult }> {
    const order: ManagedOrder = {
      id: generateClientOrderId(),
      clientOrderId: generateClientOrderId(),
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      quantity: params.quantity,
      limitPrice: params.limitPrice,
      stopPrice: params.stopPrice,
      status: 'pending',
      filledQty: 0,
      strategyId: params.strategyId,
      strategyName: params.strategyName,
      riskApproved: false,
      submittedAt: new Date().toISOString(),
      timeInForce: params.timeInForce ?? 'day',
    };

    this.orders.set(order.id, order);
    this.emitUpdate(order);

    const riskCheck = riskManager.approve(order, params.currentPrice, params.accountState);

    if (!riskCheck.approved) {
      order.status = 'rejected';
      order.riskApproved = false;
      order.rejectionReason = riskCheck.reason ?? 'Risk check failed';
      this.orders.set(order.id, order);
      this.emitUpdate(order);
      await this.persistOrder(order);
      return { order, riskCheck };
    }

    order.riskApproved = true;
    order.status = 'submitted';
    this.orders.set(order.id, order);
    this.emitUpdate(order);

    try {
      const brokerStart = Date.now();
      const brokerRes = await brokerService.submitOrder(order);
      const latencyMs = Date.now() - brokerStart;

      order.brokerOrderId = brokerRes.brokerOrderId;

      if (brokerRes.status === 'rejected') {
        order.status = 'rejected';
        order.rejectionReason = 'Rejected by broker';
      } else if (brokerRes.status === 'filled' || brokerRes.filledQty >= order.quantity) {
        order.status = 'filled';
        order.filledQty = brokerRes.filledQty;
        order.filledAvgPrice = brokerRes.filledAvgPrice ?? params.currentPrice;
        order.filledAt = new Date().toISOString();
        await this.persistTrade(order, latencyMs);
      } else {
        order.status = 'submitted';
        order.filledQty = brokerRes.filledQty;
      }
    } catch (err) {
      order.status = 'rejected';
      order.rejectionReason = err instanceof Error ? err.message : 'Broker error';
    }

    this.orders.set(order.id, order);
    this.emitUpdate(order);
    await this.persistOrder(order);

    return { order, riskCheck };
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;
    if (order.status === 'filled' || order.status === 'cancelled') return;

    if (order.brokerOrderId) {
      await brokerService.cancelOrder(order.brokerOrderId).catch((err) => {
        console.warn('[orderManager] broker cancel failed', { orderId, err });
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date().toISOString();
    this.orders.set(orderId, order);
    this.emitUpdate(order);
    await this.persistOrder(order);
  }

  async refreshOrderStatus(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order?.brokerOrderId) return;
    if (order.status === 'filled' || order.status === 'cancelled') return;

    try {
      const brokerRes = await brokerService.getOrderStatus(order.brokerOrderId);
      if (brokerRes.status === 'filled') {
        order.status = 'filled';
        order.filledQty = brokerRes.filledQty;
        order.filledAvgPrice = brokerRes.filledAvgPrice;
        order.filledAt = new Date().toISOString();
      } else if (brokerRes.status === 'canceled' || brokerRes.status === 'cancelled') {
        order.status = 'cancelled';
        order.cancelledAt = new Date().toISOString();
      } else if (brokerRes.status === 'partially_filled') {
        order.status = 'partially_filled';
        order.filledQty = brokerRes.filledQty;
        order.filledAvgPrice = brokerRes.filledAvgPrice;
      }
      this.orders.set(orderId, order);
      this.emitUpdate(order);
    } catch (err) {
      console.warn('[orderManager] poll status failed', { orderId, err });
    }
  }

  getOrderStats(): {
    total: number;
    filled: number;
    rejected: number;
    cancelled: number;
    pending: number;
    fillRate: number;
    avgLatencyMs: number;
  } {
    const all = this.getOrders();
    const filled = all.filter(o => o.status === 'filled').length;
    const rejected = all.filter(o => o.status === 'rejected').length;
    const cancelled = all.filter(o => o.status === 'cancelled').length;
    const pending = all.filter(o => o.status === 'pending' || o.status === 'submitted').length;
    const total = all.length;
    const fillRate = total > 0 ? (filled / total) * 100 : 0;

    return {
      total,
      filled,
      rejected,
      cancelled,
      pending,
      fillRate: parseFloat(fillRate.toFixed(1)),
      avgLatencyMs: 0,
    };
  }

  private emitUpdate(order: ManagedOrder): void {
    const snapshot = { ...order };
    this.updateHandlers.forEach(h => h(snapshot));
  }

  private async persistOrder(order: ManagedOrder): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('managed_orders').upsert({
        id: order.id,
        user_id: this.userId,
        client_order_id: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        order_type: order.orderType,
        quantity: order.quantity,
        limit_price: order.limitPrice ?? null,
        stop_price: order.stopPrice ?? null,
        status: order.status,
        filled_qty: order.filledQty,
        filled_avg_price: order.filledAvgPrice ?? null,
        strategy_id: order.strategyId ?? null,
        risk_approved: order.riskApproved,
        rejection_reason: order.rejectionReason ?? null,
        broker_order_id: order.brokerOrderId ?? null,
        submitted_at: order.submittedAt,
        filled_at: order.filledAt ?? null,
        cancelled_at: order.cancelledAt ?? null,
        time_in_force: order.timeInForce,
      }, { onConflict: 'id' });
    } catch (err) {
      console.warn('[orderManager] persistOrder failed', { id: order.id, err });
    }
  }

  private async persistTrade(order: ManagedOrder, latencyMs: number): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('trades').insert({
        user_id: this.userId,
        strategy_id: order.strategyId ?? null,
        symbol: order.symbol,
        order_type: order.orderType.toUpperCase(),
        side: order.side.toUpperCase(),
        quantity: order.filledQty,
        requested_price: order.limitPrice ?? order.filledAvgPrice ?? 0,
        fill_price: order.filledAvgPrice ?? 0,
        slippage_pips: 0,
        commission_usd: 0,
        swap_usd: 0,
        pnl_usd: null,
        broker_order_id: order.brokerOrderId ?? null,
        execution_latency_ms: latencyMs,
        executed_at: order.filledAt ?? new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[orderManager] persistTrade failed', { id: order.id, err });
    }
  }
}

export const orderManager = new OrderManagerService();
