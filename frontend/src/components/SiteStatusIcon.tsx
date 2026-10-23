import { Check, Circle, CircleDashed } from 'lucide-react';
import type { Phase, Site } from '../types';
import { isPhaseComplete, statusOf } from '../types';

const states = {
  TODO: { label: '미처리', className: 'pending', Icon: CircleDashed },
  IN_PROGRESS: { label: '시작검침완료', className: 'started', Icon: Check },
  DONE: { label: '검침 완료', className: 'complete', Icon: Circle },
};
function StatusIcon({ state, label }: { state: keyof typeof states; label?: string }) {
  const { Icon, className, label: defaultLabel } = states[state];
  return (
    <span
      className={`site-status-icon ${className}`}
      role="img"
      aria-label={label ?? defaultLabel}
      title={label ?? defaultLabel}
    >
      <Icon size={17} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}
export function SiteStatusIcon({
  site,
  phase,
}: {
  site: Pick<Site, 'inspections'>;
  phase?: Phase;
}) {
  if (phase) {
    const complete = isPhaseComplete(site, phase);
    return (
      <StatusIcon
        state={complete ? 'DONE' : 'TODO'}
        label={`${phase} ${complete ? '처리됨' : '미처리'}`}
      />
    );
  }
  return <StatusIcon state={statusOf(site)} />;
}
export function SiteStatusLegend({ phase }: { phase?: Phase }) {
  return (
    <div className="site-status-legend" aria-label="검침 상태 아이콘 안내">
      <span>
        <StatusIcon state="TODO" />
        미처리
      </span>
      {!phase && (
        <span>
          <StatusIcon state="IN_PROGRESS" />
          시작검침완료
        </span>
      )}
      <span>
        <StatusIcon state="DONE" />
        {phase ? `${phase} 처리됨` : '검침 완료'}
      </span>
    </div>
  );
}
