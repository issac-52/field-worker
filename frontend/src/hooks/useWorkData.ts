import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Role, SiteFilter, SettlementFilter, SiteSummary } from '../types';

const EMPTY_SUMMARY: SiteSummary = {
  total: 0,
  done: 0,
  progress: 0,
  todo: 0,
  startCount: 0,
  endCount: 0,
  ownStartCount: 0,
  ownEndCount: 0,
  workers: [],
};
export function useWorkData({
  role,
  page,
  selected,
  siteFilter,
  settlementFilter,
  listPage,
  settlementPage,
}: {
  role: Role;
  page: string;
  selected: number;
  siteFilter: SiteFilter;
  settlementFilter: SettlementFilter;
  listPage: number;
  settlementPage: number;
}) {
  const client = useQueryClient();
  const listEnabled = ['home', 'sites', 'map'].includes(page);
  const ruleEnabled = role === 'ADMIN' && page === 'fees';
  const settlementEnabled = role === 'ADMIN' && page === 'settlements';
  const summaryEnabled = !['detail', 'investigators'].includes(page);
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: ({ signal }) => api.blocks(signal),
  });
  const users = useQuery({
    queryKey: ['users', role],
    queryFn: ({ signal }) => api.users(signal),
  });
  const summary = useQuery({
    queryKey: ['summary', role, siteFilter],
    queryFn: ({ signal }) => api.summary(siteFilter, signal),
    enabled: summaryEnabled,
  });
  const sites = useQuery({
    queryKey: ['sites', role, siteFilter, listPage, page === 'home'],
    queryFn: ({ signal }) =>
      api.sites({ ...siteFilter, page: listPage, pageSize: page === 'home' ? 4 : 20 }, signal),
    enabled: listEnabled,
  });
  const target = useQuery({
    queryKey: ['site', role, selected],
    queryFn: ({ signal }) => api.site(selected, signal),
    enabled: page === 'detail',
  });
  const rules = useQuery({
    queryKey: ['rules', role],
    queryFn: ({ signal }) => api.rules(signal),
    enabled: ruleEnabled,
  });
  const settlements = useQuery({
    queryKey: ['settlements', role, settlementFilter, settlementPage],
    queryFn: ({ signal }) =>
      api.settlements({ ...settlementFilter, page: settlementPage, pageSize: 20 }, signal),
    enabled: settlementEnabled,
  });
  const active = [
    blocks,
    users,
    ...(summaryEnabled ? [summary] : []),
    ...(listEnabled ? [sites] : []),
    ...(page === 'detail' ? [target] : []),
    ...(ruleEnabled ? [rules] : []),
    ...(settlementEnabled ? [settlements] : []),
  ];
  return {
    blocks: blocks.data ?? [],
    users: users.data ?? [],
    summary: summary.data ?? EMPTY_SUMMARY,
    sitePage: sites.data,
    sites: sites.data?.items ?? [],
    target: target.data,
    rules: rules.data ?? [],
    settlementData: settlements.data,
    loading: active.some((q) => q.isPending),
    error: active.find((q) => q.error)?.error,
    refresh: () => client.invalidateQueries(),
  };
}
