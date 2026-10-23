import { seedSites, seedRules, users } from './data';
import type { FeeAdjustmentRequest, FeeAdjustmentResult } from '../types';

export const store = {
  measurementEdits: [] as {
    siteId: number;
    phase: 'START' | 'END';
    actorId: number;
    changedAt: string;
    before: unknown;
    after: unknown;
  }[],
  sites: structuredClone(seedSites),
  feeRules: structuredClone(seedRules),
  users: structuredClone(users),
  adjustments: [] as {
    request: FeeAdjustmentRequest;
    result: FeeAdjustmentResult;
  }[],
};
