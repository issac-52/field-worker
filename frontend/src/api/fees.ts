import type {
  FeeAdjustmentPreview,
  FeeAdjustmentRequest,
  FeeAdjustmentResult,
  FeeRule,
  PageRequest,
  Phase,
  SettlementFilter,
  SettlementPage,
} from '../types';
import { call, json, query } from './client';

export const feeApi = {
  rules: (signal?: AbortSignal) => call<FeeRule[]>('/fee-rules', { signal }),
  addRule: (body: { phase: Phase; startDate: string; endDate: string; amount: number }) =>
    call<FeeRule>('/fee-rules', json(body)),
  updateRule: (id: number, amount: number) =>
    call<FeeRule>(`/fee-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ amount }) }),
  settlements: (params: SettlementFilter & PageRequest = {}, signal?: AbortSignal) =>
    call<SettlementPage>('/settlements' + query(params), { signal }),
  previewAdjustment: (body: FeeAdjustmentRequest, signal?: AbortSignal) =>
    call<FeeAdjustmentPreview>('/admin/fee-adjustments/preview', { ...json(body), signal }),
  adjust: (body: FeeAdjustmentRequest) =>
    call<FeeAdjustmentResult>('/admin/fee-adjustments', json(body)),
};
