import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Phase, SiteFilter, SettlementFilter } from '../types';
import { getDemoRole, setDemoRole, subscribeDemoRole } from '../lib/auth';
import type { Role } from '../types';
import { ADMIN_PAGES, useHashRoute } from './useHashRoute';
import { usePagePosition } from './usePagePosition';
import { useWorkData } from './useWorkData';

const STATUS_FILTERS: Record<string, SiteFilter['status']> = {
  미처리: 'TODO',
  시작검침완료: 'IN_PROGRESS',
  완료: 'DONE',
};

export function useWorkController() {
  const route = useHashRoute();
  const role = useSyncExternalStore(subscribeDemoRole, getDemoRole, getDemoRole);
  const client = useQueryClient();
  const [switchingRole, setSwitchingRole] = useState(false);
  async function switchDemoRole(nextRole: Role) {
    if (!__DEMO_SWITCH_ENABLED__ || switchingRole || nextRole === role) return;
    setSwitchingRole(true);
    try {
      await client.cancelQueries();
      client.clear();
      route.navigate('home');
      setDemoRole(nextRole);
    } finally {
      setSwitchingRole(false);
    }
  }
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('전체');
  const [mapPhase, setMapPhase] = useState<Phase>('START');
  const [mapFilter, setMapFilter] = useState<'미처리' | '처리됨' | '전체'>('미처리');
  const [middle, setMiddle] = useState('');
  const [small, setSmall] = useState('');
  const [settleWorker, setSettleWorker] = useState('');
  const [settlePhase, setSettlePhase] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const siteFilter = useMemo<SiteFilter>(
    () => ({
      middleBlockId: middle || undefined,
      smallBlockId: small || undefined,
      ...(route.page === 'sites' ? { q: search || undefined, status: STATUS_FILTERS[filter] } : {}),
      ...(route.page === 'map'
        ? {
            q: search || undefined,
            inspectionPhase: mapPhase,
            inspectionStatus:
              mapFilter === '미처리' ? 'PENDING' : mapFilter === '처리됨' ? 'COMPLETED' : undefined,
          }
        : {}),
    }),
    [middle, small, route.page, search, filter, mapPhase, mapFilter],
  );
  const settlementFilter = useMemo<SettlementFilter>(
    () => ({
      middleBlockId: middle || undefined,
      smallBlockId: small || undefined,
      workerId: settleWorker ? Number(settleWorker) : undefined,
      phase: (settlePhase || undefined) as Phase | undefined,
      startDate: from || undefined,
      endDate: until || undefined,
    }),
    [middle, small, settleWorker, settlePhase, from, until],
  );

  const listPosition = usePagePosition(JSON.stringify(siteFilter));
  const settlementPosition = usePagePosition(JSON.stringify(settlementFilter));
  const data = useWorkData({
    role,
    page: route.page,
    selected: route.siteId,
    siteFilter,
    settlementFilter,
    listPage: route.page === 'home' ? 1 : listPosition.page,
    settlementPage: settlementPosition.page,
  });

  function resetFilters() {
    setMiddle('');
    setSmall('');
    setQuery('');
    setSearch('');
    setFilter('전체');
    setMapPhase('START');
    setMapFilter('미처리');
    setSettleWorker('');
    setSettlePhase('');
    setFrom('');
    setUntil('');
  }
  function changeListPage(page: number) {
    listPosition.setPage(page);
    document.getElementById('results')?.scrollIntoView({ block: 'start' });
  }
  function changeSettlementPage(page: number) {
    settlementPosition.setPage(page);
    document.getElementById('settlement-results')?.scrollIntoView({ block: 'start' });
  }
  return {
    ...route,
    ...data,
    role,
    adminOnly: ADMIN_PAGES.includes(route.page),
    switchDemoRole,
    switchingRole,
    query,
    setQuery,
    filter,
    setFilter,
    mapPhase,
    setMapPhase,
    mapFilter,
    setMapFilter,
    middle,
    setMiddle,
    small,
    setSmall,
    settleWorker,
    setSettleWorker,
    settlePhase,
    setSettlePhase,
    from,
    setFrom,
    until,
    setUntil,
    resetFilters,
    changeListPage,
    changeSettlementPage,
  };
}
