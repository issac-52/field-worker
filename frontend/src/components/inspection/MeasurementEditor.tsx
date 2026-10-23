import { useState } from 'react';
import { api } from '../../api';
import { useWork } from '../../context/WorkContext';
import { useSaveAction } from '../../hooks/useSaveAction';
import { today } from '../../lib/format';
import type { Phase, Site } from '../../types';
import { PHASE_LABEL } from '../../types';
import { Modal } from '../Modal';

export function MeasurementEditor({
  site,
  phase,
  onClose,
  inline = false,
}: {
  site: Site;
  phase: Phase;
  onClose: () => void;
  inline?: boolean;
}) {
  const { role, users } = useWork();
  const availableWorkers = users.filter((user) => user.role === 'WORKER' && user.active);
  const year = phase === 'START' ? 2026 : 2027;
  const firstDate = `${year}-01-01`;
  const lastDate = `${year}-12-31`;
  const currentDate = today();
  const [date, setDate] = useState(
    currentDate < firstDate ? firstDate : currentDate > lastDate ? lastDate : currentDate,
  );
  const [reading, setReading] = useState('');
  const [workerId, setWorkerId] = useState(role === 'WORKER' ? 11 : (availableWorkers[0]?.id ?? 0));
  const { busy, error, save } = useSaveAction();
  async function submit() {
    if (
      !reading.trim() ||
      !Number.isFinite(Number(reading)) ||
      Number(reading) < 0 ||
      !workerId ||
      date < firstDate ||
      date > lastDate ||
      site.inspections[phase] ||
      (phase === 'END' && !site.inspections.START)
    )
      return;
    const success = await save(
      () =>
        api.measurement(site.id, {
          phase,
          date,
          reading: Number(reading),
          workerId,
        }),
      `${PHASE_LABEL[phase]}을 등록했습니다.`,
    );
    if (success) onClose();
  }
  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {!inline && (
        <p className="form-site">
          {site.name}
          <span>
            #{site.managementNo} · {site.zone}
          </span>
        </p>
      )}
      <p className="form-help">
        {year}년 {PHASE_LABEL[phase]} · 저장 후 중복 등록할 수 없습니다.
      </p>
      <label className="field">
        검침일자
        <input
          type="date"
          required
          min={firstDate}
          max={lastDate}
          value={date}
          onInput={(event) => setDate(event.currentTarget.value)}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="field">
        계량지침
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          required
          value={reading}
          onChange={(event) => setReading(event.target.value)}
        />
      </label>
      <label className="field">
        실제 조사자
        <select
          required
          value={workerId || ''}
          disabled={role === 'WORKER' || busy}
          onChange={(event) => setWorkerId(Number(event.target.value))}
        >
          <option value="" disabled>
            조사자 선택
          </option>
          {availableWorkers.map((user) => (
            <option value={user.id} key={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-btn full modal-save"
        disabled={
          busy ||
          !workerId ||
          !reading.trim() ||
          !Number.isFinite(Number(reading)) ||
          Number(reading) < 0
        }
        type="submit"
      >
        {busy ? '저장 중...' : '검침 저장'}
      </button>
    </form>
  );
  return inline ? (
    form
  ) : (
    <Modal title={`${PHASE_LABEL[phase]} 입력`} onClose={onClose} busy={busy}>
      {form}
    </Modal>
  );
}
