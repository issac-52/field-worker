import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle } from 'lucide-react';
import { api } from '../../api';
import { useWork } from '../../context/WorkContext';
import type { Site } from '../../types';
import { hasCoordinates, locationMapMatches } from '../../lib/locationMap';
import type { SaveLocationMap } from '../../lib/locationMap';
import { loadNaverMaps, MAP_AUTH_ERROR } from '../../lib/naverMaps';
import { createLocationMapPreview } from '../../lib/locationMapPreview';

type Point = { latitude: number; longitude: number };
function DynamicPreview({
  site,
  editing,
  onPick,
}: {
  site: Site;
  editing: boolean;
  onPick: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const valid = hasCoordinates(site);
  // Missing coordinates start at the existing work-region view, with no invented site marker.
  const latitude = valid ? site.latitude : 35.8251;
  const longitude = valid ? site.longitude : 128.7414;
  useEffect(() => {
    let active = true;
    let preview: ReturnType<typeof createLocationMapPreview> | undefined;
    let resize: ResizeObserver | undefined;
    setError('');
    setReady(false);
    const authFailure = () => {
      if (active) setError('지도 인증을 확인하세요.');
    };
    window.addEventListener(MAP_AUTH_ERROR, authFailure);
    void loadNaverMaps(import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim() ?? '')
      .then((sdk) => {
        if (!active || !container.current) return;
        preview = createLocationMapPreview(
          sdk,
          container.current,
          latitude,
          longitude,
          valid ? 16 : 13,
          editing ? { onPick: (point) => pick.current(point), showMarker: valid } : undefined,
        );
        resize = new ResizeObserver(() => preview?.resize());
        resize.observe(container.current);
        setReady(true);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '지도를 표시하지 못했습니다.');
      });
    return () => {
      active = false;
      window.removeEventListener(MAP_AUTH_ERROR, authFailure);
      resize?.disconnect();
      preview?.dispose();
    };
  }, [latitude, longitude, valid, editing, retry]);
  return (
    <>
      <div
        ref={container}
        className={`location-map-preview${editing ? ' editing' : ''}`}
        aria-label={editing ? '수용가 위치 선택 지도' : '선택 수용가 단일 마커 위치도'}
        hidden={!!error}
      />
      {error ? (
        <p role="alert">
          {error}{' '}
          <button className="text-btn" onClick={() => setRetry((value) => value + 1)}>
            지도 다시 시도
          </button>
        </p>
      ) : (
        !ready && <p role="status">지도 준비 중…</p>
      )}
    </>
  );
}

export function LocationMapPanel({ site }: { site: Site }) {
  return <LocationMapContent key={site.id} site={site} />;
}

