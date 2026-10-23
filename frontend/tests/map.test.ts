import { describe, it, expect, afterEach, vi } from 'vitest';

import { mapMarker } from '../src/lib/mapMarker';
import { watchCurrentLocation } from '../src/lib/currentLocation';
import { seedSites } from '../src/mocks/data';
import { hasCoordinates } from '../src/lib/coordinates';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});
describe('map without network', () => {
  it('validates coordinates and geolocation lifecycle', () => {
    expect(!hasCoordinates({ latitude: null, longitude: null })).toBeTruthy();
    expect(!hasCoordinates({ latitude: 0, longitude: 0 })).toBeTruthy();
    expect(!hasCoordinates({ latitude: Infinity, longitude: 10 })).toBeTruthy();
    expect(!hasCoordinates({ latitude: 91, longitude: 10 })).toBeTruthy();
    let geoSuccess: PositionCallback | undefined;
    let geoError: PositionErrorCallback | null | undefined;
    let geoOptions: PositionOptions | undefined;
    let cleared: number | undefined;
    let received = 0;
    let message = '';
    const geo = {
      watchPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) {
        geoSuccess = success;
        geoError = error;
        geoOptions = options;
        return 7;
      },
      clearWatch(id: number) {
        cleared = id;
      },
    };
    const stop = watchCurrentLocation(
      geo,
      true,
      () => received++,
      (value) => {
        message = value;
      },
    );
    const testPosition = {
      coords: { latitude: seedSites[0].latitude, longitude: seedSites[0].longitude, accuracy: 10 },
    } as GeolocationPosition;
    geoSuccess!(testPosition);
    expect(received).toBe(1);
    expect(geoOptions?.enableHighAccuracy).toBe(true);
    expect(geoOptions?.timeout).toBe(10000);
    geoError!({ code: 1 } as GeolocationPositionError);
    expect(message.includes('권한')).toBeTruthy();
    geoError!({ code: 3 } as GeolocationPositionError);
    expect(message.includes('초과')).toBeTruthy();
    stop();
    expect(cleared).toBe(7);
    geoSuccess!(testPosition);
    expect(received).toBe(1);
    watchCurrentLocation(
      undefined,
      true,
      () => {},
      (value) => {
        message = value;
      },
    )();
    expect(message.includes('지원하지')).toBeTruthy();
    watchCurrentLocation(
      geo,
      false,
      () => {},
      (value) => {
        message = value;
      },
    )();
    expect(message.includes('HTTPS')).toBeTruthy();
  });
  it('renders the three inspection states', () => {
    const started = {
      inspections: {
        START: {
          date: '2026-11-01',
          reading: 1,
          workerId: 11,
          workerName: '가상 작업자',
          recordedAt: '2026-11-01',
        },
      },
    };
    expect(mapMarker(started).label).toBe('시작검침완료');
    expect(mapMarker(started).content.includes('inspection-marker started')).toBeTruthy();
    expect(mapMarker({ inspections: {} }).label).toBe('미처리');
    expect(mapMarker(seedSites[0]).label).toBe('검침완료');
    expect(mapMarker({ inspections: {} }).zIndex > mapMarker(started).zIndex).toBeTruthy();
    expect(!mapMarker(started).content.includes('<b ')).toBeTruthy();
  });
  it('handles SDK deduplication, failures and retries', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { loadNaverMaps, MAP_AUTH_ERROR } = await import('../src/lib/naverMaps');
    // No network: this fake document captures scripts and invokes SDK outcomes explicitly.
    type FakeScript = {
      dataset: Record<string, string>;
      src: string;
      async: boolean;
      onerror: (() => void) | null;
      onload: (() => void) | null;
      remove(): void;
    };
    const scripts: FakeScript[] = [];
    const fakeWindow = new EventTarget() as EventTarget & {
      navermap_authFailure: () => void;
      naver: { maps: { Map: new () => object } };
      [key: `__fieldMapReady${number}`]: () => void;
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      createElement: (): FakeScript => ({
        dataset: {},
        src: '',
        async: false,
        onerror: null,
        onload: null,
        remove() {
          const index = scripts.indexOf(this);
          if (index >= 0) scripts.splice(index, 1);
        },
      }),
      querySelectorAll: () => [...scripts],
      head: {
        appendChild(script: FakeScript) {
          scripts.push(script);
        },
      },
    });
    const key = '__UNIT_TEST_NO_NETWORK__';
    await expect(loadNaverMaps('')).rejects.toThrow(/VITE_NAVER_MAP_CLIENT_ID/);
    expect(scripts.length).toBe(0);
    const first = loadNaverMaps(key);
    expect(first).toBe(loadNaverMaps(key));
    expect(scripts.length).toBe(1);
    expect(new URL(scripts[0].src).searchParams.get('ncpKeyId')).toBe(key);
    const networkFailure = expect(first).rejects.toThrow(/내려받지/);
    scripts[0].onerror!();
    await networkFailure;
    expect(scripts.length).toBe(0);
    const timeout = expect(loadNaverMaps(key, 5)).rejects.toThrow(/초과/);
    await vi.advanceTimersByTimeAsync(5);
    await timeout;
    expect(scripts.length).toBe(0);
    const authFailure = loadNaverMaps(key);
    const denied = expect(authFailure).rejects.toThrow(/인증/);
    fakeWindow.navermap_authFailure();
    await denied;
    expect(scripts.length).toBe(0);
    const retry = loadNaverMaps(key);
    fakeWindow[
      new URL(scripts[0].src).searchParams.get('callback')! as `__fieldMapReady${number}`
    ]();
    fakeWindow.naver = { maps: { Map: class {} } };
    await vi.advanceTimersByTimeAsync(50);
    expect(await retry).toBe(fakeWindow.naver.maps);
    await loadNaverMaps(key);
    expect(scripts.length).toBe(1);
    let authEvents = 0;
    const onAuthError = () => authEvents++;
    fakeWindow.addEventListener(MAP_AUTH_ERROR, onAuthError);
    try {
      fakeWindow.navermap_authFailure();
      expect(authEvents).toBe(1);
    } finally {
      fakeWindow.removeEventListener(MAP_AUTH_ERROR, onAuthError);
    }
    const retryAfterAuth = loadNaverMaps(key);
    expect(scripts.length).toBe(1);
    const rejected = expect(retryAfterAuth).rejects.toThrow(/내려받지/);
    scripts[0].onerror!();
    await rejected;
  });
});
