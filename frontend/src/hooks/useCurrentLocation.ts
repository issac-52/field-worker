import { useEffect, useState } from 'react';
import { watchCurrentLocation } from '../lib/currentLocation';
import type { CurrentLocation } from '../lib/currentLocation';

export function useCurrentLocation(enabled: boolean) {
  const [position, setPosition] = useState<CurrentLocation>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    return watchCurrentLocation(
      navigator.geolocation,
      window.isSecureContext,
      (point) => {
        setPosition(point);
        setError('');
        setLoading(false);
      },
      (message) => {
        setError(message);
        setLoading(false);
      },
    );
  }, [requestId, enabled]);
  return { position, error, loading, retry: () => setRequestId((value) => value + 1) };
}
