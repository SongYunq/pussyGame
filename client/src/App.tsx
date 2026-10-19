import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useGameStore } from './store/useGameStore';
import { api } from './services/api';
import { socketService } from './services/socket';
import { LoginView } from './views/LoginView';
import { LobbyView } from './views/LobbyView';
import { TableView } from './views/TableView';
import { AdminDashboard } from './views/AdminDashboard';
import { LedgerDrawer } from './views/LedgerDrawer';

export const App: React.FC = () => {
  const { token, user, isAuthenticated, isRestoring, login, logout } = useAuthStore();
  const roomState = useGameStore(state => state.roomState);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  useEffect(() => {
    if (!isRestoring || !token) return;
    let active = true;
    api.getMe().then(profile => { if (active) login(token, profile); })
      .catch(() => { if (active) logout(); });
    return () => { active = false; };
  }, [isRestoring, token, login, logout]);

  useEffect(() => {
    if (!isAuthenticated || !token || !user) return;
    useGameStore.getState().setCurrentUser(user);
    socketService.connect(token);
    return () => { socketService.disconnect(); useGameStore.getState().reset(); };
  }, [isAuthenticated, token, user?.id]);

  if (isRestoring) return <div className="h-full flex items-center justify-center bg-slate-950 text-slate-300">正在验证登录状态…</div>;
  if (!isAuthenticated || !user) return <LoginView onLoginSuccess={() => {}} />;

  return <div className="h-full w-full bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
    {user.role === 'admin' ? <AdminDashboard onLogout={logout} /> : roomState ?
      <TableView onBackToLobby={() => { void socketService.leaveRoom().catch(() => {}); }} onOpenLedger={() => setLedgerOpen(true)} /> :
      <LobbyView onOpenLedger={() => setLedgerOpen(true)} onLogout={logout} />}
    <LedgerDrawer isOpen={ledgerOpen} onClose={() => setLedgerOpen(false)} />
  </div>;
};
export default App;
