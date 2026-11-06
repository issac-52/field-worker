import type { ApiResult } from '../types';
import { getDemoRole } from '../lib/auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrf: Promise<{ headerName: string; token: string }> | undefined;
export function resetCsrf() {
  csrf = undefined;
}
async function csrfToken() {
  csrf ??= fetch('/api/auth/csrf', { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error('보안 토큰을 가져오지 못했습니다.');
      const body = await response.json();
      return body.data;
    })
    .catch((error) => {
      csrf = undefined;
      throw error;
    });
  return csrf;
}
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (__MOCKS_ENABLED__) headers.set('X-Demo-Role', getDemoRole());
  else if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase())) {
    const token = await csrfToken();
    headers.set(token.headerName, token.token);
  }
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (
      !__MOCKS_ENABLED__ &&
      path !== '/me' &&
      path !== '/auth/login' &&
      (response.status === 401 || body.code === 'PASSWORD_CHANGE_REQUIRED')
    ) {
      resetCsrf();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('session-invalidated'));
    }
    throw new ApiError(
      response.status,
      body.code ?? 'HTTP_ERROR',
      body.message ?? `요청 실패 (${response.status})`,
    );
  }
  return response;
}
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  const body = (await response.json()) as ApiResult<T>;
  if (!body.success) throw new ApiError(response.status, body.code, body.message || '요청 실패');
  return body.data;
}
export const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
export function query(params: object) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return `?${search.toString()}`;
}
