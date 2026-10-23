import { Badge } from './ui/badge';
import type { Phase, Site } from '../types';
import { statusOf, isPhaseComplete } from '../types';

const STATUS_PRESENTATION = {
  DONE: { className: 'done', label: '검침 완료' },
  IN_PROGRESS: { className: 'progress', label: '시작검침완료' },
  TODO: { className: 'todo', label: '미처리' },
};
export function StatusBadge({ site, phase }: { site: Pick<Site, 'inspections'>; phase?: Phase }) {
  if (phase)
    return (
      <Badge className={`status ${isPhaseComplete(site, phase) ? 'done' : 'pending'}`}>
        {phase} {isPhaseComplete(site, phase) ? '처리됨' : '미처리'}
      </Badge>
    );
  const status = STATUS_PRESENTATION[statusOf(site)];
  return <Badge className={`status ${status.className}`}>{status.label}</Badge>;
}
