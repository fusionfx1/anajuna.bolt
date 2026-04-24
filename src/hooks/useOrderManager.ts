import { useState, useEffect, useCallback } from 'react';
import type { ManagedOrder, RiskCheckResult } from '../types/dataFeed';
import { orderManager } from '../services/orderManagerService';
import { riskManager } from '../services/riskManagerService';
import { brokerService } from '../services/brokerService';
import type { RiskParameters, AccountState } from '../services/riskManagerService';
import type { BrokerConfig } from '../services/brokerService';
import { useAuth } from '../context/AuthContext';

export function useOrderManager() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      orderManager.setUserId(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    const refresh = () => {
      const all = orderManager.getOrders();
      setOrders(all);
      setPendingCount(orderManager.getOpenOrders().length);
    };

    const unsub = orderManager.onOrderUpdate(() => refresh());
    refresh();

    return unsub;
  }, []);

  const submitOrder = useCallback(async (params: {
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
  }): Promise<{ order: ManagedOrder; riskCheck: RiskCheckResult }> => {
    return orderManager.submitOrder(params);
  }, []);

  const cancelOrder = useCallback(async (orderId: string) => {
    return orderManager.cancelOrder(orderId);
  }, []);

  const refreshOrderStatus = useCallback(async (orderId: string) => {
    return orderManager.refreshOrderStatus(orderId);
  }, []);

  const stats = orderManager.getOrderStats();

  return {
    orders,
    pendingCount,
    stats,
    submitOrder,
    cancelOrder,
    refreshOrderStatus,
  };
}

export function useRiskManager() {
  const [params, setParams] = useState<RiskParameters>(() => riskManager.getParameters());

  const updateParams = useCallback((updates: Partial<RiskParameters>) => {
    riskManager.updateParameters(updates);
    setParams(riskManager.getParameters());
  }, []);

  const calculatePositionSize = useCallback((
    accountEquity: number,
    riskPct: number,
    entryPrice: number,
    stopLossPrice: number
  ) => {
    return riskManager.calculatePositionSize(accountEquity, riskPct, entryPrice, stopLossPrice);
  }, []);

  return { params, updateParams, calculatePositionSize };
}

export function useBrokerConfig() {
  const [isPaper, setIsPaper] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  const configure = useCallback((config: BrokerConfig) => {
    brokerService.configure(config);
    setIsPaper(config.paperTrading);
    setIsConfigured(brokerService.isConfigured());
  }, []);

  const getAccount = useCallback(async () => {
    return brokerService.getAccount();
  }, []);

  return { isPaper, isConfigured, configure, getAccount };
}
