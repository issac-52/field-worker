import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { environmentPolicy } from './config/environment';

const demoEnv = { VITE_APP_ENV: 'demo', VITE_USE_MOCKS: 'true', VITE_DEMO_SWITCH: 'true' };
const normal = environmentPolicy('production', 'build', {
  VITE_APP_ENV: 'production',
  VITE_USE_MOCKS: 'false',
});
const demo = environmentPolicy('demo', 'build', demoEnv);
assert.deepEqual(normal, { demo: false, mocks: false });
assert.deepEqual(demo, { demo: true, mocks: true });
assert.deepEqual(environmentPolicy('production', 'build', {}), normal);
assert.deepEqual(environmentPolicy('production', 'serve', {}), normal);
assert.throws(() => environmentPolicy('production', 'build', demoEnv));
assert.throws(() => environmentPolicy('production', 'build', { VITE_USE_MOCKS: 'true' }));
assert.throws(() => environmentPolicy('production', 'build', { VITE_DEMO_ROLE: 'ADMIN' }));
assert.throws(() => environmentPolicy('demo', 'build', { ...demoEnv, VITE_USE_MOCKS: 'false' }));
assert.throws(() => environmentPolicy('demo', 'build', { ...demoEnv, VITE_DEMO_SWITCH: 'false' }));

let moduleId = 0;
async function compiled(policy: typeof demo) {
  const result = await build({
    stdin: {
      contents: "export * from './src/lib/auth'; export { call } from './src/api/client';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    define: {
      __DEMO_SWITCH_ENABLED__: String(policy.demo),
      __MOCKS_ENABLED__: String(policy.mocks),
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${moduleId++}`
  );
}
let sentHeaders: Headers;
globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
  sentHeaders = new Headers(init.headers);
  return Response.json({ success: true, data: [] });
}) as typeof fetch;

const ui = await compiled(demo);
assert.equal(ui.getDemoRole(), 'WORKER');
let events = 0;
const unsubscribe = ui.subscribeDemoRole(() => events++);
ui.setDemoRole('ADMIN');
assert.equal(ui.getDemoRole(), 'ADMIN');
await ui.call('/sites');
assert.equal(sentHeaders!.get('X-Demo-Role'), 'ADMIN');
ui.setDemoRole('WORKER');
await ui.call('/sites');
assert.equal(sentHeaders!.get('X-Demo-Role'), 'WORKER');
assert.equal(events, 2);
unsubscribe();
assert.throws(() => ui.setDemoRole('OTHER'));
assert.equal((await compiled(demo)).getDemoRole(), 'WORKER');

const production = await compiled(normal);
assert.equal(production.getDemoRole(), 'WORKER');
assert.throws(() => production.setDemoRole('ADMIN'));
await production.call('/sites');
assert.equal(sentHeaders!.has('X-Demo-Role'), false);
console.log(
  'PASS: explicit demo build only, production rejects mixed flags, role switch/subscription/reset, per-request Mock role, production has no Mock role header',
);
