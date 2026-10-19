import { create } from 'zustand';
import { UserProfile } from '../types/game';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateUser: (partial: Partial<UserProfile>) => void;
}

const storage = typeof localStorage === 'undefined' ? null : localStorage;
const storedToken = storage?.getItem('zjh_token') ?? null;
const savedToken = storedToken && !storedToken.startsWith('mock_') && storedToken.split('.').length === 3 ? storedToken : null;
if (!savedToken) {
  storage?.removeItem('zjh_token');
  storage?.removeItem('zjh_user');
}

export const useAuthStore = create<AuthState>((set) => ({
  token: savedToken,
  user: null,
  isAuthenticated: false,
  isRestoring: Boolean(savedToken),
  login: (token, user) => {
    storage?.setItem('zjh_token', token);
    storage?.setItem('zjh_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isRestoring: false });
  },
  logout: () => {
    storage?.removeItem('zjh_token');
    storage?.removeItem('zjh_user');
    set({ token: null, user: null, isAuthenticated: false, isRestoring: false });
  },
  updateUser: partial => set(state => {
    if (!state.user) return state;
    const user = { ...state.user, ...partial };
    storage?.setItem('zjh_user', JSON.stringify(user));
    return { user };
  }),
}));
