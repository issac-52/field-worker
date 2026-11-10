import { expect, it } from 'vitest';
import { importedMeterInfo } from '../src/lib/importedMeterInfo';

it('only treats an exact completed value as presence and keeps other text in Excel remarks', () => {
  expect(importedMeterInfo(' 完了 ')).toEqual({ meterPresenceRaw: '', importRemark: '完了' });
  expect(importedMeterInfo(' 완료 ')).toEqual({ meterPresenceRaw: '완료', importRemark: '' });
  expect(importedMeterInfo('미설치')).toEqual({ meterPresenceRaw: '', importRemark: '미설치' });
  expect(importedMeterInfo('완료(확인 필요)')).toEqual({
    meterPresenceRaw: '',
    importRemark: '완료(확인 필요)',
  });
  expect(importedMeterInfo(' \t ')).toEqual({ meterPresenceRaw: '', importRemark: '' });
  expect(importedMeterInfo(undefined)).toEqual({ meterPresenceRaw: '', importRemark: '' });
  expect(importedMeterInfo('', '기존 비고')).toEqual({
    meterPresenceRaw: '',
    importRemark: '기존 비고',
  });
});
