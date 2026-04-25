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

interface ActiveSession {
  id: string;
  label: string;
  color: string;
}

function getActiveSessions(nowHour: number): ActiveSession[] {
  return SESSIONS.filter(s => {
    if (s.startUtcHour < s.endUtcHour) {
      return nowHour >= s.startUtcHour && nowHour < s.endUtcHour;
    }
    // Overnight wrap (not needed here but defensive)
    return nowHour >= s.startUtcHour || nowHour < s.endUtcHour;
  }).map(s => ({ id: s.id, label: s.label, color: s.color }));
}

// ── Session segment rendering ─────────────────────────────────────────────────

interface SegmentProps {
  startHour: number;
  endHour: number;
  color: string;
  opacity?: number;
}

function SessionSegment({ startHour, endHour, color, opacity = 0.25 }: SegmentProps) {
  return (
    <div
      className="absolute top-0 h-full rounded-sm"
      style={{
        left:  `${pct(startHour)}%`,
        width: `${pct(endHour - startHour)}%`,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

// ── Hour tick marks ───────────────────────────────────────────────────────────

const TICK_HOURS = [0, 4, 8, 12, 16, 20, 24];

// ── Main component ────────────────────────────────────────────────────────────

export function SessionClock() {
  const [nowFraction, setNowFraction] = useState(utcHourFraction);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setNowFraction(utcHourFraction());
    }, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const activeSessions = getActiveSessions(nowFraction);
  const isOverlap = activeSessions.some(s => s.id === 'london') &&
                    activeSessions.some(s => s.id === 'newyork');

  // UTC clock string
  const utcH = Math.floor(nowFraction);
  const utcM = Math.floor((nowFraction - utcH) * 60);
  const utcStr = `${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}`;

  return (
    <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 select-none">
      {/* Labels row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {SESSIONS.map(s => {
            const isActive = activeSessions.some(a => a.id === s.id);
            return (
              <span
                key={s.id}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all duration-300"
                style={{
                  color:           isActive ? s.textColor : '#475569',
                  backgroundColor: isActive ? `${s.color}20` : 'transparent',
                }}
              >
                {s.label}
              </span>
            );
          })}
          {isOverlap && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse"
              style={{ color: '#c4b5fd', backgroundColor: `${OVERLAP_COLOR}20` }}
            >
              Overlap ⚡
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-500">{utcStr} UTC</span>
      </div>

      {/* 24-hour bar */}
      <div className="relative h-3 bg-slate-800 rounded overflow-visible">

        {/* Session fills */}
        {SESSIONS.map(s => (
          <SessionSegment
            key={s.id}
            startHour={s.startUtcHour}
            endHour={s.endUtcHour}
            color={s.color}
            opacity={activeSessions.some(a => a.id === s.id) ? 0.35 : 0.15}
          />
        ))}

        {/* Overlap zone — London+NY: 13–17 UTC */}
        <SessionSegment
          startHour={13}
          endHour={17}
          color={OVERLAP_COLOR}
          opacity={isOverlap ? 0.5 : 0.2}
        />

        {/* Current-time red needle */}
        <div
          className="absolute top-0 h-full w-0.5 rounded-full z-10"
          style={{
            left: `${pct(nowFraction)}%`,
            backgroundColor: '#ef4444',
            boxShadow: '0 0 4px 1px rgba(239,68,68,0.6)',
          }}
        />

        {/* Hour ticks */}
        {TICK_HOURS.map(h => (
          <div
            key={h}
            className="absolute top-0 w-px h-full bg-slate-700/60"
            style={{ left: `${pct(h)}%` }}
          />
        ))}
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
