import { delay, http } from 'msw';
import { store } from '../store';
import { err, ok, publicSite } from '../http';
import { hasCoordinates, LOCATION_MAP_OPTIONS, locationMapMatches } from '../../lib/locationMap';
import type { LocationMapImage, LocationMapState, SaveLocationMap } from '../../lib/locationMap';

// Metadata only. No Static Map requests, image bytes, signed URLs or R2 writes.
export const mockLocationMaps = new Map<number, LocationMapImage>();
const inFlight = new Set<number>();
const requests = new Map<string, { body: string; result: Promise<Response> }>();

function state(siteId: number): LocationMapState {
  const site = store.sites.find((value) => value.id === siteId)!;
  const image = mockLocationMaps.get(siteId) ?? null;
  return { image, stale: !!image && !locationMapMatches(image, site), imageUrl: null };
}

export const locationMapsHandlers = [
  http.patch('/api/sites/:id/coordinates', async ({ params, request }) => {
    const site = store.sites.find((value) => value.id === Number(params.id));
    if (!site) return err('수용가 없음', 404);
    let body: {
      latitude: number;
      longitude: number;
      expectedLatitude: number | null;
      expectedLongitude: number | null;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return err('요청 형식을 확인하세요.');
    }
    if (
      !body ||
      !hasCoordinates(body) ||
      Object.keys(body).some(
        (key) => !['latitude', 'longitude', 'expectedLatitude', 'expectedLongitude'].includes(key),
      )
    )
      return err('지정한 위치의 좌표를 확인하세요.', 422);
    if (site.latitude === body.latitude && site.longitude === body.longitude)
      return ok(publicSite(site, request));
    if (body.expectedLatitude !== site.latitude || body.expectedLongitude !== site.longitude)
      return err('다른 사용자가 위치를 변경했습니다. 새로 조회한 뒤 다시 지정하세요.', 409);
    site.latitude = body.latitude;
    site.longitude = body.longitude;
    // Existing location-map metadata stays intact and becomes stale automatically.
    return ok(publicSite(site, request));
  }),
  http.get('/api/sites/:id/location-map', ({ params }) => {
    const id = Number(params.id);
    if (!store.sites.some((site) => site.id === id)) return err('수용가 없음', 404);
    return ok(state(id));
  }),
  http.post('/api/sites/:id/location-map', async ({ params, request }) => {
    const id = Number(params.id);
    const site = store.sites.find((value) => value.id === id);
    if (!site) return err('수용가 없음', 404);
    if (!hasCoordinates(site)) return err('유효한 수용가 좌표가 필요합니다.', 422);
    let body: SaveLocationMap;
    try {
      body = (await request.json()) as SaveLocationMap;
    } catch {
      return err('요청 형식을 확인하세요.');
    }
    if (
      !body ||
      typeof body.regenerate !== 'boolean' ||
      Object.keys(body).some((key) => !['regenerate', 'expectedGenerationId'].includes(key)) ||
      (body.expectedGenerationId !== undefined && typeof body.expectedGenerationId !== 'string')
    )
      return err('좌표와 생성 옵션은 서버가 결정합니다. regenerate 요청만 허용합니다.');
    const key = request.headers.get('Idempotency-Key');
    if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))
      return err('유효한 Idempotency-Key가 필요합니다.');
    const scope = `${request.headers.get('X-Demo-Role') ?? 'WORKER'}:${id}:${key}`;
    const digest = JSON.stringify(body);
    const previous = requests.get(scope);
    if (previous) {
      if (previous.body !== digest)
        return err('같은 멱등 키에 다른 요청을 사용할 수 없습니다.', 409);
      return (await previous.result).clone();
    }
    if (request.headers.get('X-Demo-Location-Map-Failure') === 'true') {
      await delay(450);
      return err(
        '시연용 저장 실패입니다. 실제 API와 R2는 호출하지 않았습니다. 다시 시도하세요.',
        503,
      );
    }
    const current = state(id);
    if (!body.regenerate && current.image && !current.stale) {
      const response = ok({ ...current, reused: true });
      requests.set(scope, { body: digest, result: Promise.resolve(response.clone()) });
      return response;
    }
    if (current.image && current.stale && !body.regenerate)
      return err('좌표 또는 생성 설정이 변경되었습니다. 명시적으로 재생성하세요.', 409);
    if (
      body.regenerate &&
      (!current.image || body.expectedGenerationId !== current.image.generationId)
    )
      return err('위치도 버전이 변경되었습니다. 현재 상태를 다시 조회하세요.', 409);
    if (inFlight.has(id))
      return err('이 수용가의 위치도를 저장 중입니다. 잠시 후 다시 시도하세요.', 409);
    inFlight.add(id);
    // Capture authoritative coordinates before the simulated external work.
    const latitude = site.latitude;
    const longitude = site.longitude;
    const result = (async () => {
      try {
        await delay(600);
        if (site.latitude !== latitude || site.longitude !== longitude)
          return err('저장 중 수용가 좌표가 변경되었습니다. 다시 조회하세요.', 409);
        const generationId = crypto.randomUUID();
        mockLocationMaps.set(id, {
          generationId,
          siteId: id,
          imageType: 'LOCATION_MAP',
          storageMode: 'MOCK',
          storageKey: `mock-only/sites/${id}/location-map/${generationId}.png`,
          contentType: 'image/png',
          fileSize: null,
          source: 'NAVER_STATIC_MAP',
          generatedAt: new Date().toISOString(),
          centerLatitude: latitude,
          centerLongitude: longitude,
          ...LOCATION_MAP_OPTIONS,
        });
        return ok({ ...state(id), reused: false });
      } finally {
        inFlight.delete(id);
      }
    })();
    requests.set(scope, { body: digest, result });
    const response = await result;
    if (!response.ok) requests.delete(scope);
    return response.clone();
  }),
];
