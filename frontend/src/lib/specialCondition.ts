import type { Site } from '../types';

export const SPECIAL_CONDITIONS = {
  NONE: '해당 없음',
  HOPE: '호폐',
  LOCATION_UNKNOWN: '위치불명',
  STACKED: '적재',
  OTHER: '기타',
} as const;

export function specialConditionText(condition: Site['specialCondition']) {
  if (!condition || condition.code === 'NONE') return '';
  if (condition.code === 'OTHER') return condition.description.trim() || '기타';
  return SPECIAL_CONDITIONS[condition.code as keyof typeof SPECIAL_CONDITIONS] ?? '';
}

export function conditionPayload(code: string, description: string) {
  if (!Object.hasOwn(SPECIAL_CONDITIONS, code)) throw new Error('특이사항을 선택하세요.');
  const detail = code === 'OTHER' ? description.trim() : '';
  if (code === 'OTHER' && (!detail || detail.length > 2000))
    throw new Error('기타 내용을 1~2,000자로 입력하세요.');
  return { code, description: detail };
}
