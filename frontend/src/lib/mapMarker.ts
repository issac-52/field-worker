import type { InspectionStatusInput } from '../types';
import { statusOf } from '../types';
import { highlightedCondition, SPECIAL_CONDITIONS } from './specialCondition';
const states = {
  TODO: { label: '미처리', className: 'pending', zIndex: 300 },
  IN_PROGRESS: { label: '시작검침완료', className: 'started', zIndex: 200 },
  DONE: { label: '검침완료', className: 'complete', zIndex: 100 },
};
export function mapMarker(site: InspectionStatusInput) {
  return mapMarkerForStatus(statusOf(site));
}
export function mapMarkerForStatus(status: keyof typeof states, code?: string) {
  const state = states[status];
  const condition = highlightedCondition(code);
  const label = condition ? state.label + ' · ' + SPECIAL_CONDITIONS[condition] : state.label;
  return {
    label,
    zIndex: state.zIndex,
    // Fixed markup only; customer text never enters marker HTML.
    content: `<button type="button" class="inspection-marker ${state.className}" ${condition ? `data-condition="${condition}"` : ''} aria-label="${label}"><span aria-hidden="true"></span></button>`,
  };
}
