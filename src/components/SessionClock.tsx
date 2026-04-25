import React, { useState, useEffect, useRef } from 'react';
import { SESSIONS, OVERLAP_COLOR } from '../types/news';

// ── Helpers ───────────────────────────────────────────────────────────────────

function utcHourFraction(): number {
  const now = new Date();
  return now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
}

function pct(hour: number): number {
  return (hour / 24) * 100;
}

function getActiveSessions(nowHour: number) {
  return SESSIONS.filter(s => nowHour >= s.startUtcHour && nowHour < s.endUtcHour);
}

const TICK_HOURS = [0, 4, 8, 12, 16, 20, 24];

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionClock() {
  const [nowFraction, setNowFraction] = useState(utcHourFraction);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowFraction(utcHourFraction()), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const activeSessions = getActiveSessions(nowFraction);
  const isOverlap = activeSessions.some(s => s.id === 'london') &&
                    activeSessions.some(s => s.id === 'newyork');

  const utcH = Math.floor(nowFraction);
  const utcM = Math.floor((nowFraction - utcH) * 60);
  const utcStr = `${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}`;

  return (
    <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 select-none">
      {/* Session name chips */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {SESSIONS.map(s => {
            const isActive = activeSessions.some(a => a.id === s.id);
            return (
              <span
                key={s.id}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all duration-300"
                style={{
                  color:           isActive ? s.textColor : '#475569',
                  backgroundColor: isActive ? `${s.color}25` : 'transparent',
                }}
              >
                {s.label}
              </span>
            );
          })}
          {isOverlap && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse"
              style={{ color: '#c4b5fd', backgroundColor: `${OVERLAP_COLOR}25` }}
            >
              Overlap ⚡
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-500 ml-2 flex-shrink-0">{utcStr} UTC</span>
      </div>

      {/* 24-hour bar */}
      <div className="relative h-3 bg-slate-800 rounded overflow-hidden">
        {/* Session fills */}
        {SESSIONS.map(s => {
          const isActive = activeSessions.some(a => a.id === s.id);
          return (
            <div
              key={s.id}
              className="absolute top-0 h-full"
              style={{
                left:            `${pct(s.startUtcHour)}%`,
                width:           `${pct(s.endUtcHour - s.startUtcHour)}%`,
                backgroundColor: s.color,
                opacity:         isActive ? 0.38 : 0.14,
              }}
            />
          );
        })}

        {/* Overlap zone 13–17 UTC */}
        <div
          className="absolute top-0 h-full"
          style={{
            left:            `${pct(13)}%`,
            width:           `${pct(4)}%`,
            backgroundColor: OVERLAP_COLOR,
            opacity:         isOverlap ? 0.55 : 0.2,
          }}
        />

        {/* Hour tick marks */}
        {TICK_HOURS.map(h => (
          <div
            key={h}
            className="absolute top-0 h-full w-px bg-slate-700/50"
            style={{ left: `${pct(h)}%` }}
          />
        ))}

        {/* Current-time red needle — rendered on top, outside overflow:hidden clip via z-index */}
        <div
          className="absolute top-0 h-full w-0.5 z-10"
          style={{
            left:            `${pct(nowFraction)}%`,
            backgroundColor: '#ef4444',
            boxShadow:       '0 0 4px 1px rgba(239,68,68,0.55)',
          }}
        />
      </div>

      {/* Hour labels */}
      <div className="relative mt-0.5" style={{ height: 12 }}>
        {TICK_HOURS.map(h => (
          <span
            key={h}
            className="absolute text-[9px] text-slate-600 font-mono"
            style={{
              left:      `${pct(h)}%`,
              transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}
