import type { Role } from '../types';

// Development fixture only. Replace with the authenticated server session at integration.
export function getDemoRole(): Role {
  return import.meta.env.DEV && import.meta.env.VITE_DEMO_ROLE === 'ADMIN' ? 'ADMIN' : 'WORKER';
}
