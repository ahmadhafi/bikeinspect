import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  apiFetch,
  clearAllLocalDrafts,
  getStoredInspectorName,
  setStoredInspectorName,
} from '../lib/api';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  ocrMode: 'Demo' | 'Produksi';
  disableAuth: boolean;
  inspectorName: string;
  setInspectorName: (name: string) => void;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ocrMode, setOcrMode] = useState<'Demo' | 'Produksi'>('Demo');
  const [disableAuth, setDisableAuth] = useState(true);
  const [inspectorName, setInspectorNameState] = useState<string>(() => getStoredInspectorName());
  const [loading, setLoading] = useState(true);

  const setInspectorName = (name: string) => {
    setInspectorNameState(name);
    setStoredInspectorName(name);
    setUser((prev) => (prev ? { ...prev, nama: name.trim() || 'Petugas Lapangan' } : prev));
  };

  const refreshSession = async () => {
    try {
      const data = await apiFetch<{
        user: AuthUser;
        ocrMode: 'Demo' | 'Produksi';
        disableAuth?: boolean;
      }>('/api/auth/me');
      setUser(data.user);
      setOcrMode(data.ocrMode);
      setDisableAuth(Boolean(data.disableAuth));
    } catch {
      setUser(null);
      setDisableAuth(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiFetch<{ user: AuthUser; ocrMode: 'Demo' | 'Produksi' }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
    setOcrMode(data.ocrMode);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // tetap bersihkan sesi lokal
    }
    clearAllLocalDrafts();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ocrMode,
        disableAuth,
        inspectorName,
        setInspectorName,
        loading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return ctx;
}
