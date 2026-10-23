import { Button } from '../ui/button';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SiteListItem } from '../../types';
import { mapMarker } from '../../lib/mapMarker';
import { loadNaverMaps, MAP_AUTH_ERROR } from '../../lib/naverMaps';
import type { MapInstance, NaverMaps } from '../../lib/naverMaps';
import { LocateFixed } from 'lucide-react';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import { hasCoordinates } from '../../lib/coordinates';

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
  const [map, setMap] = useState<MapInstance>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const selectionHandler = useRef(onSelect);
  useLayoutEffect(() => {
    selectionHandler.current = onSelect;
  }, [onSelect]);
  const location = useCurrentLocation(!!sdk);
  const centeredOnPosition = useRef(false);
  const fallbackFramed = useRef(false);
  const markerCleanups = useRef(new Set<() => void>());
  const valid = useMemo(() => sites.filter(hasCoordinates), [sites]);

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
    setMap(undefined);
    if (!sdk || !container.current) return;
    const element = container.current;
    const cleanups = markerCleanups.current;
    let instance: MapInstance | undefined;
    let resize: ResizeObserver | undefined;
    try {
      instance = new sdk.Map(element, { center: new sdk.LatLng(35.8251, 128.7414), zoom: 13 });
      centeredOnPosition.current = false;
      fallbackFramed.current = false;
      setMap(instance);
      resize = new ResizeObserver(() => instance?.autoResize());
      resize.observe(element);
    } catch {
      setError('지도를 표시하지 못했습니다. 다시 시도하거나 아래 목록을 이용하세요.');
    }
    return () => {
      resize?.disconnect();
      // Detach overlays before destroy(); NAVER invalidates their map internals.
      cleanups.forEach((dispose) => dispose());
      instance?.destroy();
      element.replaceChildren();
    };
  }, [sdk, retry]);

  // Filter updates replace only work markers, preserving the user's map viewport.
  useEffect(() => {
    if (!sdk || !map) return;
    const markers: InstanceType<NaverMaps['Marker']>[] = [];
    const listeners: object[] = [];
    const dispose = () => {
      if (!markerCleanups.current.delete(dispose)) return;
      listeners.forEach((listener) => sdk.Event.removeListener(listener));
      markers.forEach((marker) => marker.setMap(null));
    };
    markerCleanups.current.add(dispose);
    try {
      valid.forEach((site) => {
        const appearance = mapMarker(site);
        const marker = new sdk.Marker({
          map,
          position: new sdk.LatLng(site.latitude, site.longitude),
          title: `${site.name} · ${site.managementNo} · ${appearance.label}`,
          icon: {
            content: appearance.content,
            size: { width: 32, height: 32 },
            anchor: { x: 16, y: 16 },
          },
          zIndex: appearance.zIndex,
        });
        markers.push(marker);
        listeners.push(
          sdk.Event.addListener(marker, 'click', () => selectionHandler.current(site.id)),
        );
      });
    } catch {
      setError('수용가 마커를 표시하지 못했습니다. 아래 목록을 이용하세요.');
    }
    return dispose;
  }, [sdk, map, valid]);

  useEffect(() => {
    if (!sdk || !map || !location.position) return;
    const point = new sdk.LatLng(location.position.latitude, location.position.longitude);
    const self = new sdk.Marker({
      map,
      position: point,
      title: '내 현재 위치',
      zIndex: 1000,
      icon: {
        content:
          '<div class="self-location-marker" role="img" aria-label="내 현재 위치"><span></span></div>',
        size: { width: 32, height: 32 },
        anchor: { x: 16, y: 16 },
      },
    });
    if (!centeredOnPosition.current) {
      map.setCenter(point);
      map.setZoom(16);
      centeredOnPosition.current = true;
    }
    const dispose = () => {
      if (markerCleanups.current.delete(dispose)) self.setMap(null);
    };
    markerCleanups.current.add(dispose);
    return dispose;
  }, [sdk, map, location.position]);

  useEffect(() => {
    if (
      !sdk ||
      !map ||
      location.position ||
      location.loading ||
      fallbackFramed.current ||
      !valid.length
    )
      return;
    if (valid.length > 1)
      map.fitBounds(
        valid.map((site) => new sdk.LatLng(site.latitude, site.longitude)),
        { top: 40, right: 40, bottom: 40, left: 40, maxZoom: 16 },
      );
    else map.setCenter(new sdk.LatLng(valid[0].latitude, valid[0].longitude));
    fallbackFramed.current = true;
  }, [sdk, map, valid, location.position, location.loading]);

  function showMyLocation() {
    if (sdk && map && location.position) {
      map.setCenter(new sdk.LatLng(location.position.latitude, location.position.longitude));
      map.setZoom(16);
      centeredOnPosition.current = true;
    } else centeredOnPosition.current = false;
    location.retry();
  }
  return (
    <section className="panel map-fallback">
      {(!sdk || error) && (
        <p role="status">
          {!clientId
            ? '지도 설정이 필요합니다. frontend/.env.local에 VITE_NAVER_MAP_CLIENT_ID를 설정하고 서버를 재시작하세요. 아래 목록은 계속 이용할 수 있습니다.'
            : error || 'NAVER 지도를 불러오는 중입니다…'}
        </p>
      )}
      {error && (
        <Button
          variant="outline"
          className="outline-btn"
          onClick={() => setRetry((value) => value + 1)}
        >
          지도 다시 시도
        </Button>
      )}
      {sites.length > valid.length && (
        <p className="form-error">
          좌표 누락·오류 {sites.length - valid.length}건은 마커에서 제외했습니다. 목록에서 상세를 열
          수 있습니다.
        </p>
      )}
      <div className="map-canvas-wrap">
        <div
          ref={container}
          className={`naver-map${sdk && !error ? ' sdk-ready' : ''}`}
          aria-label="NAVER 현장지도"
          hidden={!sdk || !!error}
        />
        {sdk && !error && (
          <>
            <div className="map-legend" aria-label="지도 마커 범례">
              <span className="pending">미처리</span>
              <span className="started">시작검침완료</span>
              <span className="complete">검침완료</span>
            </div>
            <Button
              variant="ghost"
              className={`map-gps map-icon-button${location.position ? ' located' : ''}`}
              aria-label="현재 위치"
              title={location.error || '현재 위치'}
              disabled={!map || location.loading}
              onClick={showMyLocation}
            >
              <LocateFixed size={22} />
            </Button>
          </>
        )}
      </div>
      {sdk && location.error && (
        <details className="map-location-warning">
          <summary>위치 확인 필요</summary>
          <p role="status">{location.error}</p>
        </details>
      )}
    </section>
  );
}
