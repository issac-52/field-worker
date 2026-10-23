import { Button } from '../components/ui/button';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MapPinned, ShieldCheck } from 'lucide-react';
import { useWork } from '../context/work';
import { StatusBadge } from '../components/StatusBadge';
import { InspectionPanel } from '../components/inspection/InspectionPanel';
import { MeasurementEditor } from '../components/inspection/MeasurementEditor';
import { NoteEditor } from '../components/inspection/NoteEditor';
import { PhotoEditor } from '../components/inspection/PhotoEditor';
import { formatDate, formatWon } from '../lib/format';
import { PHOTO_SLOTS } from '../types';
import type { Phase } from '../types';

export function SiteDetailPage() {
  const { target: site, navigate, role } = useWork();
  const [phase, setPhase] = useState<Phase>('START');
  const [editor, setEditor] = useState<'measurement' | 'note'>();
  if (!site) return <p className="loading">불러오는 중...</p>;
  const info = [
    ['관리번호', site.managementNo],
    ['소블록', site.zone],
    ['성명', site.name],
    ['급수전번호', site.waterNo],
    ['업종', site.industry],
    ['계량기번호', site.meterNo],
    ['봉인여부', site.sealed ? '봉인' : '미봉인'],
    ['급수구역', site.supplyArea],
    ['위치', site.address],
  ];
  return (
    <>
      <Button variant="ghost" className="back" onClick={() => navigate('sites')}>
        <ArrowLeft size={17} />
        수용가 목록
      </Button>
      <section className="detail-head">
        <div>
          <h1>
            {site.name} <StatusBadge site={site} />
          </h1>
          <p>
            <MapPin size={15} />
            {site.address}
          </p>
        </div>
        <Button variant="outline" className="outline-btn" onClick={() => navigate('map')}>
          <MapPinned size={16} />
          지도 보기
        </Button>
      </section>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel info-panel">
            <div className="panel-title">
              <h3>수용가 기본정보</h3>
              <span className="readonly">
                <ShieldCheck size={14} />
                읽기 전용
              </span>
            </div>
            <dl className="info-grid">
              {info.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel photos-panel">
            <div className="panel-title">
              <h3>현장 사진</h3>
              <span className="muted">
                {site.photos.length}/{PHOTO_SLOTS.length}개 영역
              </span>
            </div>
            <PhotoEditor key={site.id} site={site} inline onClose={() => {}} />
          </section>
          <section className="panel note-panel">
            <div className="panel-title">
              <h3>특이사항</h3>
              <Button variant="ghost" className="text-btn" onClick={() => setEditor('note')}>
                수정
                <ArrowRight size={14} />
              </Button>
            </div>
            <p>{site.note || '등록된 특이사항이 없습니다.'}</p>
          </section>
          <InspectionPanel
            site={site}
            phase={phase}
            setPhase={setPhase}
            admin={role === 'ADMIN'}
            onMeasure={() => setEditor('measurement')}
          />
        </div>
        <aside className="detail-side">
          <section className="panel summary-card">
            <div className="panel-title">
              <h3>진행 상태</h3>
            </div>
            <div className="timeline">
              {(['START', 'END'] as const).map((value) => (
                <div className="timeline-step" key={value}>
                  <div>
                    <strong>{value === 'START' ? '시작단계' : '종료단계'}</strong>
                    <small>
                      {site.inspections[value]
                        ? formatDate(site.inspections[value].date)
                        : '대기 중'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {role === 'ADMIN' && (
              <div className="summary-footer">
                <span>작업비 합계</span>
                <strong>
                  {formatWon((site.inspections.START?.fee ?? 0) + (site.inspections.END?.fee ?? 0))}
                </strong>
              </div>
            )}
          </section>
        </aside>
      </div>
      {editor === 'measurement' && (
        <MeasurementEditor
          key={`${site.id}-${phase}`}
          site={site}
          phase={phase}
          onClose={() => setEditor(undefined)}
        />
      )}
      {editor === 'note' && <NoteEditor site={site} onClose={() => setEditor(undefined)} />}
    </>
  );
}
