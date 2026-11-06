import { useState } from 'react';
import { call } from '../api/client';
import { useWork } from '../context/work';
type Result = {
  jobId: string;
  totalRows: number;
  inserted: number;
  duplicateInFile: number;
  alreadyExists: number;
  invalid: number;
  skippedRows: { sheet: string; rowNumber: number; reason: string; firstRowNumber?: number }[];
};
export function ImportPanel() {
  const { refresh } = useWork();
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Result>();
  const [skipPage, setSkipPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>수용가 Excel 등록</h2>
      <p>기존 수용가는 유지하며 중복·누락 행은 결과에 표시합니다.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setError('');
          setResult(undefined);
          setSkipPage(0);
          try {
            const body = new FormData();
            body.append('file', file);
            setResult(await call<Result>('/admin/imports', { method: 'POST', body }));
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : '업로드 실패');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="수용가 Excel 파일"
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0])}
        />
        <button disabled={busy || !file}>{busy ? '등록 중…' : '등록'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            검사 {result.totalRows} · 등록 {result.inserted} · 파일 중복 {result.duplicateInFile} ·
            기존 {result.alreadyExists} · 오류 {result.invalid}
          </p>
          <details>
            <summary>제외 행 {result.skippedRows.length}건</summary>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>시트</th>
                    <th>행</th>
                    <th>사유</th>
                    <th>최초 행</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skippedRows.slice(skipPage * 100, (skipPage + 1) * 100).map((row, i) => (
                    <tr key={i}>
                      <td>{row.sheet}</td>
                      <td>{row.rowNumber}</td>
                      <td>{row.reason}</td>
                      <td>{row.firstRowNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button disabled={skipPage === 0} onClick={() => setSkipPage((p) => p - 1)}>
              이전
            </button>
            <span>{skipPage + 1} 페이지</span>
            <button
              disabled={(skipPage + 1) * 100 >= result.skippedRows.length}
              onClick={() => setSkipPage((p) => p + 1)}
            >
              다음
            </button>
          </details>
        </>
      )}
    </section>
  );
}
