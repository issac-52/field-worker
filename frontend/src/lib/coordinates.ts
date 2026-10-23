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
