export const MAP_MIN_ZOOM = 16;
export type MapViewport = {
  south: number;
  north: number;
  west: number;
  east: number;
  zoom: number;
};
export type MapSite = {
  id: number;
  latitude: number;
  longitude: number;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
};
export type MapSites = { items: MapSite[]; truncated: boolean };
export function validViewport(v: MapViewport) {
  return (
    Object.values(v).every(Number.isFinite) &&
    Number.isInteger(v.zoom) &&
    v.zoom >= MAP_MIN_ZOOM &&
    v.zoom <= 22 &&
    v.south >= -90 &&
    v.north <= 90 &&
    v.west >= -180 &&
    v.east <= 180 &&
    v.south < v.north &&
    v.west < v.east &&
    v.north - v.south <= 0.05 &&
    v.east - v.west <= 0.05
  );
}
