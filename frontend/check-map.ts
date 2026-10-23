import assert from 'node:assert/strict';
import { loadNaverMaps, MAP_AUTH_ERROR } from './src/lib/naverMaps';
import { mapMarker } from './src/lib/mapMarker';
import { watchCurrentLocation } from './src/lib/currentLocation';
import { seedSites } from './src/mocks/data';

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
assert.equal(received, 1);
assert.equal(geoOptions?.enableHighAccuracy, true);
assert.equal(geoOptions?.timeout, 10000);
geoError!({ code: 1 } as GeolocationPositionError);
assert(message.includes('권한'));
geoError!({ code: 3 } as GeolocationPositionError);
assert(message.includes('초과'));
stop();
assert.equal(cleared, 7);
geoSuccess!(testPosition);
assert.equal(received, 1);
watchCurrentLocation(
  undefined,
  true,
  () => {},
  (value) => {
    message = value;
  },
)();
assert(message.includes('지원하지'));
watchCurrentLocation(
  geo,
  false,
  () => {},
  (value) => {
    message = value;
  },
)();
assert(message.includes('HTTPS'));
console.log(
  'PASS: geolocation callbacks, permission/timeout/unsupported/insecure messages and watch cleanup (fixture coordinates, not device GPS)',
);

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
assert.equal(mapMarker(started, 'START').label, '처리됨');
assert.equal(mapMarker(started, 'END').label, '미처리');
assert(mapMarker(started, 'END').zIndex > mapMarker(started, 'START').zIndex);
assert(mapMarker(started, 'START').content.includes('inspection-marker complete'));
assert(mapMarker(started, 'END').content.includes('inspection-marker pending'));
assert(!mapMarker(started, 'START').content.includes('<b '));

// No network: this fake document captures scripts and invokes SDK outcomes explicitly.
const scripts: any[] = [];
const fakeWindow = new EventTarget() as any;
Object.assign(globalThis, {
  window: fakeWindow,
  document: {
    createElement: () => ({
      dataset: {},
      remove() {
        const index = scripts.indexOf(this);
        if (index >= 0) scripts.splice(index, 1);
      },
    }),
    querySelectorAll: () => [...scripts],
    head: {
      appendChild(script: unknown) {
        scripts.push(script);
      },
    },
  },
});
const key = '__UNIT_TEST_NO_NETWORK__';
await assert.rejects(loadNaverMaps(''), /VITE_NAVER_MAP_CLIENT_ID/);
assert.equal(scripts.length, 0);
const first = loadNaverMaps(key);
assert.strictEqual(first, loadNaverMaps(key));
assert.equal(scripts.length, 1);
assert.equal(new URL(scripts[0].src).searchParams.get('ncpKeyId'), key);
const networkFailure = assert.rejects(first, /내려받지/);
scripts[0].onerror();
await networkFailure;
assert.equal(scripts.length, 0);
await assert.rejects(loadNaverMaps(key, 5), /초과/);
assert.equal(scripts.length, 0);
const authFailure = loadNaverMaps(key);
const denied = assert.rejects(authFailure, /인증/);
fakeWindow.navermap_authFailure();
await denied;
assert.equal(scripts.length, 0);
const retry = loadNaverMaps(key);
fakeWindow[new URL(scripts[0].src).searchParams.get('callback')!]();
fakeWindow.naver = { maps: { Map: class {} } };
assert.strictEqual(await retry, fakeWindow.naver.maps);
await loadNaverMaps(key);
assert.equal(scripts.length, 1);
let authEvents = 0;
fakeWindow.addEventListener(MAP_AUTH_ERROR, () => authEvents++);
fakeWindow.navermap_authFailure();
assert.equal(authEvents, 1);
const retryAfterAuth = loadNaverMaps(key);
assert.equal(scripts.length, 1);
const rejected = assert.rejects(retryAfterAuth, /내려받지/);
scripts[0].onerror();
await rejected;
console.log(
  'PASS: no-key/no-request, SDK deduplication, ncpKeyId, network/timeout/auth failures, retry and late auth failure invalidation (fake DOM, no NAVER authentication)',
);
