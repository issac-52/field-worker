import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useWork } from '../../context/WorkContext';
import { useSaveAction } from '../../hooks/useSaveAction';
import { formatWon, today } from '../../lib/format';
import type { FeeAdjustmentResult, Phase } from '../../types';
import { Modal } from '../Modal';

export function FeeEditor({
  mode,
  onClose,
  onAdjusted,
}: {
  mode: 'rule' | 'adjust';
  onClose: () => void;
  onAdjusted: (result: FeeAdjustmentResult) => void;
}) {
  const { middle, small, role } = useWork();
  const year = Number(today().slice(0, 4)) + (mode === 'rule' ? 2 : 0);
  const [phase, setPhase] = useState<Phase>('START');
  const [startDate, setStartDate] = useState(`${year}-01-01`);
  const [endDate, setEndDate] = useState(`${year}-12-31`);
  const [amount, setAmount] = useState(mode === 'rule' ? '3500' : '3200');
  const [reason, setReason] = useState('');
  const { busy, error, save } = useSaveAction();
  const body = {
    phase,
    startDate,
    endDate,
    amount: Number(amount),
    middleBlockId: middle || undefined,
    smallBlockId: small || undefined,
    reason: reason.trim(),
  };
  const valid =
    !!startDate &&
    !!endDate &&
    startDate <= endDate &&
    amount !== '' &&
    Number.isSafeInteger(body.amount) &&
    body.amount >= 0;
  const preview = useQuery({
    queryKey: ['adjust-preview', role, phase, startDate, endDate, body.amount, middle, small],
    queryFn: ({ signal }) => api.previewAdjustment(body, signal),
    enabled: mode === 'adjust' && valid,
    staleTime: 0,
  });
  const canSubmit =
    valid &&
    (mode === 'rule' ||
      (!!reason.trim() && !!preview.data?.targetCount && !preview.isFetching && !preview.error));
  async function submit() {
    if (!canSubmit) return;
    const success = await save(
      async () => {
        if (mode === 'rule') await api.addRule({ phase, startDate, endDate, amount: body.amount });
        else onAdjusted(await api.adjust(body));
      },
      mode === 'rule' ? '단가 규칙을 추가했습니다.' : '작업비를 변경했습니다.',
    );
    if (success) onClose();
  }
  return (
    <Modal
      title={mode === 'rule' ? '단가 규칙 추가' : '기존 검침 작업비 변경'}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          검침 단계
          <select value={phase} onChange={(event) => setPhase(event.target.value as Phase)}>
            <option value="START">시작단계</option>
            <option value="END">종료단계</option>
          </select>
        </label>
        <div className="form-2">
          <label className="field">
            시작일
            <input
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="field">
            종료일
            <input
              type="date"
              required
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <label className="field">
          건당 작업비 (원)
          <input
            type="number"
            min={0}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        {mode === 'adjust' && (
          <>
            <label className="field">
              변경 사유
              <input
                required
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="adjust-result" role="status">
              {!valid ? (
                '기간과 단가를 확인하세요.'
              ) : preview.isFetching ? (
                '대상 확인 중...'
              ) : preview.error ? (
                preview.error.message
              ) : preview.data ? (
                <>
                  {preview.data.targetCount.toLocaleString()}건 ·{' '}
                  {formatWon(preview.data.beforeTotal)} → {formatWon(preview.data.afterTotal)}
                </>
              ) : (
                '대상 확인 중...'
              )}
            </div>
          </>
        )}
        <p className="form-help">
          {mode === 'adjust'
            ? '선택 블록과 기간의 기존 검침에 적용됩니다.'
            : '새로 등록하는 검침에만 적용됩니다.'}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-btn full" type="submit" disabled={busy || !canSubmit}>
          {busy ? '저장 중...' : mode === 'adjust' ? '작업비 일괄 변경' : '규칙 저장'}
        </button>
      </form>
    </Modal>
  );
}
