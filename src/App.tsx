import React, { useState } from 'react';
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

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<NavPage>('dashboard');
  const [devMode] = useState(() => {
    // Enable dev mode if localStorage has devMode=true (for testing without auth)
    if (typeof window !== 'undefined') {
      const dev = localStorage.getItem('devMode') === 'true';
      if (dev) console.log('[Dev Mode] Auth bypass enabled');
      return dev;
    }
    return false;
  });

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
    <Layout page={page} onNavigate={setPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DataProviderProvider>
        <AppContent />
      </DataProviderProvider>
    </AuthProvider>
  );
}
