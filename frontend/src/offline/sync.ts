import { call } from '../api/client';
import { siteApi } from '../api/sites';
import {
  LIVE_PHOTO_SLOTS,
  PHASE_LABEL,
  PHOTO_LABEL,
  type Phase,
  type Site,
  type User,
} from '../types';
import {
  editSavedSite,
  hasSameSiteIdentity,
  sameAccount,
  snapshot,
  type SavedSite,
  type Workspace,
} from './storage';

export function validateReading(phase: Phase, date: string, raw: string, start?: number) {
  const year = phase === 'START' ? '2026' : '2027';
  const reading = Number(raw);
  const parsedDate = new Date(date + 'T00:00:00Z');
  if (
    date < year + '-01-01' ||
    date > year + '-12-31' ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date ||
    !raw.trim() ||
    !Number.isFinite(reading) ||
    reading < 0
  )
    throw new Error(year + '년 날짜와 0 이상의 계량지침을 입력하세요.');
  if (phase === 'END' && (start === undefined || reading < start))
    throw new Error('시작 검침을 먼저 저장하고, 종료 지침을 시작 지침 이상으로 입력하세요.');
  return { date, reading };
}

export async function sendSiteDraft(owner: Workspace['owner'], saved: SavedSite) {
  if (!navigator.onLine) throw new Error('인터넷에 연결한 뒤 다시 전송하세요.');
  const user = await call<User>('/me');
  if (!sameAccount(owner, user) || !user.active || user.mustChangePassword)
    throw new Error('임시 저장한 계정으로 온라인 로그인한 뒤 전송하세요.');
  let site = await siteApi.site(saved.id);
  if (!hasSameSiteIdentity(saved, snapshot(site)))
    throw new Error(
      '수용가 번호·주소·계량기 정보가 바뀌었습니다. 온라인 기록을 확인한 뒤 대기 항목을 정리하세요.',
    );
  const persist = (change: (current: SavedSite) => void) =>
    editSavedSite(owner, saved.id, (current) => {
      change(current);
      return { ...current, ...snapshot(site) };
    });

  for (const phase of ['START', 'END'] as const) {
    const reading = saved.draft.readings[phase];
    if (!reading) continue;
    const registered = site.inspections[phase];
    if (registered) {
      // A previous request may have succeeded before the connection dropped.
      if (
        registered.workerId !== user.id ||
        registered.date !== reading.date ||
        registered.reading !== reading.reading
      )
        throw new Error(
          PHASE_LABEL[phase] + ' 기록이 서버에 있습니다. 내용을 확인한 뒤 대기 항목을 정리하세요.',
        );
    } else {
      validateReading(
        phase,
        reading.date,
        String(reading.reading),
        site.inspections.START?.reading,
      );
      site = await siteApi.measurement(site.id, { phase, workerId: user.id, ...reading });
    }
    await persist((current) => {
      const latest = current.draft.readings[phase];
      if (latest?.date === reading.date && latest.reading === reading.reading)
        delete current.draft.readings[phase];
    });
  }

  for (const slot of LIVE_PHOTO_SLOTS) {
    const draft = saved.draft.photos[slot];
    if (!draft) continue;
    const { blob } = draft;
    const existing = site.photos.find((photo) => photo.slot === slot);
    if (existing) {
      // Compare the stored JPEG to recognize a successful request whose response was lost.
      const url = new URL(existing.url, location.origin);
      if (url.origin !== location.origin) throw new Error('서버 사진을 확인하지 못했습니다.');
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !(await samePhoto(blob, await response.blob())))
        throw new Error(
          PHOTO_LABEL[slot] + '이 서버에 있습니다. 사진을 확인한 뒤 대기 항목을 정리하세요.',
        );
    } else {
      const body = new FormData();
      body.append('file', blob, 'photo.jpg');
      body.append('slot', slot);
      site = await call<Site>('/sites/' + site.id + '/photos', { method: 'POST', body });
    }
    await persist((current) => {
      const latest = current.draft.photos[slot];
      // If another tab replaced the draft meanwhile, preserve the new photo.
      if (latest?.id === draft.id) delete current.draft.photos[slot];
    });
  }
}

async function samePhoto(a: Blob, b: Blob) {
  if (a.size !== b.size) return false;
  const hashes = await Promise.all(
    [a, b].map(async (blob) => crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
  );
  const other = new Uint8Array(hashes[1]);
  return new Uint8Array(hashes[0]).every((byte, i) => byte === other[i]);
}