function LocationMapContent({ site }: { site: Site }) {
  const { role } = useWork();
  const client = useQueryClient();
  const queryKey = ['location-map', role, site.id];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.locationMap(site.id, signal),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Point>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const locked = useRef(false);
  const attempt = useRef<{ body: SaveLocationMap; key: string } | undefined>(undefined);
  const baseline = useRef({ latitude: site.latitude, longitude: site.longitude });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const image = query.data?.image;
  const valid = hasCoordinates(site);
  const stale = !!image && (!locationMapMatches(image, site) || query.data?.stale);
  const current = !!image && !stale;
  const canSave = __MOCKS_ENABLED__ && valid && !busy && !!query.data && !query.isError;

  async function saveMap() {
    if (!canSave || locked.current || current || editing) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const body: SaveLocationMap = {
      regenerate: !!image,
      ...(image ? { expectedGenerationId: image.generationId } : {}),
    };
    try {
      if (!attempt.current || JSON.stringify(attempt.current.body) !== JSON.stringify(body))
        attempt.current = { body, key: crypto.randomUUID() };
      const result = await api.saveLocationMap(site.id, body, attempt.current.key);
      client.setQueryData(queryKey, result);
      if (mounted.current) {
        attempt.current = undefined;
      }
    } catch (reason) {
      if (mounted.current) {
        setError(
          reason instanceof Error ? reason.message : '저장하지 못했습니다. 다시 시도하세요.',
        );
        void query.refetch();
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function startEditing() {
    baseline.current = { latitude: site.latitude, longitude: site.longitude };
    setDraft(undefined);
    setError('');
    setMessage('');
    setEditing(true);
  }
  async function savePosition() {
    if (!__MOCKS_ENABLED__ || !draft || !hasCoordinates(draft) || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.updateCoordinates(site.id, {
        ...draft,
        expectedLatitude: baseline.current.latitude,
        expectedLongitude: baseline.current.longitude,
      });
      client.setQueryData(['site', role, site.id], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sites'] }),
        client.invalidateQueries({ queryKey: ['location-map', role, site.id] }),
      ]);
      if (mounted.current) {
        setEditing(false);
        setDraft(undefined);
        attempt.current = undefined;
        setMessage('위치를 변경했습니다.');
      }
    } catch (reason) {
      if (mounted.current) {
        setError(reason instanceof Error ? reason.message : '위치를 저장하지 못했습니다.');
        // Refresh authoritative state, but retain the user's picked draft until cancel/retry.
        void client.invalidateQueries({ queryKey: ['site', role, site.id] });
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="location-map-panel" aria-label="자동 위치도" aria-busy={busy}>
      <div className="panel-title">
        <h3>위치도</h3>
        <span className={`location-map-state${current && !editing ? ' saved' : ''}`}>
          {query.isPending ? (
            '확인 중'
          ) : editing ? (
            '위치 선택 중'
          ) : current ? (
            <>
              <Check size={14} />
              저장 완료
            </>
          ) : stale ? (
            '업데이트 필요'
          ) : (
            '미저장'
          )}
        </span>
      </div>
      {valid || editing ? (
        <>
          {current && image?.storageMode === 'R2' && query.data?.imageUrl && !editing ? (
            <img
              className="location-map-image"
              src={query.data.imageUrl}
              alt="저장된 수용가 위치도"
            />
          ) : (
            <DynamicPreview site={site} editing={editing} onPick={setDraft} />
          )}
        </>
      ) : (
        <p className="hint">등록된 위치가 없습니다. 지도에서 수용가 위치를 지정하세요.</p>
      )}
      {editing ? (
        <>
          <p className="hint" role="status">
            {draft
              ? '선택한 위치에 마커를 표시했습니다. 위치 저장을 눌러 확정하세요.'
              : '지도를 이동·확대하고 수용가가 있는 지점을 누르세요.'}
          </p>
          <div className="location-map-actions">
            <button
              className="outline-btn"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(undefined);
                setError('');
              }}
            >
              취소
            </button>
            <button
              className="primary-btn"
              disabled={!draft || busy}
              onClick={() => void savePosition()}
            >
              {busy && <LoaderCircle className="location-map-spinner" size={16} />}
              {busy ? '저장 중…' : '위치 저장'}
            </button>
          </div>
        </>
      ) : (
        <>
          {stale && <p className="hint">위치가 변경되었습니다. 위치도를 다시 생성하세요.</p>}
          <div className="location-map-actions">
            {!current && (
              <button className="primary-btn" disabled={!canSave} onClick={() => void saveMap()}>
                {busy && <LoaderCircle className="location-map-spinner" size={16} />}
                {busy ? '저장 중…' : stale ? '위치도 다시 생성' : '위치도 저장'}
              </button>
            )}
            <button
              className="text-btn"
              disabled={busy || !__MOCKS_ENABLED__}
              onClick={startEditing}
            >
              {valid ? '위치 수정' : '위치 지정'}
            </button>
          </div>
        </>
      )}
      {query.isError && (
        <p role="alert">
          저장 상태를 확인하지 못했습니다.{' '}
          <button className="text-btn" onClick={() => void query.refetch()}>
            다시 확인
          </button>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="location-map-result" role="status">
          {message}
        </p>
      )}
      {__MOCKS_ENABLED__ ? (
        <small className="location-map-demo-note">
          시연: 위치·저장 상태는 새로고침 시 초기화됩니다. 실제 위치도 파일·R2 저장은 하지 않습니다.
        </small>
      ) : (
        <small className="location-map-demo-note">
          실제 저장·위치 수정은 서버 연동 전까지 비활성입니다.
        </small>
      )}
    </section>
  );
}
