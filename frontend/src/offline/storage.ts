import type { Phase, PhotoSlot, Site, User } from '../types';

export type Reading = { date: string; reading: number };
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
const accountKey = (user: Pick<User, 'id' | 'username'>) =>
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
    const request = indexedDB.open('fieldwork-offline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 수도관리 창을 닫고 다시 시도하세요.'));
  });
}

async function workspaceTransaction(change?: (current?: Workspace) => Workspace | undefined) {
  const db = await openDatabase();
  try {
    return await new Promise<Workspace | undefined>((resolve, reject) => {
      const tx = db.transaction('workspace', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('workspace');
      const request = store.get('data');
      let state: Workspace | undefined;
      tx.oncomplete = () => resolve(state);
      tx.onabort = () => reject(tx.error ?? new Error('기기에 저장하지 못했습니다.'));
      request.onsuccess = () => {
        state = request.result;
        if (!change) return;
        try {
          state = change(state);
          if (state) store.put(state, 'data');
          else store.delete('data');
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

export const readWorkspace = () => workspaceTransaction();
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

export async function saveSite(user: User, site: Site) {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration?.active)
    throw new Error(
      '오프라인 화면을 준비 중입니다. 인터넷 연결을 확인하고 잠시 후 다시 시도하세요.',
    );
  return workspaceTransaction((current) => {
    if (current && !sameAccount(current.owner, user))
      throw new Error('이 기기에 다른 계정의 오프라인 작업이 저장되어 있습니다.');
    const state = current ?? { owner: { id: user.id, username: user.username }, sites: [] };
    if (!canReadOffline(state)) throw new Error('온라인으로 다시 로그인하세요.');
    const existing = state.sites.find(({ id }) => id === site.id);
    if (!existing && state.sites.length >= 30)
      throw new Error('최대 30개 수용가를 저장할 수 있습니다. 끝난 수용가를 먼저 지워 주세요.');
    const latest = snapshot(site);
    if (existing && pending(existing.draft) && !hasSameSiteIdentity(existing, latest))
      throw new Error('수용가 기본정보가 바뀌었습니다. 오프라인 작업의 대기 항목을 확인하세요.');
    const saved = { ...latest, draft: existing?.draft ?? { readings: {}, photos: {} } };
    state.sites = [...state.sites.filter(({ id }) => id !== site.id), saved];
    return state;
  });
}

export function editSavedSite(
  owner: Workspace['owner'],
  siteId: number,
  change: (site: SavedSite) => SavedSite | undefined,
) {
  return workspaceTransaction((current) => {
    if (!current || !sameAccount(current.owner, owner) || !canReadOffline(current))
      throw new Error('저장된 작업의 계정으로 다시 로그인하세요.');
    const before = current.sites.find(({ id }) => id === siteId);
    if (!before) throw new Error('이 기기에 저장된 수용가를 찾을 수 없습니다.');
    const after = change(before);
    current.sites = current.sites.flatMap((site) =>
      site.id === siteId ? (after ? [after] : []) : [site],
    );
    const bytes = current.sites.reduce(
      (sum, site) =>
        sum + Object.values(site.draft.photos).reduce((n, blob) => n + blob.blob.size, 0),
      0,
    );
    if (bytes > 30 * 1024 * 1024)
      throw new Error('사진 대기 용량은 최대 30MB입니다. 연결 후 먼저 전송하세요.');
    return current.sites.length === 0 ? undefined : current;
  });
}

export async function checkOfflineLogout(user: User) {
  const state = await readWorkspace();
  if (state && sameAccount(state.owner, user) && state.sites.some((site) => pending(site.draft)))
    throw new Error('미전송 검침·사진이 있습니다. 오프라인 작업에서 먼저 전송하거나 삭제하세요.');
}

export function clearOfflineSnapshots(user: User) {
  return workspaceTransaction((current) =>
    current &&
    sameAccount(current.owner, user) &&
    !current.sites.some((site) => pending(site.draft))
      ? undefined
      : current,
  );
}
