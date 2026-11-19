import { expect, it } from 'vitest';
import { sameAccount, snapshot } from '../src/offline/storage';
import { validateReading } from '../src/offline/sync';
import type { Site } from '../src/types';

it('rejects invalid periods and END readings without a valid START', () => {
  expect(validateReading('START', '2026-11-19', '0')).toEqual({
    date: '2026-11-19',
    reading: 0,
  });
  expect(() => validateReading('START', '2026-02-30', '0')).toThrow();
  expect(() => validateReading('START', '2027-11-19', '1')).toThrow();
  expect(() => validateReading('START', '2026-11-19', '')).toThrow();
  expect(() => validateReading('END', '2027-11-19', '2')).toThrow();
  expect(() => validateReading('END', '2027-11-19', '2', 3)).toThrow();
  expect(validateReading('END', '2027-11-19', '3', 3).reading).toBe(3);
});

it('binds the offline workspace to the authenticated ID and login name', () => {
  const account = { id: 2, username: 'worker' };
  expect(sameAccount(account, { id: 2, username: 'worker' })).toBe(true);
  expect(sameAccount(account, { id: 2, username: 'new-worker' })).toBe(false);
  expect(sameAccount(account, { id: 3, username: 'worker' })).toBe(false);
});

it('retains needed field information and strips customer names, payment and photo URLs', () => {
  const site = {
    id: 1,
    consumerNumber: '0001',
    address: 'Test address',
    meterNo: 'Test meter',
    name: 'Test customer',
    note: 'Test note',
    photos: [{ id: 5, slot: 'OVERVIEW', url: '/api/sites/1/photos/5/content' }],
    inspections: {
      START: {
        date: '2026-11-19',
        reading: 12,
        workerId: 3,
        workerName: 'Test worker',
        fee: 200,
        recordedAt: 'now',
      },
    },
  } as Site;
  expect(snapshot(site)).toEqual({
    id: 1,
    label: '0001',
    address: 'Test address',
    meterNo: 'Test meter',
    readings: { START: { date: '2026-11-19', reading: 12 } },
    occupiedSlots: ['OVERVIEW'],
  });
});
