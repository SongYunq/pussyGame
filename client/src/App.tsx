import React, { useState, useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { LoginView } from './views/LoginView';
import { LobbyView } from './views/LobbyView';
import { TableView } from './views/TableView';
import { AdminDashboard } from './views/AdminDashboard';
import { LedgerDrawer } from './views/LedgerDrawer';
import { UserProfile } from './types/game';

type ViewMode = 'login' | 'lobby' | 'table' | 'admin';

export const App: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    if (!isAuthenticated) return 'login';
    if (user?.role === 'admin') return 'admin';
    return 'table';
  });
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  // 管理员账号强制进入管理中枢，管理员不打牌
  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin' && (currentView === 'table' || currentView === 'lobby')) {
      setCurrentView('admin');
    }
  }, [isAuthenticated, user, currentView]);

  const handleLoginSuccess = (loggedInUser: UserProfile) => {
    if (loggedInUser.role === 'admin') {
      setCurrentView('admin');
    } else {
      setCurrentView('table');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentView('login');
  };

  // 未登录时强制显示登录视图
  if (!isAuthenticated && currentView !== 'login') {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="h-full w-full bg-slate-950 font-sans antialiased text-slate-100 overflow-hidden flex flex-col">
      {currentView === 'login' && (
        <LoginView onLoginSuccess={handleLoginSuccess} />
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
        <AdminDashboard
          onLogout={handleLogout}
          onPreviewTable={() => setCurrentView('table')}
        />
      )}

      {/* 全局个人流水战绩抽屉 */}
      <LedgerDrawer isOpen={isLedgerOpen} onClose={() => setIsLedgerOpen(false)} />
    </div>
  );
};

export default App;
