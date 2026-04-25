import React, { useState } from 'react';
import {
  LayoutDashboard, TrendingUp, Bot, History, ShieldAlert,
  FlaskConical, Settings, ChevronLeft, ChevronRight,
  Activity, Wifi, Bell, User, LogOut, BookOpen, HeartPulse, Rocket, Brain, CandlestickChart,
  BarChart2, Clock, Newspaper
} from 'lucide-react';
import type { NavPage } from '../types/trading';
import { useAuth } from '../context/AuthContext';
import { useUserSettings } from '../hooks/useSupabaseData';
import { SessionClock } from './SessionClock';
import { NextNewsWidget } from './news/NextNewsWidget';
import { useNewsData } from '../hooks/useNewsData';

interface NavItem {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',        label: 'Dashboard',        icon: LayoutDashboard,   group: 'main' },
  { id: 'market_watch',     label: 'Market Watch',     icon: TrendingUp,        group: 'main' },
  { id: 'chart',            label: 'Chart',            icon: CandlestickChart,  group: 'main' },
  { id: 'news',             label: 'News Calendar',    icon: Newspaper,         group: 'main' },
  { id: 'paper_positions',  label: 'Positions',        icon: BarChart2,         group: 'paper' },
  { id: 'paper_history',    label: 'Paper History',    icon: Clock,             group: 'paper' },
  { id: 'strategies',       label: 'Strategies',       icon: Bot,       badge: 2, group: 'system' },
  { id: 'ai_engine',        label: 'AI Engine',        icon: Brain,             group: 'system' },
  { id: 'order_management', label: 'Order Management', icon: BookOpen,          group: 'system' },
  { id: 'trades',           label: 'Trade History',    icon: History,           group: 'system' },
  { id: 'risk',             label: 'Risk Monitor',     icon: ShieldAlert, badge: 1, group: 'system' },
  { id: 'backtesting',      label: 'Backtesting',      icon: FlaskConical,      group: 'system' },
  { id: 'system_health',    label: 'System Health',    icon: HeartPulse,        group: 'system' },
  { id: 'broker_demo',      label: 'Broker Demo',      icon: Rocket,            group: 'system' },
  { id: 'settings',         label: 'Settings',         icon: Settings,          group: 'system' },
];

const GROUP_LABELS: Record<string, string> = {
  main:   'Trading',
  paper:  'Paper',
  system: 'System',
};

interface LayoutProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  children: React.ReactNode;
}

export function Layout({ page, onNavigate, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const { settings } = useUserSettings();
  const { nextHigh } = useNewsData();

  const emailShort  = user?.email?.split('@')[0] ?? 'Trader';
  const brokerServer = settings?.broker_server as string | undefined;
  const brokerLabel  = brokerServer ? brokerServer.split(':')[0] : 'Demo Account';

  // Build grouped nav
  const groups = ['main', 'paper', 'system'];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} flex-shrink-0`}>

        {/* Logo */}
        <div className={`flex items-center h-16 px-4 border-b border-slate-800 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Activity size={16} className="text-slate-900" />
              </div>
              <span className="font-bold text-white tracking-tight">Fusion</span>
              <span className="text-emerald-400 font-bold text-xs">FX</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Activity size={16} className="text-slate-900" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className={`text-slate-500 hover:text-slate-300 transition-colors p-1 rounded ${collapsed ? 'hidden' : ''}`}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Session clock — only when expanded */}
        {!collapsed && <SessionClock />}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          {groups.map(group => {
            const items = NAV_ITEMS.filter(i => i.group === group);
            return (
              <div key={group}>
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                    {GROUP_LABELS[group]}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map(item => {
                    const Icon   = item.icon;
                    const active = page === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Icon size={18} className={active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'} />
                        {!collapsed && <span>{item.label}</span>}
                        {!collapsed && item.badge && (
                          <span className="ml-auto bg-emerald-500 text-slate-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {item.badge}
                          </span>
                        )}
                        {collapsed && item.badge && (
                          <span className="absolute top-1 right-1 bg-emerald-500 w-2 h-2 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/10">
            <Wifi size={14} className="text-emerald-400 flex-shrink-0" />
            {!collapsed && (
              <span className="text-xs font-medium text-emerald-400">MT5 Connected</span>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                  <User size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-300">{emailShort}</p>
                  <p className="text-xs text-slate-500">{brokerLabel}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">
              {NAV_ITEMS.find(n => n.id === page)?.label ?? 'Dashboard'}
            </h1>
            <p className="text-xs text-slate-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Next news countdown */}
            <NextNewsWidget nextHigh={nextHigh} onNavigate={onNavigate} />

            {/* Live badge */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span>Live</span>
            </div>

            {/* Bell */}
            <button className="relative text-slate-400 hover:text-slate-200 transition-colors p-2 rounded-lg hover:bg-slate-800">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
