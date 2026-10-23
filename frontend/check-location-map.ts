import assert from 'node:assert/strict';
import { store } from './src/mocks/store';

export async function checkLocationMaps() {
  const request = async (
    id: number,
    body?: unknown,
    key = crypto.randomUUID(),
    role = 'WORKER',
    fail = false,
  ) => {
    const response = await fetch(`http://localhost/api/sites/${id}/location-map`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Role': role,
        'Idempotency-Key': key,
        ...(fail ? { 'X-Demo-Location-Map-Failure': 'true' } : {}),
      },
      ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const site = store.sites[0];
  assert.equal((await request(site.id)).data.image, null);
  const key = crypto.randomUUID();
  const parallel = await Promise.all([
    request(site.id, { regenerate: false }, key),
    request(site.id, { regenerate: false }, key),
  ]);
  assert(parallel.every((value) => value.status === 200));
  const first = parallel[0].data.image;
  assert.equal(first.generationId, parallel[1].data.image.generationId);
  assert.equal(first.storageMode, 'MOCK');
  assert(first.storageKey.startsWith('mock-only/'));
  assert.equal(first.fileSize, null);
  assert.equal(parallel[0].data.imageUrl, null);
  assert.equal(first.centerLatitude, site.latitude);
  assert.equal(first.centerLongitude, site.longitude);
  assert.equal((await request(site.id, { regenerate: false })).data.reused, true);
  assert.equal((await request(site.id, { regenerate: true }, key)).status, 409);
  assert.equal((await request(site.id, { regenerate: false, latitude: 1 })).status, 400);
  assert.equal((await request(site.id, { regenerate: false }, 'bad')).status, 400);
  const regenKey = crypto.randomUUID();
  const regenBody = { regenerate: true, expectedGenerationId: first.generationId };
  const regenerated = await request(site.id, regenBody, regenKey, 'ADMIN');
  assert.equal(regenerated.status, 200);
  assert.notEqual(regenerated.data.image.generationId, first.generationId);
  assert.equal(
    (await request(site.id, regenBody, regenKey, 'ADMIN')).data.image.generationId,
    regenerated.data.image.generationId,
  );
  assert.equal((await request(site.id, regenBody)).status, 409);
  const failureBody = {
    regenerate: true,
    expectedGenerationId: regenerated.data.image.generationId,
  };
  const failureKey = crypto.randomUUID();
  assert.equal((await request(site.id, failureBody, failureKey, 'WORKER', true)).status, 503);
  assert.equal(
    (await request(site.id)).data.image.generationId,
    regenerated.data.image.generationId,
  );
  assert.equal((await request(site.id, failureBody, failureKey)).status, 200);
  const latitude = site.latitude;
  site.latitude = (latitude ?? 0) + 0.001;
  assert.equal((await request(site.id)).data.stale, true);
  assert.equal((await request(site.id, { regenerate: false })).status, 409);
  site.latitude = null;
  assert.equal((await request(site.id, { regenerate: false })).status, 422);
  site.latitude = NaN;
  assert.equal((await request(site.id, { regenerate: false })).status, 422);
  site.latitude = latitude;
  assert.equal((await request(site.id)).data.stale, false);
  assert.equal((await request(store.sites[1].id)).data.image, null);
  assert.equal((await request(99999999)).status, 404);
  const current = (await request(site.id)).data.image;
  const conflict = await Promise.all([
    request(site.id, { regenerate: true, expectedGenerationId: current.generationId }),
    request(site.id, { regenerate: true, expectedGenerationId: current.generationId }),
  ]);
  assert.deepEqual(conflict.map((value) => value.status).sort(), [200, 409]);
  const updateCoordinates = async (body: unknown) => {
    const response = await fetch(`http://localhost/api/sites/${site.id}/coordinates`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'WORKER' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const original = { latitude: site.latitude, longitude: site.longitude };
  const coordinates = {
    latitude: site.latitude! + 0.001,
    longitude: site.longitude! + 0.001,
    expectedLatitude: site.latitude,
    expectedLongitude: site.longitude,
  };
  const savedMap = (await request(site.id)).data.image;
  const moved = await updateCoordinates(coordinates);
  assert.equal(moved.status, 200);
  assert.equal(moved.data.latitude, coordinates.latitude);
  assert(!('fee' in moved.data.inspections.START));
  assert.equal((await request(site.id)).data.image.generationId, savedMap.generationId);
  assert.equal((await request(site.id)).data.stale, true);
  assert.equal((await request(site.id, { regenerate: false })).status, 409);
  const updatedMap = await request(site.id, {
    regenerate: true,
    expectedGenerationId: savedMap.generationId,
  });
  assert.equal(updatedMap.status, 200);
  assert.equal(updatedMap.data.stale, false);
  assert.equal(updatedMap.data.image.centerLatitude, coordinates.latitude);
  assert.equal((await updateCoordinates(coordinates)).status, 200); // Response-loss retry.
  assert.equal(
    (await updateCoordinates({ ...coordinates, latitude: coordinates.latitude + 0.001 })).status,
    409,
  );
  assert.equal((await updateCoordinates({ ...coordinates, latitude: 91 })).status, 422);
  assert.equal((await updateCoordinates({ ...coordinates, latitude: null })).status, 422);
  assert.equal(
    (
      await updateCoordinates({
        ...coordinates,
        latitude: original.latitude,
        expectedLatitude: undefined,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await updateCoordinates({
        ...original,
        expectedLatitude: coordinates.latitude,
        expectedLongitude: coordinates.longitude,
      })
    ).status,
    200,
  );
  console.log(
    'PASS: coordinate PATCH validates picks, protects concurrent edits, retries safely, preserves old image as stale and regenerates from new authoritative coordinates',
  );
  const photo = { url: 'data:image/png;base64,aGVsbG8=' };
  const upload = async (photos: unknown[]) =>
    fetch(`http://localhost/api/sites/${site.id}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'WORKER' },
      body: JSON.stringify({ photos }),
    });
  assert.equal((await upload([{ ...photo, slot: 'LOCATION_MAP' }])).status, 400);
  assert.equal(
    (await upload(['OVERVIEW', 'START_CLOSEUP', 'END_CLOSEUP'].map((slot) => ({ ...photo, slot }))))
      .status,
    200,
  );
  assert.equal((await upload([])).status, 200);
  console.log(
    'PASS: location-map metadata only, same-key concurrent replay, reuse, explicit regeneration/version conflict, failure/retry, authoritative/missing coordinates, site isolation and three photo slots',
  );
}
