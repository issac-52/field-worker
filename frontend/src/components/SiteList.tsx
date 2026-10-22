import { ArrowRight, House } from 'lucide-react';
import type { SiteListItem } from '../types';
import { StatusBadge } from './StatusBadge';

export function SiteList({
  sites,
  onSelect,
  loading = false,
}: {
  sites: SiteListItem[];
  onSelect: (id: number) => void;
  loading?: boolean;
}) {
  return (
    <div className="panel site-panel" aria-busy={loading}>
      {sites.map((site) => (
        <button className="site-row" key={site.id} onClick={() => onSelect(site.id)}>
          <span className="site-avatar">
            <House size={20} />
          </span>
          <span className="site-text">
            <span className="site-line">
              <strong>{site.name}</strong>
              <span className="mini-index">#{site.managementNo}</span>
            </span>
            <small>
              {site.zone} 소블록 · {site.address.replace('경산시 ', '')}
            </small>
          </span>
          <span className="site-end">
            <StatusBadge site={site} />
            <ArrowRight size={15} />
          </span>
        </button>
      ))}
      {!sites.length && (
        <div className="empty">
          {loading ? '불러오는 중...' : '검색 조건에 맞는 수용가가 없습니다.'}
        </div>
      )}
    </div>
  );
}
