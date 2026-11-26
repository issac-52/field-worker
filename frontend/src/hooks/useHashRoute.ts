import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const PAGE_TITLES = {
  home: '홈',
  sites: '수용가 목록',
  map: '현장 지도',
  detail: '수용가 상세',
  admin: '관리자',
  fees: '작업비 관리',
  settlements: '정산 내역',
  reports: '문서 출력',
  investigators: '조사자 관리',
} as const;
export type Page = keyof typeof PAGE_TITLES;
export const ADMIN_PAGES: readonly Page[] = [
  'admin',
  'fees',
  'settlements',
  'reports',
  'investigators',
];

function readRoute(): { page: Page; siteId: number } {
  const [rawPage, rawId] = location.hash.slice(1).split('/');
  const page = Object.hasOwn(PAGE_TITLES, rawPage) ? (rawPage as Page) : 'home';
  const siteId = Number(rawId);
  if (page === 'detail' && (!Number.isSafeInteger(siteId) || siteId < 1))
    return { page: 'sites', siteId: 1 };
  return { page, siteId: page === 'detail' ? siteId : 1 };
}

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute);
  const scrollAfterNavigation = useRef(false);
  useEffect(() => {
    const sync = () => {
      const next = readRoute();
      setRoute((current) =>
        current.page === next.page && current.siteId === next.siteId ? current : next,
      );
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useLayoutEffect(() => {
    if (scrollAfterNavigation.current) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      scrollAfterNavigation.current = false;
    }
  }, [route]);
  function navigate(page: Page, siteId?: number) {
    const hash = '#' + (page === 'detail' ? `detail/${siteId}` : page);
    if (location.hash === hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    history.pushState(null, '', hash);
    scrollAfterNavigation.current = true;
    setRoute(readRoute());
  }
  return {
    ...route,
    navigate,
    openSite: (id: number) => navigate('detail', id),
  };
}
