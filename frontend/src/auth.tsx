import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api';

export type User = {
  user_id: string;
  email: string;
  name: string;
  bike?: string | null;
  picture?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  debugInfo: string;
  ...
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, name: string, bike?: string) => Promise<void>;
  applyToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState('starting');

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setDebugInfo('bootstrap:start');
    let finished = false;

    const hardTimeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        setDebugInfo((d) => d + ' | HARD_TIMEOUT_FIRED');
        setUser(null);
        setLoading(false);
      }
    }, 12000);

    try {
      setDebugInfo((d) => d + ' | getToken:start');
      const t = await getToken();
      setDebugInfo((d) => d + ` | getToken:done(${t ? 'has-token' : 'no-token'})`);
      if (!t) {
        setUser(null);
      } else {
        setDebugInfo((d) => d + ' | api/auth/me:start');
        const me = await api<User>('/auth/me');
        setDebugInfo((d) => d + ' | api/auth/me:done');
        setUser(me);
      }
    } catch (e: any) {
      setDebugInfo((d) => d + ` | ERROR:${e?.message || String(e)}`);
      setUser(null);
      setToken(null).catch(() => {});
    } finally {
      if (!finished) {
        finished = true;
        setLoading(false);
        setDebugInfo((d) => d + ' | finally:setLoading(false)');
      }
      clearTimeout(hardTimeout);
    }
  }, []);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signInEmail = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(res.token);
    setUser(res.user);
  };

  const registerEmail = async (email: string, password: string, name: string, bike?: string) => {
    const res = await api<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, bike }),
    });
    await setToken(res.token);
    setUser(res.user);
  };

  const applyToken = async (token: string) => {
    await setToken(token);
    const me = await api<User>('/auth/me');
    setUser(me);
  };

  const signOut = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    await setToken(null);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, debugInfo, signInEmail, registerEmail, applyToken, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
