import { call, json } from './client';
import type { LocationMapState, LocationMapResult, SaveLocationMap } from '../lib/locationMap';
import type { Site } from '../types';

export const locationMapApi = {
  updateCoordinates: (
    id: number,
    body: {
      latitude: number;
      longitude: number;
      expectedLatitude: number | null;
      expectedLongitude: number | null;
    },
  ) => call<Site>(`/sites/${id}/coordinates`, { method: 'PATCH', body: JSON.stringify(body) }),
  locationMap: (id: number, signal?: AbortSignal) =>
    call<LocationMapState>(`/sites/${id}/location-map`, { signal }),
  saveLocationMap: (id: number, body: SaveLocationMap, key: string) =>
    call<LocationMapResult>(`/sites/${id}/location-map`, {
      ...json(body),
      headers: {
        'Idempotency-Key': key,
      },
    }),
};
