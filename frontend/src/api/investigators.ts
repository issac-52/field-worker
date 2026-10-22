import type { CreateInvestigator, PageRequest, PageResponse, User } from '../types';
import { call, json, query } from './client';

export const investigatorApi = {
  users: (signal?: AbortSignal) => call<User[]>('/users', { signal }),
  investigators: (params: PageRequest & { q?: string; status?: string }, signal?: AbortSignal) =>
    call<PageResponse<User>>('/admin/investigators' + query(params), { signal }),
  createInvestigator: (body: CreateInvestigator) => call<User>('/admin/investigators', json(body)),
  updateInvestigator: (id: number, body: { name?: string; active?: boolean }) =>
    call<User>(`/admin/investigators/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetInvestigatorPassword: (id: number, temporaryPassword: string) =>
    call<{ userId: number; mustChangePassword: boolean; resetAt: string }>(
      `/admin/investigators/${id}/reset-password`,
      json({ temporaryPassword }),
    ),
};
