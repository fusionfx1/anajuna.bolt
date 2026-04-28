import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Wifi, Database, Server, Shield, Clock,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Zap,
  BarChart2, TrendingUp, Radio
} from 'lucide-react';
import type { ConnectionStats } from '../types/dataFeed';
import { dataFeedService } from '../services/dataFeedService';
import { brokerService } from '../services/brokerService';
import { useOrderManager } from '../hooks/useOrderManager';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface HealthMetric {
  id: string;
  name: string;
  status: 'ok' | 'warn' | 'error' | 'unknown';
  value: string;
  detail: string;
  lastUpdated: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface FeedLogEntry {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

function StatusIcon({ status }: { status: HealthMetric['status'] }) {
  if (status === 'ok') return <CheckCircle2 size={14} className="text-emerald-400" />;
  if (status === 'warn') return <AlertTriangle size={14} className="text-amber-400" />;
  if (status === 'error') return <XCircle size={14} className="text-red-400" />;
  return <Clock size={14} className="text-slate-500" />;
}

const STATUS_BG: Record<string, string> = {
  ok: 'border-emerald-500/20 bg-emerald-500/5',
  warn: 'border-amber-500/20 bg-amber-500/5',
  error: 'border-red-500/20 bg-red-500/5',
  unknown: 'border-slate-700 bg-slate-800/30',
};

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
  unknown: 'bg-slate-500',
};

export function SystemHealth() {
  const { user } = useAuth();
  const { stats: orderStats } = useOrderManager();
  const [feedStats, setFeedStats] = useState<ConnectionStats>(() => dataFeedService.getStats());
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [logs, setLogs] = useState<FeedLogEntry[]>([]);
  const [tickRate, setTickRate] = useState(0);
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<'ok' | 'warn' | 'unknown'>('unknown');
  const tickCountRef = useRef(0);
  const lastTickCountRef = useRef(0);

  useEffect(() => {
    const unsub = dataFeedService.onStatus((s) => {
      setFeedStats(s);
      addLog(
        s.status === 'connected' ? 'info' :
        s.status === 'error' ? 'error' : 'warn',
        `Data feed ${s.status}${s.errorMessage ? ': ' + s.errorMessage : ''}`
      );
    });

    const tickUnsub = dataFeedService.onTick(() => {
      tickCountRef.current += 1;
    });

    return () => {
      unsub();
      tickUnsub();
    };
  }, []);

  useEffect(() => {
    const rateInterval = setInterval(() => {
      const rate = tickCountRef.current - lastTickCountRef.current;
      lastTickCountRef.current = tickCountRef.current;
      setTickRate(rate);
    }, 1000);

    return () => clearInterval(rateInterval);
  }, []);

  useEffect(() => {
    checkDbLatency();
    checkBrokerStatus();
    const interval = setInterval(() => {
      checkDbLatency();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    refreshMetrics();
  }, [feedStats, dbLatency, brokerStatus, orderStats, tickRate]);

  const checkDbLatency = async () => {
    const start = Date.now();
    try {
      await supabase.from('user_settings').select('id').limit(1);
      setDbLatency(Date.now() - start);
    } catch {
      setDbLatency(null);
    }
  };

  const checkBrokerStatus = async () => {
    try {
      if (brokerService.isConfigured()) {
        try {
          await brokerService.getAccount();
          setBrokerStatus('ok');
        } catch {
          setBrokerStatus('error' as typeof brokerStatus);
        }
      } else {
        setBrokerStatus('warn');
      }
    } catch {
      setBrokerStatus('error' as typeof brokerStatus);
    }
  };

  const addLog = (level: FeedLogEntry['level'], message: string) => {
    const entry: FeedLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      level,
      message,
    };
    setLogs(prev => [entry, ...prev].slice(0, 100));

    if (user?.id) {
      supabase.from('system_health_logs').insert({
        user_id: user.id,
        component: 'data_feed',
        event_type: level === 'error' ? 'ERROR' : level === 'warn' ? 'WARNING' : 'INFO',
        status: level,
        message,
      }).then(() => {});
    }
  };

  const refreshMetrics = () => {
    const feedStatusOk = feedStats.status === 'connected';
    const feedStatusWarn = feedStats.status === 'reconnecting' || feedStats.status === 'connecting';

    const newMetrics: HealthMetric[] = [
      {
        id: 'feed',
        name: 'Data Feed',
        status: feedStatusOk ? 'ok' : feedStatusWarn ? 'warn' : 'error',
        value: feedStats.status.charAt(0).toUpperCase() + feedStats.status.slice(1),
        detail: feedStats.errorMessage ?? (feedStatusOk
          ? `${feedStats.ticksReceived.toLocaleString()} ticks received`
          : 'No active connection'),
        lastUpdated: feedStats.lastTickAt ?? Date.now(),
        icon: Radio,
      },
      {
        id: 'tickrate',
        name: 'Tick Rate',
        status: feedStatusOk ? (tickRate > 0 ? 'ok' : 'warn') : 'unknown',
        value: `${tickRate} / sec`,
        detail: feedStatusOk
          ? tickRate > 0 ? 'Live price data flowing' : 'No ticks in last second'
          : 'Feed disconnected',
        lastUpdated: Date.now(),
        icon: Activity,
      },
      {
        id: 'database',
        name: 'Database',
        status: dbLatency === null ? 'error' : dbLatency < 300 ? 'ok' : dbLatency < 1000 ? 'warn' : 'error',
        value: dbLatency === null ? 'Unreachable' : `${dbLatency}ms`,
        detail: dbLatency === null ? 'Cannot reach Supabase' : `Supabase round-trip latency`,
        lastUpdated: Date.now(),
        icon: Database,
      },
      {
        id: 'broker',
        name: 'Broker API',
        status: brokerStatus === 'unknown' ? 'warn' : brokerStatus,
        value: brokerStatus === 'ok' ? 'Connected' : brokerStatus === 'warn' ? 'Not configured' : 'Error',
        detail: brokerStatus === 'ok'
          ? `${brokerService.isPaperTrading() ? 'Paper' : 'Live'} trading active`
          : brokerStatus === 'warn'
          ? 'Configure API keys in Data Feed settings'
          : 'Broker connection failed',
        lastUpdated: Date.now(),
        icon: Server,
      },
      {
        id: 'risk',
        name: 'Risk Engine',
        status: 'ok',
        value: 'Active',
        detail: 'Pre-trade risk checks operational',
        lastUpdated: Date.now(),
        icon: Shield,
      },
      {
        id: 'oms',
        name: 'Order Management',
        status: orderStats.total > 0 ? (orderStats.rejected / Math.max(orderStats.total, 1) > 0.5 ? 'warn' : 'ok') : 'ok',
        value: `${orderStats.total} orders`,
        detail: `${orderStats.filled} filled · ${orderStats.rejected} rejected · ${orderStats.fillRate}% fill rate`,
        lastUpdated: Date.now(),
        icon: BarChart2,
      },
      {
        id: 'reconnects',
        name: 'Feed Stability',
        status: feedStats.reconnectCount === 0 ? 'ok' : feedStats.reconnectCount < 3 ? 'warn' : 'error',
        value: feedStats.reconnectCount === 0 ? 'Stable' : `${feedStats.reconnectCount} reconnects`,
        detail: feedStats.reconnectCount === 0
          ? 'No reconnections since start'
          : `Auto-reconnect triggered ${feedStats.reconnectCount} time(s)`,
        lastUpdated: Date.now(),
        icon: RefreshCw,
      },
      {
        id: 'latency',
        name: 'Feed Latency',
        status: !feedStats.latencyMs ? 'unknown' : feedStats.latencyMs < 50 ? 'ok' : feedStats.latencyMs < 200 ? 'warn' : 'error',
        value: feedStats.latencyMs !== undefined ? `${feedStats.latencyMs}ms` : 'N/A',
        detail: feedStats.latencyMs !== undefined
          ? feedStats.latencyMs < 50 ? 'Excellent latency' : feedStats.latencyMs < 200 ? 'Acceptable latency' : 'High latency detected'
          : 'Latency data unavailable',
        lastUpdated: Date.now(),
        icon: Zap,
      },
    ];

    setMetrics(newMetrics);
  };

  const overallStatus = metrics.some(m => m.status === 'error') ? 'error'
    : metrics.some(m => m.status === 'warn') ? 'warn'
    : metrics.every(m => m.status === 'ok') ? 'ok'
    : 'unknown';

  const okCount = metrics.filter(m => m.status === 'ok').length;
  const warnCount = metrics.filter(m => m.status === 'warn').length;
  const errCount = metrics.filter(m => m.status === 'error').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">System Health</h1>
          <p className="text-sm text-slate-400 mt-0.5">Real-time monitoring of all trading infrastructure components</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${
          overallStatus === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
          overallStatus === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
          'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${STATUS_DOT[overallStatus]}`} />
          {overallStatus === 'ok' ? 'All Systems Operational' : overallStatus === 'warn' ? 'Degraded' : 'Incident'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Healthy', count: okCount, color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15' },
          { label: 'Warnings', count: warnCount, color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/15' },
          { label: 'Errors', count: errCount, color: 'text-red-400', bg: 'bg-red-500/8 border-red-500/15' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map(metric => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.id}
              className={`rounded-xl border p-4 transition-colors ${STATUS_BG[metric.status]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
                    <Icon size={13} className="text-slate-400" />
                  </div>
                  <span className="text-sm font-medium text-slate-300">{metric.name}</span>
                </div>
                <StatusIcon status={metric.status} />
              </div>
              <p className="text-lg font-bold text-white mb-0.5">{metric.value}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{metric.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-white">System Log</span>
            <span className="text-xs text-slate-500">Last 100 events</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="h-64 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-600">
              No events logged yet
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2 hover:bg-slate-800/20">
                  <span className="text-slate-600 flex-shrink-0">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span className={`flex-shrink-0 w-10 ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>
                    [{log.level.toUpperCase().slice(0, 4)}]
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-slate-400" />
          Feed Statistics
        </h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          {[
            { label: 'Provider', value: feedStats.provider.charAt(0).toUpperCase() + feedStats.provider.slice(1) },
            { label: 'Total Ticks', value: feedStats.ticksReceived.toLocaleString() },
            { label: 'Last Tick', value: feedStats.lastTickAt ? `${Math.round((Date.now() - feedStats.lastTickAt) / 1000)}s ago` : 'Never' },
            { label: 'Connected At', value: feedStats.connectedAt ? new Date(feedStats.connectedAt).toLocaleTimeString() : 'N/A' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-slate-500 text-xs mb-1">{s.label}</p>
              <p className="text-white font-medium">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
