/** Typed representation of a single agent's contribution before fusion. */
export interface AgentContribution {
  source: 'news' | 'fred' | 'sentiment' | 'technical';
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;      // 0..1
  reasoning: string;
  status: 'success' | 'warning' | 'error';
  agent_id: string;
  latency_ms: number;
  next_actions?: string[];
  artifacts?: [string, string][];
  version?: string;
}

/** Row from the agent_decisions Supabase table. */
export interface AgentDecision {
  id: string;
  decision_id: string;           // UUID from Python FusedSignal
  user_id: string | null;
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;            // 0..1
  reasoning: string;
  blockers: string[];
  contributions: AgentContribution[];
  signal_mode: 'rules' | 'agent' | string;
  created_at: string;            // ISO timestamp
}

export type SignalType = AgentDecision['signal_type'];
