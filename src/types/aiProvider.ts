export type AIProviderType = 'openai' | 'anthropic' | 'gemini' | 'custom';
export type AIModelRole = 'signal_generation' | 'risk_analysis' | 'market_sentiment' | 'strategy_optimization';

export interface AIProviderConfig {
  id: string;
  user_id: string;
  provider: AIProviderType;
  model_name: string;
  api_endpoint: string;
  api_key_masked: string;
  roles: AIModelRole[];
  is_active: boolean;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface AIPrediction {
  id: string;
  provider_id: string;
  strategy_id: string | null;
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  price_at_signal: number;
  indicators_snapshot: Record<string, number>;
  model_name: string;
  latency_ms: number;
  created_at: string;
}

export interface AISignalRequest {
  symbol: string;
  timeframe: string;
  candles: CandleData[];
  indicators: Record<string, number>;
  strategy_context?: string;
}

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AISignalResponse {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  suggested_sl?: number;
  suggested_tp?: number;
  key_factors: string[];
  latency_ms: number;
}

export interface AIProviderFormData {
  provider: AIProviderType;
  model_name: string;
  api_endpoint: string;
  api_key: string;
  roles: AIModelRole[];
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export const PROVIDER_DEFAULTS: Record<AIProviderType, { endpoint: string; models: string[]; defaultModel: string }> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    defaultModel: 'claude-3-5-haiku-20241022',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-1.5-flash',
  },
  custom: {
    endpoint: '',
    models: [],
    defaultModel: '',
  },
};

export const ROLE_LABELS: Record<AIModelRole, string> = {
  signal_generation: 'Signal Generation',
  risk_analysis: 'Risk Analysis',
  market_sentiment: 'Market Sentiment',
  strategy_optimization: 'Strategy Optimization',
};
