import { seedSites, seedRules, users } from './data';
import type { FeeAdjustmentRequest, FeeAdjustmentResult } from '../types';

export const store = {
  sites: structuredClone(seedSites),
  feeRules: structuredClone(seedRules),
  users: structuredClone(users),
  adjustments: [] as {
    request: FeeAdjustmentRequest;
    result: FeeAdjustmentResult;
  }[],
};
