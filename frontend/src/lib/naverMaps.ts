export type MapPoint = object;
export type MapInstance = {
  destroy(): void;
  autoResize(): void;
  fitBounds(points: MapPoint[], options?: object): void;
  setCenter(point: MapPoint): void;
  setZoom(zoom: number): void;
};
export type NaverMaps = {
  LatLng: new (lat: number, lng: number) => MapPoint;
  Map: new (element: HTMLElement, options: object) => MapInstance;
  Marker: new (options: object) => { setMap(map: MapInstance | null): void };
  Event: {
    addListener(target: object, event: string, callback: () => void): object;
    removeListener(listener: object): void;
  };
};
type NaverWindow = Window & {
  naver?: { maps?: NaverMaps };
  navermap_authFailure?: () => void;
  [key: `__fieldMapReady${number}`]: (() => void) | undefined;
};
export const MAP_AUTH_ERROR = 'field-map-auth-error';
let pending: Promise<NaverMaps> | undefined;
let ready: NaverMaps | undefined;
let attempt = 0;
let rejectPending: ((error: Error) => void) | undefined;
let authHandlerInstalled = false;

// Shared across StrictMode remounts: at most one SDK request in flight.
export function loadNaverMaps(clientId: string, timeoutMs = 15000): Promise<NaverMaps> {
  if (!clientId.trim())
    return Promise.reject(
      new Error('VITE_NAVER_MAP_CLIENT_ID를 설정하고 개발 서버를 재시작하세요.'),
    );
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;
  const target = window as unknown as NaverWindow;
  if (!authHandlerInstalled) {
    const previous = target.navermap_authFailure;
    target.navermap_authFailure = () => {
      ready = undefined;
      rejectPending?.(
        new Error(
          'NAVER 지도 인증에 실패했습니다. Client ID, Web 서비스 URL 및 Maps 사용 설정을 확인하세요.',
        ),
      );
      window.dispatchEvent(new Event(MAP_AUTH_ERROR));
      previous?.();
    };
    authHandlerInstalled = true;
  }
  const callback = `__fieldMapReady${++attempt}` as const;
  const script = document.createElement('script');
  script.dataset.fieldMapSdk = 'true';
  script.async = true;
  const url = new URL('https://oapi.map.naver.com/openapi/v3/maps.js');
  url.searchParams.set('ncpKeyId', clientId.trim());
  url.searchParams.set('callback', callback);
  script.src = url.toString();
  pending = new Promise<NaverMaps>((resolve, reject) => {
    let settled = false;
    let probe: ReturnType<typeof setInterval> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(probe);
      delete target[callback];
      script.onerror = null;
      script.onload = null;
      rejectPending = undefined;
      if (error) {
        script.remove();
        reject(error);
      } else {
        ready = target.naver!.maps!;
        resolve(ready);
      }
    };
    const timer = setTimeout(
      () =>
        finish(new Error('지도 로딩 시간이 초과되었습니다. 네트워크를 확인한 후 다시 시도하세요.')),
      timeoutMs,
    );
    rejectPending = (error) => finish(error);
    const checkReady = () => {
      if (target.naver?.maps?.Map) finish();
      else if (!probe)
        probe = setInterval(() => {
          if (target.naver?.maps?.Map) finish();
        }, 50);
    };
    target[callback] = checkReady;
    script.onload = checkReady;
    script.onerror = () =>
      finish(
        new Error('지도 SDK를 내려받지 못했습니다. 네트워크 또는 브라우저 차단 설정을 확인하세요.'),
      );
    document.querySelectorAll('script[data-field-map-sdk]').forEach((old) => old.remove());
    document.head.appendChild(script);
  }).finally(() => {
    pending = undefined;
  });
  return pending;
}
