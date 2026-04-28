export type ImpactLevel = 'low' | 'medium' | 'high';

export interface NewsEvent {
  title: string;
  country: string;
  flag: string;
  impact: ImpactLevel;
  forecast: string;
  previous: string;
  actual: string;
  /** UTC epoch ms — null for "All Day" events */
  utcMs: number | null;
}

export interface NewsApiResponse {
  ok: boolean;
  items: NewsEvent[];
  fetchedAt: number;
  error?: string;
}

// ── Trading session definitions (UTC hours) ───────────────────────────────────

export interface SessionDef {
  id: string;
  label: string;
  startUtcHour: number; // inclusive
  endUtcHour: number;   // exclusive
  color: string;
  textColor: string;
}

export const SESSIONS: SessionDef[] = [
  {
    id: 'tokyo',
    label: 'Tokyo',
    startUtcHour: 0,
    endUtcHour: 9,
    color: '#0ea5e9',
    textColor: '#7dd3fc',
  },
  {
    id: 'london',
    label: 'London',
    startUtcHour: 8,
    endUtcHour: 17,
    color: '#f59e0b',
    textColor: '#fcd34d',
  },
  {
    id: 'newyork',
    label: 'New York',
    startUtcHour: 13,
    endUtcHour: 22,
    color: '#10b981',
    textColor: '#6ee7b7',
  },
];

/** London + New York overlap: 13:00–17:00 UTC — highest volume */
export const OVERLAP_COLOR = '#8b5cf6';
