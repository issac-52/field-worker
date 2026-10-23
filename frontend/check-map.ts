import assert from 'node:assert/strict';
import { loadNaverMaps, MAP_AUTH_ERROR } from './src/lib/naverMaps';

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
