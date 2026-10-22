import { Download, FileText } from 'lucide-react';
import { useWork } from '../context/WorkContext';

export function ReportsPage() {
  const { summary, loading } = useWork();
  return (
    <>
      <section className="pagehead">
        <h1>문서 출력</h1>
      </section>
      <section className="panel report-panel">
        <span className="report-icon">
          <FileText size={29} />
        </span>
        <h2>검침카드 일괄 출력</h2>
        <div className="report-count">
          <span>선택 블록의 출력 대상</span>
          <strong>
            {loading ? '—' : summary.total.toLocaleString()}
            <small>건</small>
          </strong>
        </div>
        <button className="primary-btn full" disabled>
          <Download size={18} />
          HWP · ZIP 생성 준비 중
        </button>
      </section>
    </>
  );
}
