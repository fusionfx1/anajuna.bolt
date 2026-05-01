import type { ManagedOrder, RiskCheckResult } from '../types/dataFeed';
import { riskManager } from './riskManagerService';
import { brokerService } from './brokerService';
import type { AccountState } from './riskManagerService';
import { supabase } from '../lib/supabase';

type OrderUpdateHandler = (order: ManagedOrder) => void;

interface PersistenceStatus {
  orderId: string;
  persisted: boolean;
  error?: string;
  timestamp: string;
}

function generateClientOrderId(): string {
  return `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

class OrderManagerService {
  private orders: Map<string, ManagedOrder> = new Map();
  private updateHandlers: Set<OrderUpdateHandler> = new Set();
  private persistenceFailures: Map<string, PersistenceStatus> = new Map();
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
      await brokerService.cancelOrder(order.brokerOrderId).catch(() => {});
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
    } catch {
      // Ignore polling errors - broker may not be configured or order may not exist
      // This is expected when broker is not configured
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
    const filled = all.filter(o => o.status === 'filled');
    const rejected = all.filter(o => o.status === 'rejected').length;
    const cancelled = all.filter(o => o.status === 'cancelled').length;
    const pending = all.filter(o => o.status === 'pending' || o.status === 'submitted').length;
    const total = all.length;
    const fillRate = total > 0 ? (filled.length / total) * 100 : 0;

    const latencies = filled
      .map(o => {
        if (o.filledAt && o.submittedAt) {
          return new Date(o.filledAt).getTime() - new Date(o.submittedAt).getTime();
        }
        return 0;
      })
      .filter(latency => latency > 0);

    const avgLatencyMs = latencies.length > 0
      ? parseFloat((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
      : 0;

    return {
      total,
      filled: filled.length,
      rejected,
      cancelled,
      pending,
      fillRate: parseFloat(fillRate.toFixed(1)),
      avgLatencyMs,
    };
  }

  getPersistenceFailures(): PersistenceStatus[] {
    return Array.from(this.persistenceFailures.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  hasPersistenceFailures(): boolean {
    return this.persistenceFailures.size > 0;
  }

  getPersistenceStatus(orderId: string): PersistenceStatus | undefined {
    return this.persistenceFailures.get(orderId);
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

      // Clear any previous failure record on successful persistence
      this.persistenceFailures.delete(order.id);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `[OrderManager] Failed to persist order: userId=${this.userId}, orderId=${order.id}, status=${order.status}, error=${errorMessage}`
      );

      // Track persistence failure
      this.persistenceFailures.set(order.id, {
        orderId: order.id,
        persisted: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
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

      // Clear any previous failure record on successful persistence
      this.persistenceFailures.delete(order.id);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `[OrderManager] Failed to persist trade: userId=${this.userId}, orderId=${order.id}, symbol=${order.symbol}, filledQty=${order.filledQty}, latencyMs=${latencyMs}, error=${errorMessage}`
      );

      // Track persistence failure
      this.persistenceFailures.set(order.id, {
        orderId: order.id,
        persisted: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const orderManager = new OrderManagerService();
