import type { Phase, Site } from '../types';
import { isPhaseComplete } from '../types';

export function mapMarker(site: Pick<Site, 'inspections'>, phase: Phase) {
  const complete = isPhaseComplete(site, phase);
  const label = complete ? '처리됨' : '미처리';
  return {
    label,
    zIndex: complete ? 100 : 200,
    // Fixed markup only: no customer text is interpolated into HTML.
    content: `<button type="button" class="inspection-marker ${complete ? 'complete' : 'pending'}" aria-label="${phase} ${label}"><span aria-hidden="true"></span></button>`,
  };
}
