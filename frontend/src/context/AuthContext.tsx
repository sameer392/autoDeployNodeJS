import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
interface Admin { id: number; email: string; name: string; }
interface AuthContextType {
  admin: Admin | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (e: string, p: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}
const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (token) {
      api.get('/auth/me', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => setAdmin(r.data))
        .catch(() => { localStorage.removeItem('token'); setToken(null); setAdmin(null); })
        .finally(() => setIsLoading(false));
    } else setIsLoading(false);
  }, [token]);
  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.accessToken);
    setToken(data.accessToken);
    setAdmin(data.admin);
  };
  const logout = () => { localStorage.removeItem('token'); setToken(null); setAdmin(null); };
  return (
    <AuthContext.Provider value={{ admin, token, isAuthenticated: !!token && !!admin, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
