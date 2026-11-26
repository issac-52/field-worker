import { useSession } from '../../context/session';
import { stageAndSend, validateReading } from '../../offline/sync';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useState } from 'react';
import { api } from '../../api';
import { useWork } from '../../context/work';
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
  const { user } = useSession();
  const { role, users, refresh, currentUserId } = useWork();
  const availableWorkers = users.filter(
    (user) =>
      user.role === 'WORKER' && user.active && (role === 'ADMIN' || user.id === currentUserId),
  );
  const year = phase === 'START' ? 2026 : 2027;
  const firstDate = `${year}-01-01`;
  const lastDate = `${year}-12-31`;
  const currentDate = today();
  const measurement = site.inspections[phase];
  const editing = !!measurement;
  const [date, setDate] = useState(
    measurement?.date ??
      (currentDate < firstDate ? firstDate : currentDate > lastDate ? lastDate : currentDate),
  );
  const [reading, setReading] = useState(measurement ? String(measurement.reading) : '');
  const [workerId, setWorkerId] = useState(measurement?.workerId ?? 0);
  const [expectedUpdatedAt] = useState(measurement?.updatedAt ?? measurement?.recordedAt);
  const { busy, error, save } = useSaveAction();
  async function submit() {
    if (
      !reading.trim() ||
      !Number.isFinite(Number(reading)) ||
      Number(reading) < 0 ||
      !workerId ||
      date < firstDate ||
      date > lastDate
    )
      return;
    const success = await save(
      async () => {
        if (editing)
          return api.updateMeasurement(site.id, phase, {
            date,
            reading: Number(reading),
            expectedUpdatedAt: expectedUpdatedAt!,
          });
        const body = { phase, date, reading: Number(reading), workerId };
        if (!user || !(await navigator.serviceWorker?.getRegistration())?.active)
          return api.measurement(site.id, body);
        const sent = await stageAndSend(user, site, (saved) => {
          const start = saved.draft.readings.START?.reading ?? saved.readings.START?.reading;
          const draft = validateReading(phase, date, reading, start);
          if (
            phase === 'START' &&
            saved.draft.readings.END &&
            draft.reading > saved.draft.readings.END.reading
          )
            throw new Error('종료 지침보다 큰 시작 지침은 저장할 수 없습니다.');
          saved.draft.readings[phase] = { ...draft, workerId };
        });
        if (!sent) return 'queued';
      },
      `${PHASE_LABEL[phase]}을 ${editing ? '수정' : '등록'}했습니다.`,
      '검침을 기기에 임시 저장했습니다. 오프라인 작업에서 전송 상태를 확인하세요.',
    );
    if (success) onClose();
    else if (navigator.onLine) void refresh();
  }
  async function reset() {
    if (!measurement || !expectedUpdatedAt || busy) return;
    if (
      !window.confirm(
        `${PHASE_LABEL[phase]} 날짜와 지침을 초기화할까요? 이 검침 기록은 다시 입력할 수 있습니다.`,
      )
    )
      return;
    const success = await save(
      () => api.resetMeasurement(site.id, phase, expectedUpdatedAt),
      PHASE_LABEL[phase] + ' 기록을 초기화했습니다.',
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
        {year}년 {PHASE_LABEL[phase]}
        {editing ? ' 수정' : ''}
      </p>
      <label className="field">
        검침일자
        <Input
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
        <Input
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
          disabled={editing || busy}
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
          {editing && !availableWorkers.some((user) => user.id === workerId) && (
            <option value={workerId}>{measurement.workerName}</option>
          )}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button
        variant="default"
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
        {busy ? '저장 중...' : editing ? '수정 저장' : '검침 저장'}
      </Button>
      {editing && (measurement.resettable ?? __MOCKS_ENABLED__) && (
        <Button
          variant="outline"
          type="button"
          className="outline-btn full"
          disabled={busy}
          onClick={() => void reset()}
        >
          검침값 초기화
        </Button>
      )}
      {inline && editing && (
        <Button
          variant="ghost"
          type="button"
          className="outline-btn full"
          disabled={busy}
          onClick={onClose}
        >
          수정 취소
        </Button>
      )}
    </form>
  );
  return inline ? (
    form
  ) : (
    <Modal
      title={`${PHASE_LABEL[phase]} ${editing ? '수정' : '입력'}`}
      onClose={onClose}
      busy={busy}
    >
      {form}
    </Modal>
  );
}
