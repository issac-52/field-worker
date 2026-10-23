import { Download, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWork } from '../context/WorkContext';
import { api } from '../api';
import { collectExportSites } from '../lib/exportData';

export function ReportsPage() {
  const { summary, loading, role, middle, small, blocks } = useWork();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  useEffect(() => () => operation.current?.abort(), [middle, small, role]);
  async function downloadExcel() {
    if (role !== 'ADMIN' || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    setProgress('데이터 조회 중…');
    const scope =
      blocks.find((block) => block.id === small)?.name ??
      blocks.find((block) => block.id === middle)?.name ??
      '전체 수용가';
    try {
      const records = await collectExportSites(
        (page) =>
          api.exportSites(
            {
              middleBlockId: middle || undefined,
              smallBlockId: small || undefined,
              page,
              pageSize: 100,
            },
            controller.signal,
          ),
        controller.signal,
        (loaded, total) => {
          if (mounted.current)
            setProgress(`${loaded.toLocaleString()} / ${total.toLocaleString()}건 조회 중…`);
        },
      );
      if (!records.length) throw new Error('다운로드할 수용가가 없습니다.');
      controller.signal.throwIfAborted();
      setProgress('엑셀 파일 생성 중…');
      const { createExcelBytes } = await import('../lib/excelExport');
      controller.signal.throwIfAborted();
      const bytes = await createExcelBytes(records, blocks, scope);
      controller.signal.throwIfAborted();
      const blob = new Blob([bytes as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const filenameDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
        new Date(),
      );
      anchor.download = `검침데이터_${scope}_${filenameDate}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (mounted.current)
        setProgress(`${records.length.toLocaleString()}건 엑셀 다운로드를 시작했습니다.`);
    } catch (reason) {
      if (mounted.current) {
        if (controller.signal.aborted) setProgress('다운로드를 취소했습니다.');
        else {
          setError(reason instanceof Error ? reason.message : '다운로드 실패');
          setProgress('');
        }
      }
    } finally {
      operation.current = undefined;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <section className="pagehead">
        <h1>문서 출력</h1>
      </section>
      <section className="panel report-panel">
        <span className="report-icon">
          <Download size={29} />
        </span>
        <h2>Excel 다운로드</h2>
        <p>
          선택한 블록의 전체 수용가 기본정보, 검침값·일자·조사자, 특이사항, 작업비와 위치도 상태를
          내려받습니다.
        </p>
        <p className="hint">
          사진은 종류별 등록 여부를 포함합니다. 사진 이미지와 HWP 파일은 포함하지 않습니다.
        </p>
        <div className="report-count">
          <span>다운로드 대상</span>
          <strong>
            {loading ? '—' : summary.total.toLocaleString()}
            <small>건</small>
          </strong>
        </div>
        <button
          className="primary-btn full"
          disabled={busy || loading || !summary.total || role !== 'ADMIN'}
          onClick={() => void downloadExcel()}
        >
          <Download size={18} />
          {busy ? '엑셀 준비 중…' : 'Excel 다운로드 (.xlsx)'}
        </button>
        {busy && (
          <button className="outline-btn full" onClick={() => operation.current?.abort()}>
            다운로드 취소
          </button>
        )}
        {progress && <p role="status">{progress}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
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
