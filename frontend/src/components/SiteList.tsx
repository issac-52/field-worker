import { Button } from './ui/button';
import type { Phase, SiteListItem } from '../types';
import { SiteStatusIcon, SiteStatusLegend } from './SiteStatusIcon';

export function SiteList({
  sites,
  onSelect,
  loading = false,
  phase,
}: {
  sites: SiteListItem[];
  onSelect: (id: number) => void;
  loading?: boolean;
  phase?: Phase;
}) {
  return (
    <>
      <SiteStatusLegend phase={phase} />
      <div className="panel site-panel" aria-busy={loading}>
        {sites.map((site) => (
          <Button
            variant="ghost"
            className="site-row"
            key={site.id}
            onClick={() => onSelect(site.id)}
          >
            <SiteStatusIcon site={site} phase={phase} />
            <strong className="site-name">{site.name}</strong>
            <span className="mini-index">#{site.managementNo}</span>
            <span className="site-zone">{site.zone}</span>
            <span className="site-address" title={site.address}>
              {site.address.replace('경산시 ', '')}
            </span>
          </Button>
        ))}
        {!sites.length && (
          <div className="empty">
            {loading ? '불러오는 중...' : '검색 조건에 맞는 수용가가 없습니다.'}
          </div>
        )}
      </div>
    </>
  );
}
