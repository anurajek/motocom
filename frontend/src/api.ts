import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

async function getToken(): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('motocom_token') : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync('motocom_token');
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  if (isWeb) {
    if (typeof window !== 'undefined') {
      if (token) window.localStorage.setItem('motocom_token', token);
      else window.localStorage.removeItem('motocom_token');
    }
    return;
  }
  if (token) await SecureStore.setItemAsync('motocom_token', token);
  else await SecureStore.deleteItemAsync('motocom_token').catch(() => {});
}

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL=https://motocom-backend.onrender.com;

export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') {
        msg = j.detail;
      } else if (Array.isArray(j.detail)) {
        // FastAPI 422 validation payload: [{msg, loc, type}, ...]
        msg = j.detail.map((d: any) => d?.msg || 'Invalid').join(', ');
      } else if (j.detail && typeof j.detail === 'object') {
        msg = j.detail.msg || JSON.stringify(j.detail);
      }
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export { getToken };
