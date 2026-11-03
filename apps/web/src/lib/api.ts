import type { ApiError as ApiErrorBody } from '@suivi/shared';

// ------------------------------------------------------------------
// Client API — toutes les requêtes passent par /api (proxifié par Vite
// en dev, par le reverse proxy en prod). Le jeton de session est
// stocké en localStorage et joint en Bearer.
// ------------------------------------------------------------------

const TOKEN_KEY = 'suivid.token';
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible au serveur');
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    window.dispatchEvent(new Event('suivid:unauthorized'));
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  }
  if (!res.ok) {
    let body: ApiErrorBody = { error: `Erreur ${res.status}`, code: 'HTTP_' + res.status };
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* body non JSON */
    }
    throw new ApiError(res.status, body.code, body.error, body.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  login: (email: string, password: string) =>
    request<{ token: string; expiresIn: number; email: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string) =>
    request<{ token: string; expiresIn: number; email: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};
