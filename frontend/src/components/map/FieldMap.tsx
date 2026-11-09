import { Button } from '../ui/button';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { call, query } from '../../api/client';
import { validViewport, validMapArea, MAP_MIN_ZOOM } from '../../lib/mapViewport';
import type { MapViewport, MapSites, MapCluster } from '../../lib/mapViewport';
import { mapMarkerForStatus } from '../../lib/mapMarker';
import { loadNaverMaps, MAP_AUTH_ERROR } from '../../lib/naverMaps';
import type { MapInstance, NaverMaps } from '../../lib/naverMaps';
import { LocateFixed } from 'lucide-react';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';

export function FieldMap({ onSelect }: { onSelect: (id: number) => void }) {
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

  const markerCleanups = useRef(new Set<() => void>());
  const [clusterSelection, setClusterSelection] = useState<MapCluster>();
  const [viewport, setViewport] = useState<MapViewport>();
  const [viewportNotice, setViewportNotice] = useState(
    '지도를 확대하면 이 지역 수용가가 표시됩니다.',
  );
  const markersQuery = useQuery({
    queryKey: ['map-sites', viewport],
    queryFn: async ({ signal }) => {
      if (validViewport(viewport!)) {
        const sites = await call<MapSites>('/map-sites' + query(viewport!), { signal });
        if (!sites.truncated) return sites;
      }
      const clusters = await call<{ clusters: MapCluster[]; total: number }>(
        '/map-clusters' + query(viewport!),
        { signal },
      );
      return { items: [], truncated: false, ...clusters };
    },
    enabled: !!viewport,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const valid = markersQuery.data?.items;
  const clusters = markersQuery.data?.clusters;

  useEffect(() => {
    setViewport(undefined);
    if (!sdk || !map) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        const sw = bounds.getSW();
        const ne = bounds.getNE();
        const next = {
          south: sw.lat(),
          north: ne.lat(),
          west: sw.lng(),
          east: ne.lng(),
          zoom: map.getZoom(),
        };
        if (validMapArea(next)) {
          setViewportNotice('');
          setViewport(next);
        } else {
          setViewport(undefined);
          setViewportNotice('지도 영역을 확인해 주세요.');
        }
      }, 250);
    };
    const moving = sdk.Event.addListener(map, 'bounds_changed', () => {
      clearTimeout(timer);
      setViewport(undefined);
      setClusterSelection(undefined);
      setViewportNotice('지도 이동 후 이 지역 수용가를 조회합니다.');
    });
    const idle = sdk.Event.addListener(map, 'idle', update);
    update();
    return () => {
      clearTimeout(timer);
      sdk.Event.removeListener(moving);
      sdk.Event.removeListener(idle);
    };
  }, [sdk, map]);

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

  // Fetch only the visible area; list pagination and search never affect these markers.
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
      clusters?.forEach((cluster) => {
        const count = Number(cluster.count);
        const marker = new sdk.Marker({
          map,
          position: new sdk.LatLng(cluster.latitude, cluster.longitude),
          title: `이 지역 수용가 ${count.toLocaleString()}건`,
          icon: {
            content: `<button type="button" class="region-cluster" aria-label="이 지역 수용가 ${count}건">${count.toLocaleString()}</button>`,
            size: { width: 52, height: 52 },
            anchor: { x: 26, y: 26 },
          },
          zIndex: 400,
        });
        markers.push(marker);
        listeners.push(sdk.Event.addListener(marker, 'click', () => setClusterSelection(cluster)));
      });
      valid?.forEach((site) => {
        const appearance = mapMarkerForStatus(site.status);
        const marker = new sdk.Marker({
          map,
          position: new sdk.LatLng(site.latitude, site.longitude),
          title: `수용가 ${site.id} · ${appearance.label}`,
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
  }, [sdk, map, valid, clusters]);

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
      map.setZoom(MAP_MIN_ZOOM);
      centeredOnPosition.current = true;
    }
    const dispose = () => {
      if (markerCleanups.current.delete(dispose)) self.setMap(null);
    };
    markerCleanups.current.add(dispose);
    return dispose;
  }, [sdk, map, location.position]);

  function showMyLocation() {
    if (sdk && map && location.position) {
      map.setCenter(new sdk.LatLng(location.position.latitude, location.position.longitude));
      map.setZoom(MAP_MIN_ZOOM);
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
      {sdk && !error && (
        <p role="status">
          {viewportNotice ||
            (markersQuery.isError
              ? '이 지역 수용가를 불러오지 못했습니다. 지도를 이동하거나 다시 시도하세요.'
              : markersQuery.isFetching
                ? '이 지역 수용가를 불러오는 중…'
                : markersQuery.data?.truncated
                  ? '이 지역에 수용가가 500건을 초과합니다. 지도를 더 확대해 주세요.'
                  : clusters
                    ? `현재 지도 영역의 수용가 ${markersQuery.data?.total?.toLocaleString() ?? 0}건 · 지역 점을 누르면 건수를 확인할 수 있습니다.`
                    : `현재 지도 영역의 수용가 ${valid?.length ?? 0}건 · 목록 검색 조건과 무관하게 표시됩니다.`)}
        </p>
      )}
      {clusterSelection && (
        <div className="cluster-summary" aria-live="polite">
          <strong>
            이 지역에 좌표가 등록된 수용가 {clusterSelection.count.toLocaleString()}건
          </strong>
          <Button
            variant="outline"
            className="outline-btn"
            onClick={() => {
              if (sdk && map) {
                map.setCenter(
                  new sdk.LatLng(clusterSelection.latitude, clusterSelection.longitude),
                );
                map.setZoom(Math.min(22, map.getZoom() + 2));
              }
              setClusterSelection(undefined);
            }}
          >
            이 지역 확대
          </Button>
          <Button
            variant="ghost"
            className="text-btn"
            onClick={() => setClusterSelection(undefined)}
          >
            닫기
          </Button>
        </div>
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
