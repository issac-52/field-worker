import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteListItem } from '../../types';
import { loadNaverMaps, MAP_AUTH_ERROR } from '../../lib/naverMaps';
import type { MapInstance, NaverMaps } from '../../lib/naverMaps';
import { StatusBadge } from '../StatusBadge';

export function FieldMap({
  sites,
  onSelect,
}: {
  sites: SiteListItem[];
  onSelect: (id: number) => void;
}) {
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim() ?? '';
  const container = useRef<HTMLDivElement>(null);
  const [sdk, setSdk] = useState<NaverMaps>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<SiteListItem>();
  const valid = useMemo(
    () =>
      sites.filter(
        (site) =>
          Number.isFinite(site.latitude) &&
          Number.isFinite(site.longitude) &&
          Math.abs(site.latitude) <= 90 &&
          Math.abs(site.longitude) <= 180 &&
          !(site.latitude === 0 && site.longitude === 0),
      ),
    [sites],
  );

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    setError('');
    setSdk(undefined);
    const authFailure = () => {
      setError('NAVER 지도 인증에 실패했습니다. Client ID와 등록된 Web 서비스 URL을 확인하세요.');
      setSdk(undefined);
    };
    window.addEventListener(MAP_AUTH_ERROR, authFailure);
    void loadNaverMaps(clientId)
      .then((maps) => {
        if (active) setSdk(maps);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
      window.removeEventListener(MAP_AUTH_ERROR, authFailure);
    };
  }, [clientId, retry]);

  useEffect(() => {
    setSelected(undefined);
    if (!sdk || !container.current) return;
    const element = container.current;
    let map: MapInstance | undefined;
    const markers: InstanceType<NaverMaps['Marker']>[] = [];
    const listeners: object[] = [];
    let resize: ResizeObserver | undefined;
    try {
      map = new sdk.Map(element, {
        center: new sdk.LatLng(valid[0]?.latitude ?? 35.8251, valid[0]?.longitude ?? 128.7414),
        zoom: 13,
      });
      valid.forEach((site) => {
        const marker = new sdk.Marker({
          map,
          position: new sdk.LatLng(site.latitude, site.longitude),
          title: `${site.name} · ${site.managementNo}`,
        });
        markers.push(marker);
        listeners.push(sdk.Event.addListener(marker, 'click', () => setSelected(site)));
      });
      if (valid.length > 1)
        map.fitBounds(
          valid.map((site) => new sdk.LatLng(site.latitude, site.longitude)),
          { top: 32, right: 32, bottom: 32, left: 32, maxZoom: 16 },
        );
      resize = new ResizeObserver(() => map?.autoResize());
      resize.observe(element);
    } catch {
      setError('지도를 표시하지 못했습니다. 다시 시도하거나 아래 목록을 이용하세요.');
    }
    return () => {
      resize?.disconnect();
      listeners.forEach((listener) => sdk.Event.removeListener(listener));
      markers.forEach((marker) => marker.setMap(null));
      map?.destroy();
      element.replaceChildren();
    };
  }, [sdk, valid, retry]);

  return (
    <section className="panel map-fallback">
      <p role="status">
        {!clientId
          ? '지도 설정이 필요합니다. frontend/.env.local에 VITE_NAVER_MAP_CLIENT_ID를 설정하고 서버를 재시작하세요. 아래 목록은 계속 이용할 수 있습니다.'
          : error ||
            (sdk ? `현재 페이지 마커 ${valid.length}건` : 'NAVER 지도를 불러오는 중입니다…')}
      </p>
      {error && (
        <button className="outline-btn" onClick={() => setRetry((value) => value + 1)}>
          지도 다시 시도
        </button>
      )}
      <small>
        지도와 아래 목록은 같은 조회 조건의 현재 페이지만 표시합니다. 전체 수용가 지도는 아닙니다.
      </small>
      {sites.length > valid.length && (
        <p className="form-error">
          좌표 누락·오류 {sites.length - valid.length}건은 마커에서 제외했습니다. 목록에서 상세를 열
          수 있습니다.
        </p>
      )}
      <div
        ref={container}
        className={`naver-map${sdk && !error ? ' sdk-ready' : ''}`}
        aria-label="NAVER 현장지도"
        hidden={!sdk || !!error}
      />
      {selected && !error && (
        <div className="map-selection">
          <b>
            {selected.name} · {selected.managementNo}
          </b>
          <p>{selected.address}</p>
          <StatusBadge site={selected} />
          <button className="primary-btn" onClick={() => onSelect(selected.id)}>
            상세 검침으로 이동
          </button>
        </div>
      )}
    </section>
  );
}
