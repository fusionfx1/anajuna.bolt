import type { ManagedOrder } from '../types/dataFeed';
import type { OandaPosition, OandaTrade, OandaInstrument, OandaPricingTick } from '../types/oanda';

export type { OandaPosition, OandaTrade, OandaInstrument, OandaPricingTick };

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

type PricingTickHandler = (tick: OandaPricingTick) => void;

const OANDA_PRACTICE_URL = 'https://api-fxpractice.oanda.com';
const OANDA_LIVE_URL = 'https://api-fxtrade.oanda.com';
const OANDA_STREAM_PRACTICE_URL = 'https://stream-fxpractice.oanda.com';
const OANDA_STREAM_LIVE_URL = 'https://stream-fxtrade.oanda.com';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class OandaService {
  private config: OandaConfig | null = null;
  private baseUrl = OANDA_PRACTICE_URL;
  private streamBaseUrl = OANDA_STREAM_PRACTICE_URL;
  private streamAbortController: AbortController | null = null;
  private pricingTickHandlers = new Set<PricingTickHandler>();

  constructor() {
    const accountId = import.meta.env.VITE_OANDA_ACCOUNT_ID as string | undefined;
    const apiToken = import.meta.env.VITE_OANDA_ACCESS_TOKEN as string | undefined;
    const baseUrl = import.meta.env.VITE_OANDA_BASE_URL as string | undefined;

    if (accountId && apiToken) {
      const accountType = baseUrl?.includes('fxtrade') ? 'live' : 'practice';
      this.configure({ accountId, apiToken, accountType });
    }
  }

  configure(config: OandaConfig): void {
    this.config = config;
    this.baseUrl = config.accountType === 'live' ? OANDA_LIVE_URL : OANDA_PRACTICE_URL;
    this.streamBaseUrl = config.accountType === 'live' ? OANDA_STREAM_LIVE_URL : OANDA_STREAM_PRACTICE_URL;
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

  getAccountId(): string {
    return this.config?.accountId ?? '';
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
      return this.mockAccount();
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(
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

    return this.mockAccount();
  }

  async getOpenPositions(): Promise<OandaPosition[]> {
    if (!this.isConfigured()) {
      return this.mockPositions();
    }

    const res = await fetch(
      `${this.baseUrl}/v3/accounts/${this.config!.accountId}/openPositions`,
      { headers: this.getHeaders() }
    );

    if (!res.ok) throw new Error(`OANDA positions HTTP ${res.status}`);
    const data = await res.json();

    return (data.positions ?? []).map((p: Record<string, unknown>) => {
      const long = p.long as Record<string, unknown>;
      const short = p.short as Record<string, unknown>;
      const longUnits = parseFloat((long?.units as string) ?? '0');
      const shortUnits = Math.abs(parseFloat((short?.units as string) ?? '0'));
      const longUPL = parseFloat((long?.unrealizedPL as string) ?? '0');
      const shortUPL = parseFloat((short?.unrealizedPL as string) ?? '0');
      const longRPL = parseFloat((long?.pl as string) ?? '0');
      const shortRPL = parseFloat((short?.pl as string) ?? '0');

      return {
        instrument: p.instrument as string,
        longUnits,
        longAvgPrice: parseFloat((long?.averagePrice as string) ?? '0'),
        longUnrealizedPL: longUPL,
        longRealizedPL: longRPL,
        shortUnits,
        shortAvgPrice: parseFloat((short?.averagePrice as string) ?? '0'),
        shortUnrealizedPL: shortUPL,
        shortRealizedPL: shortRPL,
        unrealizedPL: longUPL + shortUPL,
        realizedPL: longRPL + shortRPL,
      } satisfies OandaPosition;
    });
  }

  async getOpenTrades(): Promise<OandaTrade[]> {
    if (!this.isConfigured()) {
      return this.mockTrades();
    }

    const res = await fetch(
      `${this.baseUrl}/v3/accounts/${this.config!.accountId}/openTrades`,
      { headers: this.getHeaders() }
    );

    if (!res.ok) throw new Error(`OANDA trades HTTP ${res.status}`);
    const data = await res.json();

    return (data.trades ?? []).map((t: Record<string, unknown>) => ({
      tradeId: t.id as string,
      instrument: t.instrument as string,
      openTime: t.openTime as string,
      price: parseFloat(t.price as string),
      currentUnits: parseFloat(t.currentUnits as string),
      unrealizedPL: parseFloat(t.unrealizedPL as string),
      financing: parseFloat((t.financing as string) ?? '0'),
      state: (t.state as OandaTrade['state']) ?? 'OPEN',
    } satisfies OandaTrade));
  }

  async getInstruments(): Promise<OandaInstrument[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const res = await fetch(
      `${this.baseUrl}/v3/accounts/${this.config!.accountId}/instruments`,
      { headers: this.getHeaders() }
    );

    if (!res.ok) throw new Error(`OANDA instruments HTTP ${res.status}`);
    const data = await res.json();

    return (data.instruments ?? []).map((i: Record<string, unknown>) => ({
      name: i.name as string,
      displayName: i.displayName as string,
      pipLocation: i.pipLocation as number,
      minimumTradeSize: parseFloat((i.minimumTradeSize as string) ?? '1'),
      type: i.type as OandaInstrument['type'],
    } satisfies OandaInstrument));
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
        const res = await fetch(
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

    const res = await fetch(
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
      return {
        brokerOrderId,
        status: 'filled',
        filledQty: 1,
        submittedAt: new Date().toISOString(),
      };
    }

    const res = await fetch(
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

  // Streaming pricing — newline-delimited JSON via OANDA streaming API
  async connectPricingStream(symbols: string[]): Promise<void> {
    if (!this.isConfigured() || symbols.length === 0) return;
    this.disconnectStream();

    const instruments = symbols
      .map(s => s.replace('/', '_'))
      .join(',');

    this.streamAbortController = new AbortController();
    const { signal } = this.streamAbortController;

    // Run stream in background — errors are silently caught to avoid unhandled rejections
    this.runStream(instruments, signal).catch(() => undefined);
  }

  private async runStream(instruments: string, signal: AbortSignal): Promise<void> {
    const url = `${this.streamBaseUrl}/v3/accounts/${this.config!.accountId}/pricing/stream?instruments=${instruments}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config!.apiToken}`,
        'Accept-Datetime-Format': 'RFC3339',
      },
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`OANDA stream HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const tick = JSON.parse(trimmed) as OandaPricingTick;
            if (tick.type === 'PRICE') {
              this.pricingTickHandlers.forEach(h => h(tick));
            }
          } catch {
            // Malformed JSON chunk — skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  disconnectStream(): void {
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
  }

  onPricingTick(handler: PricingTickHandler): () => void {
    this.pricingTickHandlers.add(handler);
    return () => this.pricingTickHandlers.delete(handler);
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

  private mockAccount(): OandaAccount {
    return {
      id: 'practice-001',
      currency: 'USD',
      balance: 100000.0,
      unrealizedPL: 243.15,
      nav: 100243.15,
      marginUsed: 1250.0,
      marginAvailable: 98993.15,
      openTradeCount: 2,
      openPositionCount: 2,
    };
  }

  private mockPositions(): OandaPosition[] {
    return [
      {
        instrument: 'EUR_USD',
        longUnits: 10000,
        longAvgPrice: 1.08520,
        longUnrealizedPL: 22.00,
        longRealizedPL: 0,
        shortUnits: 0,
        shortAvgPrice: 0,
        shortUnrealizedPL: 0,
        shortRealizedPL: 0,
        unrealizedPL: 22.00,
        realizedPL: 0,
      },
      {
        instrument: 'GBP_USD',
        longUnits: 0,
        longAvgPrice: 0,
        longUnrealizedPL: 0,
        longRealizedPL: 0,
        shortUnits: 5000,
        shortAvgPrice: 1.26540,
        shortUnrealizedPL: 62.50,
        shortRealizedPL: 0,
        unrealizedPL: 62.50,
        realizedPL: 0,
      },
    ];
  }

  private mockTrades(): OandaTrade[] {
    return [
      {
        tradeId: 'MOCK-001',
        instrument: 'EUR_USD',
        openTime: new Date(Date.now() - 3600000).toISOString(),
        price: 1.08520,
        currentUnits: 10000,
        unrealizedPL: 22.00,
        financing: -0.15,
        state: 'OPEN',
      },
      {
        tradeId: 'MOCK-002',
        instrument: 'GBP_USD',
        openTime: new Date(Date.now() - 7200000).toISOString(),
        price: 1.26540,
        currentUnits: -5000,
        unrealizedPL: 62.50,
        financing: -0.08,
        state: 'OPEN',
      },
    ];
  }

  private mockOrderSubmit(order: ManagedOrder): OandaOrderResponse {
    return {
      brokerOrderId: `OANDA-MOCK-${Date.now()}`,
      status: 'filled',
      filledQty: order.quantity,
      filledAvgPrice: undefined,
      submittedAt: new Date().toISOString(),
    };
  }
}

export const oandaService = new OandaService();
