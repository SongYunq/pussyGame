import type { AlgorithmConfig, SimulationResult } from '../../../server/src/shared/dealing';
import { UserProfile, LedgerItem } from '../types/game';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

const BASE_URL = '';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('zjh_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const resJson: ApiResponse<T> = await response.json();
  if (resJson.code !== 200) {
    throw new Error(resJson.message || '请求失败');
  }
  return resJson.data;
}

export const api = {
  // 鉴权模块
  login: (username: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getMe: () => request<UserProfile>('/api/auth/me'),

  // 个人资料与账本
  updateProfile: (data: { nickname: string; avatar: string }) =>
    request<{ nickname: string; avatar: string }>('/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getLedger: (page = 1, pageSize = 20) =>
    request<{ list: LedgerItem[]; total: number }>(`/api/user/ledger?page=${page}&pageSize=${pageSize}`),

  // 超级管理员专区
  adminCreateUser: (data: { username: string; password: string; nickname: string; avatar: string; initialChips: number; role?: 'player' | 'admin' }) =>
    request<{ id: number; username: string; balance: number }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminDeleteUser: (userId: number) =>
    request<{ message: string }>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  adminUpdateUser: (userId: number, data: { nickname?: string; avatar?: string; role?: 'player' | 'admin'; isBanned?: boolean }) =>
    request<UserProfile>(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  adminGetUsers: () =>
    request<Array<UserProfile & { isOnline: boolean; currentRoomId: string | null; isBanned?: boolean; createdAt: string }>>('/api/admin/users'),

  adminAdjustChips: (userId: number, amount: number, reason: string) =>
    request<{ userId: number; balance: number }>(`/api/admin/users/${userId}/chips`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    }),

  adminGetChipLogs: (page = 1, pageSize = 50) =>
    request<{ list: Array<{ id: number; userId: number; username: string; amount: number; balanceAfter: number; reason: string; createdAt: string; operator: string }>; total: number }>(`/api/admin/chips/logs?page=${page}&pageSize=${pageSize}`),

  adminResetPassword: (userId: number, newPassword: string) =>
    request<{ message: string }>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  adminGetAuditLogs: (page = 1, pageSize = 50) =>
    request<{ list: unknown[]; total: number }>(`/api/admin/audit-logs?page=${page}&pageSize=${pageSize}`),

  // 发牌算法调控
  adminGetAlgorithmConfig: () =>
    request<AlgorithmConfig>('/api/admin/algorithm/config'),

  adminSaveAlgorithmConfig: (config: AlgorithmConfig) =>
    request<AlgorithmConfig>('/api/admin/algorithm/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  adminSimulateAlgorithm: (rounds: number, playerCount: number, config: AlgorithmConfig) =>
    request<SimulationResult>('/api/admin/algorithm/simulate', {
      method: 'POST',
      body: JSON.stringify({ rounds, playerCount, config }),
    }),
};
