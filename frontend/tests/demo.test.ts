import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { environmentPolicy } from '../config/environment';
import type { Role } from '../src/types';

const demoEnv = { VITE_APP_ENV: 'demo', VITE_USE_MOCKS: 'true', VITE_DEMO_SWITCH: 'true' };
const normal = environmentPolicy('production', 'build', {
  VITE_APP_ENV: 'production',
  VITE_USE_MOCKS: 'false',
});
const demo = environmentPolicy('demo', 'build', demoEnv);

async function freshModules(policy: typeof demo) {
  vi.resetModules();
  vi.stubGlobal('__DEMO_SWITCH_ENABLED__', policy.demo);
  vi.stubGlobal('__MOCKS_ENABLED__', policy.mocks);
  return { ...(await import('../src/lib/auth')), ...(await import('../src/api/client')) };
}
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('demo and production isolation', () => {
  it('accepts explicit demo configuration and rejects mixed production flags', () => {
    expect(normal).toStrictEqual({ demo: false, mocks: false });
    expect(demo).toStrictEqual({ demo: true, mocks: true });
    expect(environmentPolicy('production', 'build', {})).toStrictEqual(normal);
    expect(environmentPolicy('production', 'serve', {})).toStrictEqual(normal);
    expect(() => environmentPolicy('production', 'build', demoEnv)).toThrow();
    expect(() => environmentPolicy('production', 'build', { VITE_USE_MOCKS: 'true' })).toThrow();
    expect(() => environmentPolicy('production', 'build', { VITE_DEMO_ROLE: 'ADMIN' })).toThrow();
    expect(() =>
      environmentPolicy('demo', 'build', { ...demoEnv, VITE_USE_MOCKS: 'false' }),
    ).toThrow();
    expect(() =>
      environmentPolicy('demo', 'build', { ...demoEnv, VITE_DEMO_SWITCH: 'false' }),
    ).toThrow();
  });
  it('switches roles per request, unsubscribes, resets and omits production headers', async () => {
    let sentHeaders = new Headers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        sentHeaders = new Headers(init.headers);
        return Response.json({ success: true, data: [] });
      }),
    );
    const ui = await freshModules(demo);
    expect(ui.getDemoRole()).toBe('WORKER');
    let events = 0;
    const unsubscribe = ui.subscribeDemoRole(() => events++);
    try {
      ui.setDemoRole('ADMIN');
      expect(ui.getDemoRole()).toBe('ADMIN');
      await ui.call('/sites');
      expect(sentHeaders.get('X-Demo-Role')).toBe('ADMIN');
      ui.setDemoRole('WORKER');
      await ui.call('/sites');
      expect(sentHeaders.get('X-Demo-Role')).toBe('WORKER');
      expect(events).toBe(2);
    } finally {
      unsubscribe();
    }
    ui.setDemoRole('ADMIN');
    expect(events).toBe(2);
    expect(() => ui.setDemoRole('OTHER' as Role)).toThrow();
    expect((await freshModules(demo)).getDemoRole()).toBe('WORKER');
    const production = await freshModules(normal);
    expect(production.getDemoRole()).toBe('WORKER');
    expect(() => production.setDemoRole('ADMIN')).toThrow();
    await production.call('/sites');
    expect(sentHeaders.has('X-Demo-Role')).toBe(false);
  });
});
