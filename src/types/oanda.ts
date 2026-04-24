export interface OandaPosition {
  instrument: string;
  longUnits: number;
  longAvgPrice: number;
  longUnrealizedPL: number;
  longRealizedPL: number;
  shortUnits: number;
  shortAvgPrice: number;
  shortUnrealizedPL: number;
  shortRealizedPL: number;
  unrealizedPL: number;
  realizedPL: number;
}

export interface OandaTrade {
  tradeId: string;
  instrument: string;
  openTime: string;
  price: number;
  currentUnits: number;
  unrealizedPL: number;
  financing: number;
  state: 'OPEN' | 'CLOSED' | 'CLOSE_WHEN_TRADEABLE';
}

export interface OandaInstrument {
  name: string;
  displayName: string;
  pipLocation: number;
  minimumTradeSize: number;
  type: 'CURRENCY' | 'CFD' | 'METAL';
}

export interface OandaPricingTick {
  type: 'PRICE' | 'HEARTBEAT';
  instrument: string;
  time: string;
  tradeable: boolean;
  bids: { price: string; liquidity: number }[];
  asks: { price: string; liquidity: number }[];
  closeoutBid: string;
  closeoutAsk: string;
}
