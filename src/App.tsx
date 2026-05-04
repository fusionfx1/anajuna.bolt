import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProviderProvider } from './context/DataProviderContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { MarketWatch } from './components/MarketWatch';
import { Strategies } from './components/Strategies';
import { TradeHistory } from './components/TradeHistory';
import { RiskMonitor } from './components/RiskMonitor';
import { Backtesting } from './components/Backtesting';
import { Settings } from './components/Settings';
import { OrderManagement } from './components/OrderManagement';
import { SystemHealth } from './components/SystemHealth';
import { BrokerDemo } from './components/BrokerDemo';
import { AIEngine } from './components/AIEngine';
import { ChartPage } from './components/ChartPage';
import { PaperPositions } from './components/PaperPositions';
import { PaperHistory } from './components/PaperHistory';
import { NewsCalendar } from './components/NewsCalendar';
import type { NavPage } from './types/trading';
import { envError } from './lib/supabase';

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<NavPage>('dashboard');
  const [devMode] = useState(() => {
    // VITE_BYPASS_AUTH=true in Vercel env vars bypasses login (set in project settings, remove when ready)
    if (import.meta.env.VITE_BYPASS_AUTH === 'true') return true;
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      return localStorage.getItem('devMode') === 'true';
    }
    return false;
  });

  // Dev-only banner when env is not configured — allows UI work without a real Supabase project
  const devEnvBanner = envError && import.meta.env.DEV ? (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 text-sm font-semibold px-4 py-2 text-center">
      ⚠ DEV MODE: {envError} — Supabase calls will fail.
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !devMode) {
    return <LoginScreen />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':       return <Dashboard />;
      case 'market_watch':    return <MarketWatch />;
      case 'strategies':      return <Strategies />;
      case 'ai_engine':       return <AIEngine />;
      case 'order_management': return <OrderManagement />;
      case 'trades':          return <TradeHistory />;
      case 'risk':            return <RiskMonitor />;
      case 'backtesting':     return <Backtesting />;
      case 'system_health':   return <SystemHealth />;
      case 'settings':        return <Settings />;
      case 'broker_demo':     return <BrokerDemo />;
      case 'chart':           return <ChartPage />;
      case 'paper_positions': return <PaperPositions />;
      case 'paper_history':   return <PaperHistory />;
      case 'news':            return <NewsCalendar />;
      default:                return <Dashboard />;
    }
  };

  return (
    <>
      {devEnvBanner}
      <Layout page={page} onNavigate={setPage}>
        {renderPage()}
      </Layout>
    </>
  );
}

export default function App() {
  // Guard: if Supabase env vars are missing, block before any provider mounts.
  // Providers call supabase.auth.* on mount — a null client crashes the app.
  if (envError && !import.meta.env.DEV) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full p-8 bg-red-950 border border-red-500 rounded-lg text-center">
          <h1 className="text-xl font-bold text-red-400 mb-4">Configuration Error</h1>
          <p className="text-red-200 mb-4">{envError}</p>
          <p className="text-sm text-red-300">
            Add the missing variable to <code className="bg-red-900 px-1 rounded">.env.local</code>{' '}
            and restart the dev server or rebuild.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <DataProviderProvider>
        <AppContent />
      </DataProviderProvider>
    </AuthProvider>
  );
}
