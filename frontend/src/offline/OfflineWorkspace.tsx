import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { preparePhoto } from '../lib/photos';
import { LIVE_PHOTO_SLOTS, PHASE_LABEL, PHOTO_LABEL, type Phase, type PhotoSlot } from '../types';
import {
  canReadOffline,
  editSavedSite,
  pending,
  readWorkspace,
  type SavedSite,
  type Workspace,
} from './storage';
import { sendSiteDraft, validateReading } from './sync';

function DraftReading({
  site,
  phase,
  busy,
  save,
  discard,
}: {
  site: SavedSite;
  phase: Phase;
  busy: boolean;
  save: (date: string, reading: string) => void;
  discard: () => void;
}) {
  const draft = site.draft.readings[phase];
  const recorded = site.readings[phase];
  const year = phase === 'START' ? '2026' : '2027';
  const [date, setDate] = useState(draft?.date ?? '');
  const [reading, setReading] = useState(draft ? String(draft.reading) : '');
  const hasStart = site.draft.readings.START || site.readings.START;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(date, reading);
  }
  return (
    <section className="offline-entry">
      <h3>{PHASE_LABEL[phase]}</h3>
      {recorded && (
        <p>
          서버에서 받은 기록 {recorded.date} · 지침 {recorded.reading}
        </p>
      )}
      {draft && (
        <p>
          전송 대기 {draft.date} · 지침 {draft.reading}{' '}
          <Button variant="outline" size="sm" disabled={busy} onClick={discard}>
            대기 검침 삭제
          </Button>
        </p>
      )}
      {!recorded && (phase === 'START' || hasStart) && (
        <form onSubmit={submit}>
          <label className="field">
            검침일자
            <input
              type="date"
              required
              min={year + '-01-01'}
              max={year + '-12-31'}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            계량지침
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              required
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            기기에 임시 저장
          </Button>
        </form>
      )}
    </section>
  );
}

