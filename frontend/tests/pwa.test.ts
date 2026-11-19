import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const frontend = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, frontend));

it('serves a standalone home entry and the launcher icons required by mobile browsers', () => {
  const html = read('index.html').toString();
  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  expect(html).toContain('href="/icons/fieldwork-180.png"');

  const manifest = JSON.parse(read('public/manifest.webmanifest').toString());
  const origin = 'https://fieldwork.example';
  const scope = new URL(manifest.scope, origin);
  const start = new URL(manifest.start_url, origin);
  expect(scope.origin).toBe(origin);
  expect(start.origin).toBe(origin);
  expect(start.pathname.startsWith(scope.pathname)).toBe(true);
  expect(start.hash).toBe('#home');
  expect(manifest.display).toBe('standalone');

  const manifestIcons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
  expect(manifestIcons.filter((icon) => !icon.purpose).map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifestIcons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const { src, sizes } of [
    ...manifestIcons,
    { src: '/icons/fieldwork-180.png', sizes: '180x180' },
  ]) {
    expect(src.startsWith('/icons/')).toBe(true);
    const png = read('public' + src);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(sizes);
  }
});
