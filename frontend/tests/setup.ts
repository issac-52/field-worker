import { vi } from 'vitest';
// Match the original Node scripts: importing fixtures must not expand browser demo data.
vi.stubEnv('DEV', false);
vi.stubEnv('MODE', 'test');