function DraftPhoto({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <img className="offline-photo" src={url} alt={label} /> : null;
}

export function OfflineWorkspace({ exit }: { exit: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [selected, setSelected] = useState<number>();
  const [slot, setSlot] = useState<PhotoSlot>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  async function reload() {
    const saved = await readWorkspace();
    setWorkspace(saved && canReadOffline(saved) ? saved : undefined);
  }
  useEffect(() => {
    let mounted = true;
    void readWorkspace()
      .then((saved) => {
        if (mounted && saved && canReadOffline(saved)) setWorkspace(saved);
      })
      .catch(() => {
        if (mounted) setError('이 기기의 저장 공간을 열 수 없습니다.');
      });
    const connection = () => setOnline(navigator.onLine);
    const accessChange = () => {
      void reload().catch(() => setWorkspace(undefined));
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('storage', accessChange);
    window.addEventListener('offline-sync-finished', accessChange);
    return () => {
      mounted = false;
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('storage', accessChange);
      window.removeEventListener('offline-sync-finished', accessChange);
    };
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '작업을 마치지 못했습니다. 다시 시도하세요.',
      );
    } finally {
      await reload().catch(() => setError('이 기기의 저장 상태를 확인하지 못했습니다.'));
      setBusy(false);
    }
  }
  const site =
    workspace?.sites.find(({ id }) => id === selected) ??
    (workspace?.sites.length === 1 ? workspace.sites[0] : undefined);
  const slots = LIVE_PHOTO_SLOTS.filter((value) => !site?.occupiedSlots.includes(value));
  const activeSlot = slot && slots.includes(slot) ? slot : slots[0];

  function addPhoto(owner: Workspace['owner'], site: SavedSite, slot: PhotoSlot, file: File) {
    void run(async () => {
      const blob = await preparePhoto(file);
      await editSavedSite(owner, site.id, (current) => {
        if (current.occupiedSlots.includes(slot)) throw new Error('이미 등록된 사진 영역입니다.');
        current.draft.photos[slot] = { id: crypto.randomUUID(), blob };
        return current;
      });
    }, '사진을 기기에 저장했습니다. 서버 전송을 기다리고 있습니다.');
  }

  return (
    <main className="offline-workspace">
      <div className="offline-heading">
        <h1>오프라인 작업</h1>
        <Button variant="outline" disabled={busy} onClick={exit}>
          온라인 화면으로
        </Button>
      </div>
      <p>
        {online
          ? '연결됨 · 임시 저장한 작업을 전송할 수 있습니다.'
          : '연결 끊김 · 검침과 사진을 기기에 저장합니다.'}
      </p>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {workspace?.sites.length ? (
        <label className="field">
          저장한 수용가
          <select
            value={site?.id ?? ''}
            disabled={busy}
            onChange={(e) => {
              setSelected(Number(e.target.value));
              setSlot(undefined);
            }}
          >
            <option value="" disabled>
              수용가 선택
            </option>
            {workspace.sites.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label} · {row.address} · 전송 대기 {pending(row.draft)}건
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>
          저장된 수용가가 없습니다. 온라인에서 수용가 상세를 열면 최근 수용가가 자동으로 저장됩니다.
        </p>
      )}
      {workspace && site && (
        <>
          <section className="offline-entry">
            <h2>{site.label}</h2>
            <p>{site.address}</p>
            <p>계량기번호 {site.meterNo || '미기재'}</p>
          </section>
          {(['START', 'END'] as const).map((phase) => (
            <DraftReading
              key={site.id + phase}
              site={site}
              phase={phase}
              busy={busy}
              save={(date, value) =>
                void run(
                  () =>
                    editSavedSite(workspace.owner, site.id, (current) => {
                      if (current.readings[phase])
                        throw new Error('이미 등록된 검침은 온라인에서 수정하세요.');
                      const start =
                        current.draft.readings.START?.reading ?? current.readings.START?.reading;
                      const reading = validateReading(phase, date, value, start);
                      if (
                        phase === 'START' &&
                        current.draft.readings.END &&
                        reading.reading > current.draft.readings.END.reading
                      )
                        throw new Error('종료 지침보다 큰 시작 지침은 저장할 수 없습니다.');
                      current.draft.readings[phase] = reading;
                      return current;
                    }),
                  '검침을 기기에 저장했습니다. 서버 전송을 기다리고 있습니다.',
                )
              }
              discard={() => {
                if (!window.confirm('이 기기에 저장한 대기 검침을 삭제할까요?')) return;
                void run(
                  () =>
                    editSavedSite(workspace.owner, site.id, (current) => {
                      if (
                        phase === 'START' &&
                        !current.readings.START &&
                        current.draft.readings.END
                      )
                        throw new Error('종료 대기 검침을 먼저 삭제하세요.');
                      delete current.draft.readings[phase];
                      return current;
                    }),
                  '대기 검침을 삭제했습니다.',
                );
              }}
            />
          ))}
          <section className="offline-entry">
            <h3>현장 사진</h3>
            {Object.entries(site.draft.photos).map(([key, photo]) => (
              <div className="offline-photo-row" key={photo.id}>
                <DraftPhoto blob={photo.blob} label={PHOTO_LABEL[key as PhotoSlot]} />
                <span>{PHOTO_LABEL[key as PhotoSlot]} · 전송 대기</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('이 기기에 저장한 대기 사진을 삭제할까요?')) return;
                    void run(
                      () =>
                        editSavedSite(workspace.owner, site.id, (current) => {
                          delete current.draft.photos[key as PhotoSlot];
                          return current;
                        }),
                      '대기 사진을 삭제했습니다.',
                    );
                  }}
                >
                  삭제
                </Button>
              </div>
            ))}
            {activeSlot ? (
              <>
                <label className="field">
                  사진 영역
                  <select
                    value={activeSlot}
                    disabled={busy}
                    onChange={(e) => setSlot(e.target.value as PhotoSlot)}
                  >
                    {slots.map((value) => (
                      <option key={value} value={value}>
                        {PHOTO_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  촬영 또는 사진 선택
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) addPhoto(workspace.owner, site, activeSlot, file);
                    }}
                  />
                </label>
              </>
            ) : (
              <p>서버에 등록된 사진은 온라인에서 교체할 수 있습니다.</p>
            )}
          </section>
          <div className="offline-heading">
            <Button
              disabled={busy || !online || pending(site.draft) === 0}
              onClick={() =>
                void run(() => sendSiteDraft(workspace.owner, site), '서버 전송을 확인했습니다.')
              }
            >
              {busy ? '처리 중…' : '이 수용가 서버로 전송'}
            </Button>
            <Button
              variant="outline"
              disabled={busy || pending(site.draft) > 0}
              onClick={() =>
                void run(
                  () =>
                    editSavedSite(workspace.owner, site.id, (current) => {
                      if (pending(current.draft)) throw new Error('미전송 항목을 먼저 정리하세요.');
                      return undefined;
                    }),
                  '기기에 저장한 수용가를 지웠습니다.',
                )
              }
            >
              기기에서 지우기
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
