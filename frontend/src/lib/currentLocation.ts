export type CurrentLocation = { latitude: number; longitude: number; accuracy: number };
type GeoService = Pick<Geolocation, 'watchPosition' | 'clearWatch'>;

export function watchCurrentLocation(
  service: GeoService | undefined,
  secure: boolean,
  onPosition: (position: CurrentLocation) => void,
  onError: (message: string) => void,
) {
  if (!secure || !service) {
    onError(
      !secure
        ? '내 위치는 HTTPS 연결에서 사용할 수 있습니다. 위치 없이도 수용가 조회는 가능합니다.'
        : '이 브라우저는 위치 확인을 지원하지 않습니다.',
    );
    return () => {};
  }
  let active = true;
  let watchId: number | undefined;
  // Native timeout may not include time spent waiting for permission.
  const permissionTimer = setTimeout(() => {
    if (active)
      onError(
        '위치 권한과 GPS 상태를 확인하세요. 현재 위치 없이 수용가 지도를 이용할 수 있습니다.',
      );
  }, 15000);
  try {
    watchId = service.watchPosition(
      (position) => {
        if (!active) return;
        clearTimeout(permissionTimer);
        const { latitude, longitude, accuracy } = position.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180 ||
          !Number.isFinite(accuracy) ||
          accuracy < 0
        ) {
          onError('현재 위치 정보를 확인할 수 없습니다. 다시 시도하세요.');
          return;
        }
        onPosition({ latitude, longitude, accuracy });
      },
      (error) => {
        if (!active) return;
        clearTimeout(permissionTimer);
        onError(
          error.code === 1
            ? '위치 권한이 거부되었습니다. 브라우저의 사이트 위치 권한을 허용한 뒤 다시 시도하세요.'
            : error.code === 3
              ? '현재 위치 확인 시간이 초과되었습니다. GPS·위치 설정을 확인하고 다시 시도하세요.'
              : '현재 위치를 확인하지 못했습니다. GPS·위치 설정을 확인하세요.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  } catch {
    clearTimeout(permissionTimer);
    onError('위치 확인을 시작하지 못했습니다. 브라우저의 위치 설정을 확인하세요.');
  }
  return () => {
    active = false;
    clearTimeout(permissionTimer);
    if (watchId !== undefined) service.clearWatch(watchId);
  };
}
