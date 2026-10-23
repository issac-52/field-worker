import type { Site } from '../types';
import { statusOf } from '../types';
const states = {
  TODO: { label: '미처리', className: 'pending', zIndex: 300 },
  IN_PROGRESS: { label: '시작검침완료', className: 'started', zIndex: 200 },
  DONE: { label: '검침완료', className: 'complete', zIndex: 100 },
};
export function mapMarker(site: Pick<Site, 'inspections'>) {
  const state = states[statusOf(site)];
  return {
    label: state.label,
    zIndex: state.zIndex,
    // Fixed markup only; customer text never enters marker HTML.
    content: `<button type="button" class="inspection-marker ${state.className}" aria-label="${state.label}"><span aria-hidden="true"></span></button>`,
  };
}
