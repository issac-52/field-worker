import { useEffect, useRef, useState } from 'react';
import type { SiteListItem } from '../../types';

// The deployment integration supplies an authenticated NAVER SDK before mounting.
type Point = object;
type Marker = { setMap(map: object | null): void };
type Maps = {
  LatLng: new (lat: number, lng: number) => Point;
  Map: new (el: HTMLElement, options: object) => object;
  Marker: new (options: object) => Marker;
  Event: {
    addListener(target: object, event: string, callback: () => void): object;
    removeListener(listener: object): void;
  };
};
export function FieldMap({
  sites,
  onSelect,
}: {
  sites: SiteListItem[];
  onSelect: (id: number) => void;
}) {
  const sdkAvailable = !!(window as Window & { naver?: { maps: Maps } }).naver?.maps;
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState('지도 연결 준비 중입니다. 아래 수용가 목록을 이용하세요.');
  const [selected, setSelected] = useState<SiteListItem>();
  useEffect(() => {
    setSelected(undefined);
    const maps = (window as Window & { naver?: { maps: Maps } }).naver?.maps;
    const valid = sites.filter(
      (s) =>
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude) &&
        Math.abs(s.latitude) <= 90 &&
        Math.abs(s.longitude) <= 180,
    );
    if (!maps || !container.current) return;
    const markers: Marker[] = [];
    const listeners: object[] = [];
    try {
      const map = new maps.Map(container.current, {
        center: new maps.LatLng(valid[0]?.latitude ?? 35.8251, valid[0]?.longitude ?? 128.7414),
        zoom: 13,
      });
      valid.forEach((s) => {
        const marker = new maps.Marker({
          map,
          position: new maps.LatLng(s.latitude, s.longitude),
          title: `${s.name} · ${s.managementNo}`,
        });
        markers.push(marker);
        listeners.push(maps.Event.addListener(marker, 'click', () => setSelected(s)));
      });
      setState(`현재 페이지의 수용가 ${valid.length}건`);
    } catch {
      setState('지도를 불러오지 못했습니다. 아래 수용가 목록을 이용하세요.');
    }
    return () => {
      listeners.forEach((l) => maps.Event.removeListener(l));
      markers.forEach((m) => m.setMap(null));
      container.current?.replaceChildren();
    };
  }, [sites]);
  return (
    <section className="panel map-fallback">
      <p role="status">{state}</p>
      <div
        ref={container}
        className={sdkAvailable ? 'naver-map sdk-ready' : 'naver-map'}
        aria-label="NAVER 현장지도"
      />
      {selected && (
        <div className="map-selection">
          <b>
            {selected.name} · {selected.managementNo}
          </b>
          <p>{selected.address}</p>
          <button className="primary-btn" onClick={() => onSelect(selected.id)}>
            상세 검침으로 이동
          </button>
        </div>
      )}
    </section>
  );
}
