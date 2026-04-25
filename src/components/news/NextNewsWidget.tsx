import React, { useState, useEffect } from 'react';
import { Newspaper } from 'lucide-react';
import type { NavPage } from '../../types/trading';
import { minsUntil } from '../../hooks/useNewsData';
import type { NewsEvent } from '../../types/news';

interface Props {
  nextHigh: NewsEvent | null;
  onNavigate: (page: NavPage) => void;
}

export function NextNewsWidget({ nextHigh, onNavigate }: Props) {
  // Rerender every minute so the countdown stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!nextHigh || nextHigh.utcMs === null) {
    return (
      <button
        onClick={() => onNavigate('news')}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 bg-slate-800 px-2.5 py-1.5 rounded-lg transition-colors"
      >
        <Newspaper size={12} />
        <span>News</span>
      </button>
    );
  }

  const mins    = minsUntil(nextHigh.utcMs);
  const isClose = mins >= 0 && mins <= 30;
  const isPast  = mins < 0;

  let timeLabel: string;
  if (isPast) {
    timeLabel = 'Live';
  } else if (mins < 60) {
    timeLabel = `${mins}m`;
  } else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    timeLabel = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <button
      onClick={() => onNavigate('news')}
      className={`flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all duration-150 group ${
        isPast
          ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25 animate-pulse'
          : isClose
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
      }`}
      title={`${nextHigh.flag} ${nextHigh.title}`}
    >
      <Newspaper size={12} className="flex-shrink-0" />
      <span className="hidden sm:inline">
        {isPast ? 'News Live' : `News in ${timeLabel}`}
      </span>
      <span className="sm:hidden">{timeLabel}</span>
      {(isClose || isPast) && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isPast ? 'bg-red-400 animate-ping' : 'bg-amber-400 animate-pulse'
        }`} />
      )}
    </button>
  );
}
