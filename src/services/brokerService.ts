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

  /**
   * Throws when the caller is in live trading mode and credentials are
   * missing or incomplete. In paper mode this is a no-op so demos can run
   * against the in-memory mock account.
   */
  private assertLiveCredentialsIfRequired(action: string): void {
    if (this.config && this.config.paperTrading === false && !this.isConfigured()) {
      throw new Error(
        `Cannot ${action} in LIVE trading mode: Alpaca API key id and secret are required. ` +
          `Configure credentials in Data Feed settings or switch to paper trading.`,
      );
    }
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
    this.assertLiveCredentialsIfRequired('fetch account');
    if (!this.config || !this.isConfigured()) {
      return this.mockAccount();
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

    return this.mockAccount();
  }

  async submitOrder(order: ManagedOrder): Promise<BrokerOrderResponse> {
    this.assertLiveCredentialsIfRequired('submit order');
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
    this.assertLiveCredentialsIfRequired('cancel order');
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
    this.assertLiveCredentialsIfRequired('fetch order status');
    if (!this.config || !this.isConfigured()) {
      return {
        brokerOrderId,
        status: 'filled',
        filledQty: 1,
        submittedAt: new Date().toISOString(),
      };
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

  private mockAccount(): BrokerAccount {
    return {
      id: 'paper-account-001',
      status: 'ACTIVE',
      equity: 10842.30,
      cash: 8450.20,
      buyingPower: 33800.80,
      portfolioValue: 10842.30,
      daytradeCount: 1,
      patternDayTrader: false,
    };
  }

  private mockOrderSubmit(order: ManagedOrder): BrokerOrderResponse {
    const latency = Math.floor(Math.random() * 80) + 20;
    return {
      brokerOrderId: `MOCK-${Date.now()}`,
      status: Math.random() > 0.05 ? 'filled' : 'rejected',
      filledQty: order.quantity,
      filledAvgPrice: undefined,
      submittedAt: new Date(Date.now() - latency).toISOString(),
    };
  }
}

export const brokerService = new BrokerService();
