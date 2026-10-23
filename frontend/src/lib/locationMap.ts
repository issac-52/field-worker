export const LOCATION_MAP_OPTIONS = {
  zoomLevel: 16,
  imageWidth: 640,
  imageHeight: 400,
  generationVersion: 'naver-static-v1',
} as const;

export function hasCoordinates<T extends { latitude: unknown; longitude: unknown }>(
  site: T,
): site is T & { latitude: number; longitude: number } {
  return (
    typeof site.latitude === 'number' &&
    typeof site.longitude === 'number' &&
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.latitude) <= 90 &&
    Math.abs(site.longitude) <= 180 &&
    !(site.latitude === 0 && site.longitude === 0)
  );
}

export type LocationMapImage = {
  generationId: string;
  siteId: number;
  imageType: 'LOCATION_MAP';
  storageMode: 'MOCK' | 'R2';
  storageKey: string;
  contentType: 'image/png';
  fileSize: number | null;
  source: 'NAVER_STATIC_MAP';
  generatedAt: string;
  centerLatitude: number;
  centerLongitude: number;
  zoomLevel: number;
  imageWidth: number;
  imageHeight: number;
  generationVersion: string;
};
export type LocationMapState = {
  image: LocationMapImage | null;
  stale: boolean;
  // A short-lived authenticated URL, only for a real stored file. Never in Mock.
  imageUrl: string | null;
};
export type SaveLocationMap = { regenerate: boolean; expectedGenerationId?: string };
export type LocationMapResult = LocationMapState & { reused: boolean };

export function locationMapMatches(
  image: LocationMapImage,
  site: { latitude: unknown; longitude: unknown },
) {
  return (
    hasCoordinates(site) &&
    image.centerLatitude === site.latitude &&
    image.centerLongitude === site.longitude &&
    Object.entries(LOCATION_MAP_OPTIONS).every(
      ([key, value]) => image[key as keyof LocationMapImage] === value,
    )
  );
}
