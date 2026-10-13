import { create } from 'zustand';
import { UserProfile } from '../types/game';
import { MOCK_ME } from './mock/mockGameService';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateUser: (partial: Partial<UserProfile>) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedToken = localStorage.getItem('zjh_token');
  const savedUser = localStorage.getItem('zjh_user');
  let initialUser: UserProfile = MOCK_ME;

  if (savedUser) {
    try {
      initialUser = JSON.parse(savedUser);
    } catch {
      // 容错处理
    }
  }

  return {
    token: savedToken || 'mock_jwt_token_for_dev',
    user: initialUser,
    isAuthenticated: true,

    login: (token, user) => {
      localStorage.setItem('zjh_token', token);
      localStorage.setItem('zjh_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    },

    logout: () => {
      localStorage.removeItem('zjh_token');
      localStorage.removeItem('zjh_user');
      set({ token: null, user: null, isAuthenticated: false });
    },

    updateUser: (partial) => {
      set((state) => {
        if (!state.user) return state;
        const updated = { ...state.user, ...partial };
        localStorage.setItem('zjh_user', JSON.stringify(updated));
        return { user: updated };
      });
    },
  };
});
