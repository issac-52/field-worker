import type { ApiResult } from '../types';
import { getDemoRole } from '../lib/auth';

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': getDemoRole(), ...init?.headers },
  });
  const body = (await response.json()) as ApiResult<T>;
  if (!response.ok || !body.success) throw new Error(body.message || '요청 실패');
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
