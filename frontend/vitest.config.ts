import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Keep environment files out of hermetic Node regression tests.
  envDir: false,
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    isolate: true,
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'config/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
