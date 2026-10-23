import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { env as processEnv } from 'node:process';
import { environmentPolicy } from './config/environment';

export default defineConfig(({ mode, command }) => {
  // Pages production reads Variables only; never inherit a developer's .env.local.
  const production = mode === 'production';
  const env = production
    ? processEnv
    : loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  const policy = environmentPolicy(mode, command, env);
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    envDir: production ? false : undefined,
    server: { port: 5173 },
    build: { outDir: policy.demo ? 'dist-demo' : 'dist' },
    define: {
      __DEMO_SWITCH_ENABLED__: JSON.stringify(policy.demo),
      __MOCKS_ENABLED__: JSON.stringify(policy.mocks),
    },
  };
});
