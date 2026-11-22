import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setAuthToken } from '../lib/api';
import type { AuthUser } from '../../shared/types';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface AuthStatusInfo {
  hasAdmin: boolean;
  envBootstrapConfigured: boolean;
  supabaseConfigured: boolean;
  geminiConfigured: boolean;
  institutionName: string;
  activeAcademicYear: string;
  activeSemester: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  systemStatus: AuthStatusInfo | null;
  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  refreshUser: () => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
  loginAdmin: (identifier: string, password: string) => Promise<AuthUser>;
  bootstrapAdmin: (payload: {
    username: string;
    email?: string;
    fullName: string;
    password: string;
  }) => Promise<AuthUser>;
  loginStudent: (username: string, password: string) => Promise<{
    user: AuthUser;
    loginReward?: { xpAwarded: number; streakBonusAwarded: number; currentStreak: number };
  }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<AuthStatusInfo | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshSystemStatus = useCallback(async () => {
    try {
      const status = await apiRequest<AuthStatusInfo>('/api/auth/status');
      setSystemStatus(status);
    } catch {
      // ignore initial status fetch errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
      setAuthToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshSystemStatus(), refreshUser()]);
      setLoading(false);
    })();
  }, [refreshSystemStatus, refreshUser]);

  const loginAdmin = async (identifier: string, password: string) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const bootstrapAdmin = async (payload: {
    username: string;
    email?: string;
    fullName: string;
    password: string;
  }) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/admin/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    setUser(res.user);
    await refreshSystemStatus();
    return res.user;
  };

  const loginStudent = async (username: string, password: string) => {
    const res = await apiRequest<{
      token: string;
      user: AuthUser;
      loginReward?: { xpAwarded: number; streakBonusAwarded: number; currentStreak: number };
    }>('/api/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    return { user: res.user, loginReward: res.loginReward };
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        systemStatus,
        toasts,
        pushToast,
        dismissToast,
        refreshUser,
        refreshSystemStatus,
        loginAdmin,
        bootstrapAdmin,
        loginStudent,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
