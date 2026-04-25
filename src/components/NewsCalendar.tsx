import React, { useState, useMemo } from 'react';
import { RefreshCw, AlertCircle, Newspaper, Filter } from 'lucide-react';
import { useNewsData, fmtTimeBangkok, fmtDateBangkok, minsUntil } from '../hooks/useNewsData';
import type { NewsEvent, ImpactLevel } from '../types/news';

// ── Impact badge ──────────────────────────────────────────────────────────────

const IMPACT_STYLES: Record<ImpactLevel, { bg: string; text: string; dot: string; label: string }> = {
  high:   { bg: 'bg-red-500/15',   text: 'text-red-400',   dot: 'bg-red-400',   label: 'High' },
  medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400', label: 'Med'  },
  low:    { bg: 'bg-slate-700/60', text: 'text-slate-500', dot: 'bg-slate-500', label: 'Low'  },
};

function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  const s = IMPACT_STYLES[impact];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── News row ──────────────────────────────────────────────────────────────────

function NewsRow({ event }: { event: NewsEvent }) {
  const mins       = event.utcMs !== null ? minsUntil(event.utcMs) : null;
  const isImminent = mins !== null && mins >= 0 && mins <= 30;
  const isLive     = mins !== null && mins < 0 && mins > -60;

  const rowBg = isLive
    ? 'bg-red-500/8 border-l-2 border-red-500/50'
    : isImminent
    ? 'bg-amber-500/8 border-l-2 border-amber-500/40'
    : 'border-l-2 border-transparent';

  const timeStr = event.utcMs !== null ? fmtTimeBangkok(event.utcMs) : 'All Day';

  return (
    <tr className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${rowBg}`}>
      <td className="px-4 py-3 text-sm font-mono text-slate-400 whitespace-nowrap">
        {timeStr}
        {isLive && (
          <span className="ml-1.5 text-[10px] text-red-400 font-semibold animate-pulse"> Live</span>
        )}
        {isImminent && !isLive && (
          <span className="ml-1.5 text-[10px] text-amber-400 font-semibold">in {mins}m</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-base leading-none">{event.flag}</span>
        <span className="ml-1.5 text-xs text-slate-500 font-mono">{event.country}</span>
      </td>
      <td className="px-4 py-3">
        <p className={`text-sm font-medium ${event.impact === 'high' ? 'text-slate-100' : 'text-slate-300'}`}>
          {event.title}
        </p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <ImpactBadge impact={event.impact} />
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400 text-right">
        {event.forecast || <span className="text-slate-700">—</span>}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400 text-right">
        {event.previous || <span className="text-slate-700">—</span>}
      </td>
      <td className="px-4 py-3 text-sm font-mono font-semibold text-right">
        {event.actual
          ? <span className="text-emerald-400">{event.actual}</span>
          : <span className="text-slate-700">—</span>}
      </td>
    </tr>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={7}
        className="px-4 py-2 bg-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-widest"
      >
        {label}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function NewsCalendar() {
  const { events, loading, error, refresh } = useNewsData();
  const [highOnly, setHighOnly] = useState(false);

  const grouped = useMemo(() => {
    const filtered = highOnly ? events.filter(e => e.impact === 'high') : events;
    const days = new Map<string, NewsEvent[]>();
    for (const ev of filtered) {
      const key = ev.utcMs !== null ? fmtDateBangkok(ev.utcMs) : 'All Day / TBD';
      if (!days.has(key)) days.set(key, []);
      days.get(key)!.push(ev);
    }
    return days;
  }, [events, highOnly]);

  const totalHigh = events.filter(e => e.impact === 'high').length;
  const now = Date.now();
  const nextImminent = events.find(e => e.impact === 'high' && e.utcMs !== null && e.utcMs > now);

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper size={18} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-200">Economic Calendar</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Asia/Bangkok (UTC+7) · This week · {totalHigh} high-impact events
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle */}
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <button
              role="switch"
              aria-checked={highOnly}
              onClick={() => setHighOnly(v => !v)}
              className={`relative inline-flex h-[18px] w-8 flex-shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
                highOnly ? 'bg-red-500 border-red-500' : 'bg-slate-700 border-slate-600'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 mt-px ${
                  highOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors flex items-center gap-1">
              <Filter size={11} />
              High impact only
            </span>
          </label>

          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Next high-impact callout */}
      {nextImminent && nextImminent.utcMs !== null && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <span className="text-lg">{nextImminent.flag}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300 truncate">{nextImminent.title}</p>
            <p className="text-xs text-amber-500/80">
              {nextImminent.country} · {fmtTimeBangkok(nextImminent.utcMs)} BKK · in {minsUntil(nextImminent.utcMs)} min
            </p>
          </div>
          <ImpactBadge impact="high" />
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={16} /> {error}
            </div>
            <button onClick={refresh} className="text-xs text-emerald-400 hover:text-emerald-300 underline">
              Retry
            </button>
          </div>
        ) : grouped.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Newspaper size={32} className="text-slate-700" />
            <p className="text-sm text-slate-500">No events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-4 py-3">Time (BKK)</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Impact</th>
                  <th className="px-4 py-3 text-right">Forecast</th>
                  <th className="px-4 py-3 text-right">Previous</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([day, dayEvents]) => (
                  <React.Fragment key={day}>
                    <DayHeader label={day} />
                    {dayEvents.map((ev, i) => (
                      <NewsRow key={`${ev.title}-${ev.utcMs ?? i}`} event={ev} />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm border-l-2 border-red-500 bg-red-500/15" />
          Live event
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm border-l-2 border-amber-500 bg-amber-500/15" />
          Within 30 min
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Actual released
        </span>
      </div>
    </div>
  );
}
