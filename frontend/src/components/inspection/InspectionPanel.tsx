import { Button } from '../ui/button';
import { Check, Clock3, Plus } from 'lucide-react';
import type { Phase, Site } from '../../types';
import { PHASE_LABEL } from '../../types';
import { formatDate, formatWon } from '../../lib/format';

export function InspectionPanel({
  site,
  phase,
  setPhase,
  admin,
  onMeasure,
}: {
  site: Site;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  admin: boolean;
  onMeasure: () => void;
}) {
  const measurement = site.inspections[phase];
  return (
    <section className="panel reading-panel">
      <div className="panel-title">
        <h3>검침 기록</h3>
      </div>
      <div className="phase-tabs">
        {(['START', 'END'] as const).map((value) => (
          <Button
            variant="ghost"
            key={value}
            className={phase === value ? 'active' : ''}
            aria-pressed={phase === value}
            onClick={() => setPhase(value)}
          >
            {value === 'START' ? '2026 START' : '2027 END'}
          </Button>
        ))}
      </div>
      <div className="phase-top">
        <div className={`phase-icon ${measurement ? 'complete' : 'waiting'}`}>
          {measurement ? <Check size={21} /> : <Clock3 size={21} />}
        </div>
        <b>{PHASE_LABEL[phase]}</b>
        <span className={`status ${measurement ? 'done' : 'todo'}`}>
          {measurement ? '등록 완료' : '미등록'}
        </span>
      </div>
      {measurement ? (
        <>
          <div className="measure-grid">
            <div>
              <small>검침일자</small>
              <strong>{formatDate(measurement.date)}</strong>
            </div>
            <div>
              <small>계량지침</small>
              <strong>{measurement.reading.toLocaleString()}</strong>
            </div>
            <div>
              <small>실제 조사자</small>
              <strong>{measurement.workerName}</strong>
            </div>
            {admin && (
              <div>
                <small>건당 작업비</small>
                <strong>{formatWon(measurement.fee ?? 0)}</strong>
              </div>
            )}
          </div>
          {(admin || measurement.workerId === 11) && (
            <Button variant="outline" className="outline-btn" onClick={onMeasure}>
              검침 수정
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="phase-empty">등록된 검침이 없습니다.</p>
          <Button
            variant="default"
            className="primary-btn"
            disabled={phase === 'END' && !site.inspections.START}
            onClick={onMeasure}
          >
            <Plus size={17} />
            {PHASE_LABEL[phase]} 입력
          </Button>
          {phase === 'END' && !site.inspections.START && (
            <p className="hint">시작단계 검침을 먼저 등록하세요.</p>
          )}
        </>
      )}
      {site.inspections.START && site.inspections.END && (
        <div className="usage">
          <span>검침량 (종료 − 시작)</span>
          <strong>
            {(site.inspections.END.reading - site.inspections.START.reading).toLocaleString()}
          </strong>
        </div>
      )}
    </section>
  );
}
