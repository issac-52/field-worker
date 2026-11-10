import { call, ApiError } from '../api/client';
export type GeocodingRow = {
  id: number;
  consumerNumber: string | null;
  status: string;
  errorCode?: string;
  errorMessage?: string;
};
export type GeocodingResult = {
  nextId: number;
  throughId: number;
  done: boolean;
  rows: GeocodingRow[];
  errorCode?: string;
  errorMessage?: string;
};
export async function geocodingBatch(
  body: object,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry?: () => void,
) {
  const payload = JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    try {
      return await call<GeocodingResult>('/admin/geocoding', { method: 'POST', body: payload });
    } catch (error) {
      // HTML Cloudflare errors have HTTP_ERROR; application/NAVER/auth errors are not retried.
      if (
        !(error instanceof ApiError) ||
        ![502, 503, 504].includes(error.status) ||
        !['HTTP_ERROR', 'BACKEND_UNAVAILABLE'].includes(error.code)
      )
        throw error;
      if (attempt >= 2)
        throw new ApiError(
          error.status,
          'GEOCODING_CONNECTION_FAILED',
          '터널/백엔드 연결 실패로 중단했습니다. 이미 저장된 좌표는 유지됩니다. 잠시 후 다시 실행하세요.',
        );
      onRetry?.();
      await wait(1000 * (attempt + 1));
    }
  }
}
