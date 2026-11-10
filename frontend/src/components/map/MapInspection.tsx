import { Button } from '../ui/button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronDown, ClipboardList } from 'lucide-react';
import { api } from '../../api';
import { useWork } from '../../context/work';
import { StatusBadge } from '../StatusBadge';
import { MeasurementEditor } from '../inspection/MeasurementEditor';
import { PhotoEditor } from '../inspection/PhotoEditor';
import { NoteEditor } from '../inspection/NoteEditor';
import type { Phase } from '../../types';

export function MapInspection({
  id,
  initialPhase,
  onClose,
}: {
  id: number;
  initialPhase: Phase;
  onClose: () => void;
}) {
  const { role, currentUserId } = useWork();
  const [phase, setPhase] = useState(initialPhase);
  const [editingPhase, setEditingPhase] = useState<Phase>();
  const result = useQuery({
    queryKey: ['site', role, id],
    queryFn: ({ signal }) => api.site(id, signal),
  });
  const site = result.data;
  return (
    <section className="panel map-inspection" aria-label="선택 수용가 현장 입력">
      <div className="panel-title">
        <h2>{site ? `${site.name || '성명 미기재'} · ${site.managementNo}` : '수용가 정보'}</h2>
        <Button
          variant="ghost"
          className="map-icon-button"
          aria-label="현장 입력 닫기"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {result.isPending && <p role="status">불러오는 중…</p>}
      {result.error && (
        <p role="alert">
          {result.error.message}
          <Button variant="ghost" className="text-btn" onClick={() => void result.refetch()}>
            다시 시도
          </Button>
        </p>
      )}
      {site && (
        <>
          <p>{site.address}</p>
          <StatusBadge site={site} />
          <details className="map-site-info">
            <summary>
              <ClipboardList size={18} aria-hidden="true" />
              <span>기본정보</span>
              <ChevronDown className="map-info-chevron" size={18} aria-hidden="true" />
            </summary>
            <dl className="info-grid">
              {Object.entries({
                수용가번호: site.consumerNumber || '미등록',
                급수전번호: site.waterNo,
                계량기번호: site.meterNo,
                중블록: site.middleBlockId,
                소블록: site.zone,
                성명: site.name,
                기존주소: site.oldAddress,
                상호: site.businessName,
                구경: site.meterDiameter,
                가구수: site.householdCount,
                '계량기 유무': site.meterPresenceRaw,
                '비고 (엑셀)': site.importRemark,
                기존검침담당: site.sourceReader,
                정례검침일: site.regularReadingDay,
                업종: site.industry,
                급수구역: site.supplyArea,
                봉인: site.sealed == null ? '미확인' : site.sealed ? '봉인' : '미봉인',
              }).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '미기재'}</dd>
                </div>
              ))}
            </dl>
          </details>
          <h3>현장 사진</h3>
          <PhotoEditor key={`photos-${id}`} site={site} inline onClose={() => {}} />
          <NoteEditor key={`note-${id}`} site={site} inline onClose={() => {}} />
          <div className="phase-tabs">
            {(['START', 'END'] as const).map((value) => (
              <Button
                variant="ghost"
                key={value}
                aria-pressed={phase === value}
                className={phase === value ? 'active' : ''}
                onClick={() => {
                  setPhase(value);
                  setEditingPhase(undefined);
                }}
              >
                {value === 'START' ? '2026 시작검침' : '2027 종료검침'}
              </Button>
            ))}
          </div>
          {site.inspections[phase] && editingPhase !== phase ? (
            <>
              <p className="map-saved-reading">
                {site.inspections[phase]!.date} · 지침{' '}
                <b>{site.inspections[phase]!.reading.toLocaleString()}</b> ·{' '}
                {site.inspections[phase]!.workerName}
              </p>
              {(role === 'ADMIN' || site.inspections[phase]!.workerId === currentUserId) && (
                <Button
                  variant="outline"
                  className="outline-btn"
                  onClick={() => setEditingPhase(phase)}
                >
                  검침 수정
                </Button>
              )}
            </>
          ) : (
            <MeasurementEditor
              key={`${id}-${phase}`}
              site={site}
              phase={phase}
              inline
              onClose={() => setEditingPhase(undefined)}
            />
          )}
        </>
      )}
    </section>
  );
}
