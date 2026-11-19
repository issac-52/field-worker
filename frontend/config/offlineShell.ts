import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export function offlineShell(): Plugin {
  return {
    name: 'fieldwork-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/') && !name.endsWith('.map'))
        .sort();
      const html = bundle['index.html'];
      if (html?.type !== 'asset') this.error('Missing index.html for offline shell');
      const version = createHash('sha256')
        .update(files.join('\n'))
        .update(html.source)
        .digest('hex')
        .slice(0, 16);
      const paths = [
        '/',
        '/manifest.webmanifest',
        '/icons/fieldwork.svg',
        '/icons/fieldwork-180.png',
        '/icons/fieldwork-192.png',
        '/icons/fieldwork-512.png',
        ...files.map((file) => '/' + file),
      ];
      this.emitFile({
        type: 'asset',
        fileName: 'offline-worker.js',
        source: workerSource('fieldwork-shell-' + version, paths),
      });
    },
  };
}

function workerSource(cacheName: string, paths: string[]) {
  return `
const cacheName = ${JSON.stringify(cacheName)};
const paths = ${JSON.stringify(paths)};
const staticPaths = new Set(paths.slice(1));
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(paths.map(path => new Request(path, {cache: 'reload', credentials: 'omit'})));
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('fieldwork-shell-') && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).catch(async () => {
      return (await (await caches.open(cacheName)).match('/')) || Response.error();
    }));
  } else if (!url.search && staticPaths.has(url.pathname)) {
    event.respondWith((async () => {
      return (await (await caches.open(cacheName)).match(url.pathname)) || fetch(request);
    })());
  }
});
`;
}
