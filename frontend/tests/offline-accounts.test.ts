import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  allowOfflineAccess,
  clearOfflineSnapshots,
  readWorkspace,
  snapshot,
} from '../src/offline/storage';
import { sendPendingWorkspace, stageAndSend } from '../src/offline/sync';
import * as client from '../src/api/client';
import { siteApi } from '../src/api/sites';
import type { Site, User } from '../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('migrates old pending work and lets another login save and sync the same site independently', async () => {
  const db = new IDBFactory();
  const values = new Map<string, string>();
  vi.stubGlobal('indexedDB', db);
  vi.stubGlobal('localStorage', {
    setItem: (key: string, value: string) => values.set(key, value),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  });
  const network = {
    onLine: false,
    serviceWorker: { getRegistration: async () => ({ active: true }) },
  };
  vi.stubGlobal('navigator', network);
  vi.stubGlobal('window', new EventTarget());
  const a: User = { id: 1, username: 'a', role: 'WORKER', name: 'A', active: true };
  const b: User = { ...a, id: 2, username: 'b' };
  const site = {
    id: 5,
    consumerNumber: 'TEST',
    address: 'test',
    meterNo: 'm',
    inspections: {},
    photos: [],
  } as unknown as Site;
  const legacyPhoto = new Blob(['original']);
  await new Promise<void>((resolve, reject) => {
    const req = db.open('fieldwork-offline', 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore('workspace').put(
        {
          owner: a,
          sites: [
            {
              ...snapshot(site),
              draft: {
                readings: { START: { reading: 10, date: '2026-11-20' } },
                photos: { OVERVIEW: { id: 'photo', blob: legacyPhoto } },
              },
            },
          ],
        },
        'data',
      );
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
  allowOfflineAccess(b);
  expect(await readWorkspace()).toBeUndefined();
  await expect(
    stageAndSend(b, site, (saved) => {
      saved.draft.readings.START = { reading: 20, date: '2026-11-20' };
    }),
  ).resolves.toBe(false);
  allowOfflineAccess(null);
  await clearOfflineSnapshots(b);
  expect(await readWorkspace()).toBeUndefined();
  allowOfflineAccess(b);
  network.onLine = true;
  vi.spyOn(client, 'call').mockResolvedValue(b);
  vi.spyOn(siteApi, 'site').mockResolvedValue(site);
  const save = vi.spyOn(siteApi, 'measurement').mockResolvedValue(site);
  await sendPendingWorkspace();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][1]).toMatchObject({ workerId: b.id, reading: 20 });
  expect((await readWorkspace())?.sites[0].draft.readings).toEqual({});
  await clearOfflineSnapshots(b);
  allowOfflineAccess(a);
  const draft = (await readWorkspace())?.sites[0].draft;
  expect(draft?.readings.START?.reading).toBe(10);
  expect(await draft?.photos.OVERVIEW?.blob.text()).toBe('original');
});
