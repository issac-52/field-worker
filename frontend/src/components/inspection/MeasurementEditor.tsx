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
}: {
  site: Site;
  phase: Phase;
  onClose: () => void;
}) {
  const { role, users } = useWork();
  const availableWorkers = users.filter((user) => user.role === 'WORKER' && user.active);
  const firstDate = phase === 'END' ? site.inspections.START?.date : undefined;
  const [date, setDate] = useState(firstDate && firstDate > today() ? firstDate : today());
  const [reading, setReading] = useState('');
  const [workerId, setWorkerId] = useState(role === 'WORKER' ? 11 : (availableWorkers[0]?.id ?? 0));
  const { busy, error, save } = useSaveAction();
  async function submit() {
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
  return (
    <Modal title={`${PHASE_LABEL[phase]} 입력`} onClose={onClose} busy={busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="form-site">
          {site.name}
          <span>
            #{site.managementNo} · {site.zone}
          </span>
        </p>
        <label className="field">
          검침일자
          <input
            type="date"
            required
            min={firstDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="field">
          계량지침
          <input
            type="number"
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
        <button className="primary-btn full" disabled={busy || !workerId} type="submit">
          {busy ? '저장 중...' : '검침 저장'}
        </button>
      </form>
    </Modal>
  );
}
