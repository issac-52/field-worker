import type { Site } from '../types';
import { statusOf } from '../types';

const STATUS_PRESENTATION = {
  DONE: { className: 'done', label: '검침 완료' },
  IN_PROGRESS: { className: 'progress', label: '시작 완료' },
  TODO: { className: 'todo', label: '대기 중' },
};
export function StatusBadge({ site }: { site: Pick<Site, 'inspections'> }) {
  const status = STATUS_PRESENTATION[statusOf(site)];
  return <span className={`status ${status.className}`}>{status.label}</span>;
}
