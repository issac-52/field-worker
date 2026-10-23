import type {
  Block,
  PageRequest,
  PageResponse,
  Phase,
  Site,
  SiteFilter,
  SiteListItem,
  SiteSummary,
  SitePhoto,
} from '../types';
import { call, json, query } from './client';

export const siteApi = {
  blocks: (signal?: AbortSignal) => call<Block[]>('/blocks', { signal }),
  sites: (params: SiteFilter & PageRequest = {}, signal?: AbortSignal) =>
    call<PageResponse<SiteListItem>>('/sites' + query(params), { signal }),
  summary: (params: SiteFilter = {}, signal?: AbortSignal) =>
    call<SiteSummary>('/site-summary' + query(params), { signal }),
  site: (id: number, signal?: AbortSignal) => call<Site>(`/sites/${id}`, { signal }),
  note: (id: number, note: string) =>
    call<Site>(`/sites/${id}/note`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  measurement: (
    id: number,
    body: { phase: Phase; date: string; reading: number; workerId: number },
  ) => call<Site>(`/sites/${id}/measurements`, json(body)),
  photos: (id: number, photos: SitePhoto[]) => call<Site>(`/sites/${id}/photos`, json({ photos })),
};
