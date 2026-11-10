import { describe, expect, it } from 'vitest';
import { specialConditionText, conditionPayload } from '../src/lib/specialCondition';

describe('unified special condition', () => {
  it('shows the selected label, or only the user text for OTHER, without legacy notes', () => {
    for (const [code, expected] of [
      ['HOPE', '호폐'],
      ['LOCATION_UNKNOWN', '위치불명'],
      ['STACKED', '적재'],
      ['NONE', ''],
    ]) {
      expect(specialConditionText({ code, label: 'untrusted label', description: 'stale' })).toBe(
        expected,
      );
    }
    expect(
      specialConditionText({ code: 'OTHER', label: '기타', description: '  가상 현장 상황  ' }),
    ).toBe('가상 현장 상황');
    expect(specialConditionText(undefined)).toBe('');
  });
  it('requires OTHER text and clears stale descriptions for other selections', () => {
    expect(conditionPayload('HOPE', 'stale')).toEqual({ code: 'HOPE', description: '' });
    expect(conditionPayload('NONE', 'stale')).toEqual({ code: 'NONE', description: '' });
    expect(conditionPayload('OTHER', ' 가상 상황 ')).toEqual({
      code: 'OTHER',
      description: '가상 상황',
    });
    expect(() => conditionPayload('OTHER', '   ')).toThrow();
    expect(() => conditionPayload('OTHER', 'a'.repeat(2001))).toThrow();
  });
});
