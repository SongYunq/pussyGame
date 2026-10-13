import React, { useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { LoginView } from './views/LoginView';
import { LobbyView } from './views/LobbyView';
import { TableView } from './views/TableView';
import { AdminDashboard } from './views/AdminDashboard';
import { LedgerDrawer } from './views/LedgerDrawer';

type ViewMode = 'login' | 'lobby' | 'table' | 'admin';

export const App: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [currentView, setCurrentView] = useState<ViewMode>(isAuthenticated ? 'table' : 'login');
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  // 未登录时强制显示登录视图
  if (!isAuthenticated && currentView !== 'login') {
    return <LoginView onLoginSuccess={() => setCurrentView('table')} />;
  }

  return (
    <div className="h-full w-full bg-slate-950 font-sans antialiased text-slate-100">
      {currentView === 'login' && (
        <LoginView onLoginSuccess={() => setCurrentView('table')} />
      )}

      {currentView === 'lobby' && (
        <LobbyView
          onEnterRoom={(_roomId) => setCurrentView('table')}
          onOpenLedger={() => setIsLedgerOpen(true)}
          onOpenAdmin={() => setCurrentView('admin')}
        />
      )}

      {currentView === 'table' && (
        <TableView
          onBackToLobby={() => setCurrentView('lobby')}
          onOpenLedger={() => setIsLedgerOpen(true)}
          onOpenAdmin={() => setCurrentView('admin')}
        />
      )}

      {currentView === 'admin' && (
        <AdminDashboard onBack={() => setCurrentView('table')} />
      )}

      {/* 全局个人流水战绩抽屉 */}
      <LedgerDrawer isOpen={isLedgerOpen} onClose={() => setIsLedgerOpen(false)} />
    </div>
  );
};

export default App;
