import { HttpResponse } from 'msw';
import type { Phase, Site } from '../types';
import { store } from './store';

export const ok = <T>(data: T) =>
  HttpResponse.json({
    success: true,
    code: '200',
    message: '요청이 성공적으로 처리되었습니다.',
    data,
  });
export const err = (message: string, status = 400) =>
  HttpResponse.json({ success: false, code: String(status), message, data: null }, { status });
export const isAdmin = (request: Request) => request.headers.get('X-Demo-Role') === 'ADMIN';
export const validPassword = (value: unknown) =>
  typeof value === 'string' && value.length >= 8 && value.length <= 64;
export const feeFor = (phase: Phase, date: string) =>
  [...store.feeRules]
    .reverse()
    .find((rule) => rule.phase === phase && rule.startDate <= date && rule.endDate >= date)
    ?.amount ?? 0;

export function publicSite(site: Site, request: Request) {
  if (isAdmin(request)) return site;
  return {
    ...site,
    inspections: Object.fromEntries(
      Object.entries(site.inspections).map(([phase, measurement]) => {
        const { fee, ...visible } = measurement;
        return [phase, visible];
      }),
    ),
  };
}
