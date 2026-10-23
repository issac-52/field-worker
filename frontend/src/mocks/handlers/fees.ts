import { http } from 'msw';
import { store } from '../store';
import { ok, err } from '../http';
import { settlementRows } from '../queries';
import type { Phase, FeeRule } from '../../types';

export const feesHandlers = [
  http.get('/api/fee-rules', () => ok(store.feeRules)),
  http.patch('/api/fee-rules/:id', async ({ params, request }) => {
    const rule = store.feeRules.find((value) => value.id === Number(params.id));
    if (!rule) return err('단가 규칙을 찾을 수 없습니다.', 404);
    const body = (await request.json()) as { amount: number };
    if (!Number.isSafeInteger(body.amount) || body.amount < 0)
      return err('0 이상의 정수 단가를 입력하세요.');
    rule.amount = body.amount;
    return ok(rule);
  }),
  http.post('/api/fee-rules', async ({ request }) => {
    const b = (await request.json()) as {
      phase: Phase;
      startDate: string;
      endDate: string;
      amount: number;
    };
    if (
      !['START', 'END'].includes(b.phase) ||
      !b.startDate ||
      !b.endDate ||
      b.startDate > b.endDate ||
      !Number.isSafeInteger(b.amount) ||
      b.amount < 0
    )
      return err('적용 기간 및 금액을 확인하세요');
    if (
      store.feeRules.some(
        (x) => x.phase === b.phase && x.startDate <= b.endDate && b.startDate <= x.endDate,
      )
    )
      return err('같은 단계의 단가 적용 기간이 겹칩니다');
    const rule: FeeRule = {
      ...b,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    store.feeRules.push(rule);
    return ok(rule);
  }),
  http.post('/api/admin/fee-adjustments/preview', async ({ request }) => {
    const b = (await request.json()) as import('../../types').FeeAdjustmentRequest;
    if (
      !['START', 'END'].includes(b.phase) ||
      !b.startDate ||
      !b.endDate ||
      b.startDate > b.endDate ||
      !Number.isSafeInteger(b.amount) ||
      b.amount < 0
    )
      return err('변경 기간과 단가를 확인하세요');
    const params = new URLSearchParams({
      phase: b.phase,
      startDate: b.startDate,
      endDate: b.endDate,
    });
    if (b.middleBlockId) params.set('middleBlockId', b.middleBlockId);
    if (b.smallBlockId) params.set('smallBlockId', b.smallBlockId);
    const rows = settlementRows(store.sites, params);
    return ok({
      targetCount: rows.length,
      beforeTotal: rows.reduce((sum, row) => sum + row.fee, 0),
      afterTotal: rows.length * b.amount,
    });
  }),
  http.post('/api/admin/fee-adjustments', async ({ request }) => {
    const b = (await request.json()) as import('../../types').FeeAdjustmentRequest;
    if (
      !['START', 'END'].includes(b.phase) ||
      !b.startDate ||
      !b.endDate ||
      b.startDate > b.endDate ||
      !Number.isSafeInteger(b.amount) ||
      b.amount < 0 ||
      !b.reason?.trim()
    )
      return err('변경 기간, 단계, 정수 단가 및 사유를 확인하세요');
    let count = 0,
      beforeTotal = 0;
    store.sites = store.sites.map((s) => {
      const m = s.inspections[b.phase];
      if (
        m &&
        m.date >= b.startDate &&
        m.date <= b.endDate &&
        (!b.middleBlockId || s.middleBlockId === b.middleBlockId) &&
        (!b.smallBlockId || s.smallBlockId === b.smallBlockId)
      ) {
        count++;
        beforeTotal += m.fee ?? 0;
        return {
          ...s,
          inspections: { ...s.inspections, [b.phase]: { ...m, fee: b.amount } },
        };
      }
      return s;
    });
    const result = {
      updatedCount: count,
      amount: b.amount,
      beforeTotal,
      afterTotal: count * b.amount,
      auditId: crypto.randomUUID(),
      changedAt: new Date().toISOString(),
    };
    store.adjustments.push({ request: b, result });
    return ok(result);
  }),
  http.get('/api/admin/fee-adjustments', () => ok(store.adjustments)),
];
