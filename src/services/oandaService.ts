import type { ManagedOrder } from '../types/dataFeed';

export interface OandaConfig {
  accountId: string;
  apiToken: string;
  accountType: 'practice' | 'live';
}

export interface OandaAccount {
  id: string;
  currency: string;
  balance: number;
  unrealizedPL: number;
  nav: number;
  marginUsed: number;
  marginAvailable: number;
  openTradeCount: number;
  openPositionCount: number;
}

export interface OandaOrderResponse {
  brokerOrderId: string;
  status: string;
  filledQty: number;
  filledAvgPrice?: number;
  submittedAt: string;
}

const OANDA_PRACTICE_URL = 'https://api-fxpractice.oanda.com';
const OANDA_LIVE_URL = 'https://api-fxtrade.oanda.com';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

class OandaService {
  private config: OandaConfig | null = null;
  private baseUrl = OANDA_PRACTICE_URL;

  configure(config: OandaConfig): void {
    this.config = config;
    this.baseUrl = config.accountType === 'live' ? OANDA_LIVE_URL : OANDA_PRACTICE_URL;
  }

  isConfigured(): boolean {
    return (
      this.config !== null &&
      this.config.accountId.length > 0 &&
      this.config.apiToken.length > 0
    );
  }

  isPractice(): boolean {
    return this.config?.accountType !== 'live';
  }

  private getHeaders(): Record<string, string> {
    if (!this.config) throw new Error('OANDA not configured');
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
      'Accept-Datetime-Format': 'RFC3339',
    };
  }

  async getAccount(): Promise<OandaAccount> {
    if (!this.isConfigured()) {
      throw new Error('OANDA not configured - please add API credentials in settings');
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `${this.baseUrl}/v3/accounts/${this.config!.accountId}/summary`,
          { headers: this.getHeaders() }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 401) throw new Error('Invalid OANDA API token');
          if (res.status === 404) throw new Error('OANDA account not found');
          if (res.status === 429) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          throw new Error((err as { errorMessage?: string }).errorMessage ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        const acct = data.account;
        return {
          id: acct.id,
          currency: acct.currency,
          balance: parseFloat(acct.balance),
          unrealizedPL: parseFloat(acct.unrealizedPL),
          nav: parseFloat(acct.NAV),
          marginUsed: parseFloat(acct.marginUsed),
          marginAvailable: parseFloat(acct.marginAvailable),
          openTradeCount: acct.openTradeCount ?? 0,
          openPositionCount: acct.openPositionCount ?? 0,
        };
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(RETRY_DELAY_MS);
      }
    }

    throw new Error('Failed to fetch OANDA account after retries');
  }

  async submitOrder(order: ManagedOrder): Promise<OandaOrderResponse> {
    if (!this.isConfigured()) {
      return this.mockOrderSubmit(order);
    }

    const oandaSymbol = order.symbol.replace('/', '_');

    const body: Record<string, unknown> = {
      order: {
        type: order.orderType === 'market' ? 'MARKET' : 'LIMIT',
        instrument: oandaSymbol,
        units: order.side === 'buy'
          ? order.quantity.toString()
          : (-order.quantity).toString(),
        timeInForce: order.orderType === 'market' ? 'FOK' : this.mapTIF(order.timeInForce),
        clientExtensions: {
          id: order.clientOrderId,
          comment: order.strategyName ?? '',
        },
      },
    };

    if (order.orderType === 'limit' && order.limitPrice) {
      (body.order as Record<string, unknown>).price = order.limitPrice.toString();
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `${this.baseUrl}/v3/accounts/${this.config!.accountId}/orders`,
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { errorMessage?: string }).errorMessage ?? `HTTP ${res.status}`;

          if (res.status === 400) {
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
        const filled = data.orderFillTransaction;
        const created = data.orderCreateTransaction;

        if (filled) {
          return {
            brokerOrderId: filled.id,
            status: 'filled',
            filledQty: Math.abs(parseFloat(filled.units ?? order.quantity.toString())),
            filledAvgPrice: filled.price ? parseFloat(filled.price) : undefined,
            submittedAt: filled.time ?? new Date().toISOString(),
          };
        }

        return {
          brokerOrderId: created?.id ?? '',
          status: 'submitted',
          filledQty: 0,
          submittedAt: created?.time ?? new Date().toISOString(),
        };
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(RETRY_DELAY_MS);
      }
    }

    throw new Error('Max retries exceeded when submitting OANDA order');
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    if (!this.isConfigured()) return;

    const res = await fetchWithTimeout(
      `${this.baseUrl}/v3/accounts/${this.config!.accountId}/orders/${brokerOrderId}/cancel`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
      }
    );

    if (!res.ok && res.status !== 404) {
      throw new Error(`OANDA cancel failed: HTTP ${res.status}`);
    }
  }

  async getOrderStatus(brokerOrderId: string): Promise<OandaOrderResponse> {
    if (!this.isConfigured()) {
      throw new Error('OANDA not configured - cannot query order status without API credentials');
    }

    const res = await fetchWithTimeout(
      `${this.baseUrl}/v3/accounts/${this.config!.accountId}/orders/${brokerOrderId}`,
      { headers: this.getHeaders() }
    );

    if (!res.ok) throw new Error(`OANDA HTTP ${res.status}`);
    const data = await res.json();
    const o = data.order;

    return {
      brokerOrderId: o.id,
      status: o.state?.toLowerCase() ?? 'pending',
      filledQty: 0,
      submittedAt: o.createTime ?? new Date().toISOString(),
    };
  }

  private mapTIF(tif: string): string {
    const map: Record<string, string> = {
      day: 'GTC',
      gtc: 'GTC',
      ioc: 'IOC',
      fok: 'FOK',
    };
    return map[tif] ?? 'GTC';
  }

  private mockOrderSubmit(order: ManagedOrder): OandaOrderResponse {
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
      brokerOrderId: `OANDA-MOCK-${Date.now()}`,
      status: Math.random() > rejectionThreshold ? 'filled' : 'rejected',
      filledQty: order.quantity,
      filledAvgPrice: undefined,
      submittedAt: new Date().toISOString(),
    };
  }
}

export const oandaService = new OandaService();
