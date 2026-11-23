import type { Phase, PhotoSlot, Site, User } from '../types';

export type Reading = { date: string; reading: number; workerId?: number };
export type Draft = {
  readings: Partial<Record<Phase, Reading>>;
  photos: Partial<Record<PhotoSlot, { id: string; blob: Blob }>>;
};
export type SavedSite = {
  id: number;
  label: string;
  address: string;
  meterNo: string;
  readings: Partial<Record<Phase, Reading>>;
  occupiedSlots: PhotoSlot[];
  draft: Draft;
};
export type Workspace = { owner: Pick<User, 'id' | 'username'>; sites: SavedSite[] };
const ACCESS_KEY = 'fieldwork-offline-account';
export const accountKey = (user: Pick<User, 'id' | 'username'>) =>
  JSON.stringify([user.id, user.username]);
export const sameAccount = (a: Pick<User, 'id' | 'username'>, b: Pick<User, 'id' | 'username'>) =>
  accountKey(a) === accountKey(b);

export function allowOfflineAccess(user: User | null) {
  try {
    if (user?.active && !user.mustChangePassword)
      localStorage.setItem(ACCESS_KEY, accountKey(user));
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    // Online work can continue if this browser disallows persistent storage.
  }
}

export function canReadOffline(workspace: Workspace) {
  try {
    return localStorage.getItem(ACCESS_KEY) === accountKey(workspace.owner);
  } catch {
    return false;
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('fieldwork-offline', 2);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        request.result.createObjectStore('workspace');
        return;
      }
      const store = request.transaction!.objectStore('workspace');
      const legacy = store.get('data');
      legacy.onsuccess = () => {
        const workspace = legacy.result as Workspace | undefined;
        if (workspace) {
          store.put(workspace, accountKey(workspace.owner));
          store.delete('data');
        }
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 수도관리 창을 닫고 다시 시도하세요.'));
  });
}

async function workspaceTransaction(
  key: string,
  change?: (current?: Workspace) => Workspace | undefined,
) {
  const db = await openDatabase();
  try {
    return await new Promise<Workspace | undefined>((resolve, reject) => {
      const tx = db.transaction('workspace', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('workspace');
      const request = store.get(key);
      let state: Workspace | undefined;
      tx.oncomplete = () => resolve(state);
      tx.onabort = () => reject(tx.error ?? new Error('기기에 저장하지 못했습니다.'));
      request.onsuccess = () => {
        state = request.result;
        if (!change) return;
        try {
          state = change(state);
          if (state) store.put(state, key);
          else store.delete(key);
        } catch (error) {
          reject(error);
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export async function readWorkspace() {
  const key = localStorage.getItem(ACCESS_KEY);
  return key ? workspaceTransaction(key) : undefined;
}
export const pending = (draft: Draft) =>
  Object.keys(draft.readings).length + Object.keys(draft.photos).length;

export function snapshot(site: Site): Omit<SavedSite, 'draft'> {
  const readings: SavedSite['readings'] = {};
  for (const phase of ['START', 'END'] as const) {
    const reading = site.inspections[phase];
    if (reading) readings[phase] = { date: reading.date, reading: reading.reading };
  }
  return {
    id: site.id,
    label: site.consumerNumber || site.managementNo || String(site.id),
    address: site.address || site.oldAddress || '',
    meterNo: site.meterNo,
    readings,
    occupiedSlots: site.photos.map(({ slot }) => slot),
  };
}

export function hasSameSiteIdentity(saved: SavedSite, latest: ReturnType<typeof snapshot>) {
  return (
    saved.id === latest.id &&
    saved.label === latest.label &&
    saved.address === latest.address &&
    saved.meterNo === latest.meterNo
  );
}

export async function saveSite(user: User, site: Site, stage?: (saved: SavedSite) => void) {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration?.active)
    throw new Error(
      '오프라인 화면을 준비 중입니다. 인터넷 연결을 확인하고 잠시 후 다시 시도하세요.',
    );
  return workspaceTransaction(accountKey(user), (current) => {
    const state = current ?? { owner: { id: user.id, username: user.username }, sites: [] };
    if (!canReadOffline(state)) throw new Error('온라인으로 다시 로그인하세요.');
    const existing = state.sites.find(({ id }) => id === site.id);
    if (!existing && state.sites.length >= 30) {
      const oldest = state.sites.findIndex((row) => !pending(row.draft));
      if (oldest < 0) throw new Error('미전송 수용가가 30개입니다. 연결 후 먼저 전송하세요.');
      state.sites.splice(oldest, 1);
    }
    const latest = snapshot(site);
    if (existing && pending(existing.draft) && !hasSameSiteIdentity(existing, latest))
      throw new Error('수용가 기본정보가 바뀌었습니다. 오프라인 작업의 대기 항목을 확인하세요.');
    const saved = { ...latest, draft: existing?.draft ?? { readings: {}, photos: {} } };
    stage?.(saved);
    state.sites = [...state.sites.filter(({ id }) => id !== site.id), saved];
    checkPhotoLimit(state);
    return state;
  });
}

function checkPhotoLimit(workspace: Workspace) {
  const bytes = workspace.sites.reduce(
    (sum, site) =>
      sum + Object.values(site.draft.photos).reduce((n, photo) => n + photo.blob.size, 0),
    0,
  );
  if (bytes > 30 * 1024 * 1024)
    throw new Error('사진 대기 용량은 최대 30MB입니다. 연결 후 먼저 전송하세요.');
}

export function editSavedSite(
  owner: Workspace['owner'],
  siteId: number,
  change: (site: SavedSite) => SavedSite | undefined,
) {
  return workspaceTransaction(accountKey(owner), (current) => {
    if (!current || !sameAccount(current.owner, owner) || !canReadOffline(current))
      throw new Error('저장된 작업의 계정으로 다시 로그인하세요.');
    const before = current.sites.find(({ id }) => id === siteId);
    if (!before) throw new Error('이 기기에 저장된 수용가를 찾을 수 없습니다.');
    const after = change(before);
    current.sites = current.sites.flatMap((site) =>
      site.id === siteId ? (after ? [after] : []) : [site],
    );
    checkPhotoLimit(current);
    return current.sites.length === 0 ? undefined : current;
  });
}

export function clearOfflineSnapshots(user: User) {
  return workspaceTransaction(accountKey(user), (current) => {
    if (!current) return undefined;
    current.sites = current.sites.filter((site) => pending(site.draft));
    return current.sites.length ? current : undefined;
  });
}
