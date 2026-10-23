import type { NaverMaps } from './naverMaps';
import { hasCoordinates, LOCATION_MAP_OPTIONS } from './locationMap';

export function createLocationMapPreview(
  sdk: NaverMaps,
  element: HTMLElement,
  latitude: number,
  longitude: number,
  zoomLevel: number = LOCATION_MAP_OPTIONS.zoomLevel,
  editing?: {
    onPick: (point: { latitude: number; longitude: number }) => void;
    showMarker: boolean;
  },
) {
  const center = new sdk.LatLng(latitude, longitude);
  const map = new sdk.Map(element, {
    center,
    zoom: zoomLevel,
    draggable: !!editing,
    scrollWheel: !!editing,
    pinchZoom: !!editing,
    keyboardShortcuts: false,
    disableDoubleClickZoom: true,
    disableDoubleTapZoom: true,
    zoomControl: !!editing,
  });
  try {
    const marker = new sdk.Marker({
      map: editing && !editing.showMarker ? null : map,
      position: center,
      title: '선택 수용가 위치',
    });
    const listener = editing
      ? sdk.Event.addListener(map, 'click', (event) => {
          const coord = event.coord ?? event.latlng;
          if (!coord) return;
          const point = { latitude: coord.lat(), longitude: coord.lng() };
          if (!hasCoordinates(point)) return;
          marker.setPosition(coord);
          marker.setMap(map);
          editing.onPick(point);
        })
      : undefined;
    let disposed = false;
    return {
      resize: () => {
        if (!disposed) map.autoResize();
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (listener) sdk.Event.removeListener(listener);
        marker.setMap(null);
        map.destroy();
        element.replaceChildren();
      },
    };
  } catch (error) {
    map.destroy();
    element.replaceChildren();
    throw error;
  }
}
