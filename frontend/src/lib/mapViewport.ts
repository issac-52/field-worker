export const MAP_MIN_ZOOM = 15;
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
export type MapCluster = {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  count: number;
};
export type MapSites = {
  items: MapSite[];
  truncated: boolean;
  clusters?: MapCluster[];
  total?: number;
};
export function validMapArea(v: MapViewport) {
  return (
    Object.values(v).every(Number.isFinite) &&
    Number.isInteger(v.zoom) &&
    v.zoom >= 1 &&
    v.zoom <= 22 &&
    v.south >= -90 &&
    v.north <= 90 &&
    v.west >= -180 &&
    v.east <= 180 &&
    v.south < v.north &&
    v.west < v.east
  );
}
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
    v.north - v.south <= 0.1 &&
    v.east - v.west <= 0.1
  );
}
