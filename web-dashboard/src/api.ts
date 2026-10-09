import { API_URL } from './config';

const TOKEN_KEY = 'carteleria_token';

export const getToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* almacenamiento no disponible */ }
};

// fetch contra el backend con la sesión del usuario. Si el servidor dice que la sesión ya no vale, se cierra.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (token) {
    let expired = res.status === 401;
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => null);
      expired = typeof body?.error === 'string' && body.error.includes('suspendida');
    }
    if (expired) {
      setToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
  }
  return res;
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export interface Usage {
  screens: number;
  maxScreens: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

export interface Me {
  username: string;
  role: 'superadmin' | 'business';
  business: { id: string; name: string; usage: Usage } | null;
}
