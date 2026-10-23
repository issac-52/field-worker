import type { Role } from '../types';

// Mock UI state, never an authenticated server identity. Reload starts as WORKER.
let selectedRole: Role = 'WORKER';
const listeners = new Set<() => void>();

export function getDemoRole(): Role {
  return __DEMO_SWITCH_ENABLED__ ? selectedRole : 'WORKER';
}

export function subscribeDemoRole(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDemoRole(role: Role) {
  if (!__DEMO_SWITCH_ENABLED__) throw new Error('역할 전환은 시연 전용 환경에서만 가능합니다.');
  if (role !== 'ADMIN' && role !== 'WORKER') throw new Error('시연 역할을 확인하세요.');
  selectedRole = role;
  listeners.forEach((listener) => listener());
}
