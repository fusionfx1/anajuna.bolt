import type { ManagedOrder, BrokerProvider } from '../types/dataFeed';

export interface BrokerConfig {
  provider: BrokerProvider;
  keyId: string;
  secretKey: string;
  paperTrading: boolean;
}

export interface BrokerAccount {
  id: string;
  status: string;
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  daytradeCount: number;
  patternDayTrader: boolean;
}

export interface BrokerOrderResponse {
  brokerOrderId: string;
  status: string;
  filledQty: number;
  filledAvgPrice?: number;
  submittedAt: string;
}

const ALPACA_BASE_PAPER = 'https://paper-api.alpaca.markets';
const ALPACA_BASE_LIVE = 'https://api.alpaca.markets';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class BrokerService {
  private config: BrokerConfig | null = null;
  private baseUrl = ALPACA_BASE_PAPER;

  configure(config: BrokerConfig): void {
    this.config = config;
    if (config.provider === 'alpaca') {
      this.baseUrl = config.paperTrading ? ALPACA_BASE_PAPER : ALPACA_BASE_LIVE;
    }
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.keyId.length > 0;
  }

  isPaperTrading(): boolean {
    return this.config?.paperTrading ?? true;
  }

  private getHeaders(): Record<string, string> {
    if (!this.config) throw new Error('Broker not configured');
    return {
      'APCA-API-KEY-ID': this.config.keyId,
      'APCA-API-SECRET-KEY': this.config.secretKey,
      'Content-Type': 'application/json',
    };
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.config || !this.isConfigured()) {
      throw new Error('Broker not configured - please add API credentials in settings');
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/v2/account`, {
          headers: this.getHeaders(),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 401) throw new Error('Invalid API credentials');
          if (res.status === 429) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        return {
          id: data.id,
          status: data.status,
          equity: parseFloat(data.equity),
          cash: parseFloat(data.cash),
          buyingPower: parseFloat(data.buying_power),
          portfolioValue: parseFloat(data.portfolio_value),
          daytradeCount: data.daytrade_count ?? 0,
          patternDayTrader: data.pattern_day_trader ?? false,
        };
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(RETRY_DELAY_MS);
      }
    }

    throw new Error('Failed to fetch account after retries');
  }

  async submitOrder(order: ManagedOrder): Promise<BrokerOrderResponse> {
    if (!this.config || !this.isConfigured()) {
      return this.mockOrderSubmit(order);
    }

    const body: Record<string, unknown> = {
      symbol: order.symbol,
      qty: order.quantity.toString(),
      side: order.side,
      type: order.orderType,
      time_in_force: order.timeInForce,
      client_order_id: order.clientOrderId,
    };

    if (order.orderType === 'limit' || order.orderType === 'stop_limit') {
      body.limit_price = order.limitPrice?.toString();
    }
    if (order.orderType === 'stop' || order.orderType === 'stop_limit') {
      body.stop_price = order.stopPrice?.toString();
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/v2/orders`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = (err as { message?: string }).message ?? `HTTP ${res.status}`;

          if (res.status === 422) {
            return {
              brokerOrderId: '',
              status: 'rejected',
              filledQty: 0,
              submittedAt: new Date().toISOString(),
            };
          }

          if (res.status === 429) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }

          throw new Error(msg);
        }

        const data = await res.json();
        return {
          brokerOrderId: data.id,
          status: data.status,
          filledQty: parseFloat(data.filled_qty ?? '0'),
          filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
          submittedAt: data.submitted_at ?? new Date().toISOString(),
        };
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(RETRY_DELAY_MS);
      }
    }

    throw new Error('Max retries exceeded when submitting order');
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    if (!this.config || !this.isConfigured()) {
      return;
    }

    const res = await fetch(`${this.baseUrl}/v2/orders/${brokerOrderId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok && res.status !== 422) {
      throw new Error(`Cancel failed: HTTP ${res.status}`);
    }
  }

  async getOrderStatus(brokerOrderId: string): Promise<BrokerOrderResponse> {
    if (!this.config || !this.isConfigured()) {
      throw new Error('Broker not configured - cannot query order status without API credentials');
    }

    const res = await fetch(`${this.baseUrl}/v2/orders/${brokerOrderId}`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return {
      brokerOrderId: data.id,
      status: data.status,
      filledQty: parseFloat(data.filled_qty ?? '0'),
      filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      submittedAt: data.submitted_at,
    };
  }


  private mockOrderSubmit(order: ManagedOrder): BrokerOrderResponse {
    const latency = Math.floor(Math.random() * 80) + 20;

    // Realistic fill rates by order type based on market conditions:
    // - Market orders: 88% fill rate (highest chance, immediate execution)
    // - Limit orders: 70% fill rate (depends on price level matching)
    // - Stop orders: 70% fill rate (triggered on condition, then filled)
    // - Stop-limit: 60% fill rate (requires both condition AND price match)
    let rejectionThreshold: number;
    switch (order.orderType) {
      case 'market':
        rejectionThreshold = 0.12; // 88% fill rate
        break;
      case 'limit':
        rejectionThreshold = 0.30; // 70% fill rate
        break;
      case 'stop':
        rejectionThreshold = 0.30; // 70% fill rate
        break;
      case 'stop_limit':
        rejectionThreshold = 0.40; // 60% fill rate
        break;
      default:
        rejectionThreshold = 0.30; // 70% default realistic rate
    }

    return {
      brokerOrderId: `MOCK-${Date.now()}`,
      status: Math.random() > rejectionThreshold ? 'filled' : 'rejected',
      filledQty: order.quantity,
      filledAvgPrice: undefined,
      submittedAt: new Date(Date.now() - latency).toISOString(),
    };
  }
}

export const brokerService = new BrokerService();
