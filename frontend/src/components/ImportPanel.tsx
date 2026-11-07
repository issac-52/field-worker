import { useState } from 'react';
import { call } from '../api/client';
import { useWork } from '../context/work';
type Result = {
  jobId: string;
  totalRows: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  notFound?: number;
  rows?: { sheet: string; rowNumber: number; reason: string; fields?: string[] }[];
  duplicateInFile: number;
  alreadyExists?: number;
  invalid: number;
  skippedRows?: { sheet: string; rowNumber: number; reason: string; firstRowNumber?: number }[];
};
export function ImportPanel() {
  const { refresh } = useWork();
  const [mode, setMode] = useState<'register' | 'repair'>('register');
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Result>();
  const [skipPage, setSkipPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = result?.rows ?? result?.skippedRows ?? [];
  return (
    <section className="panel import-panel">
      <h2>수용가 Excel 등록</h2>
      <label className="field">
        업로드 방식
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => {
            setMode(e.target.value as 'register' | 'repair');
            setResult(undefined);
            setSkipPage(0);
          }}
        >
          <option value="register">신규 수용가 등록</option>
          <option value="repair">기존 수용가의 빈 기본정보 보완</option>
        </select>
      </label>
      <p>
        {mode === 'repair'
          ? '수용가번호가 같은 기존 자료의 빈 기본정보만 채웁니다. 기존 값·검침·사진·좌표·월별 이력은 유지하며 신규 수용가는 등록하지 않습니다.'
          : '기존 수용가는 유지하며 중복·누락 행은 결과에 표시합니다.'}
      </p>
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
            setResult(
              await call<Result>(mode === 'repair' ? '/admin/imports/repair' : '/admin/imports', {
                method: 'POST',
                body,
              }),
            );
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
        <button disabled={busy || !file}>
          {busy ? '처리 중…' : mode === 'repair' ? '빈 기본정보 보완' : '등록'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            검사 {result.totalRows} ·{' '}
            {result.updated !== undefined
              ? `보완 ${result.updated} · 변경 없음 ${result.unchanged} · 미등록 수용가 ${result.notFound}`
              : `등록 ${result.inserted} · 기존 ${result.alreadyExists}`}{' '}
            · 파일 중복 {result.duplicateInFile} · 오류 {result.invalid}
          </p>
          <details>
            <summary>
              {result.rows ? '전체 처리 결과' : '제외 행'} {rows.length}건
            </summary>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>시트</th>
                    <th>행</th>
                    <th>사유</th>
                    <th>보완 필드 / 최초 행</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(skipPage * 100, (skipPage + 1) * 100).map((row, i) => (
                    <tr key={i}>
                      <td>{row.sheet}</td>
                      <td>{row.rowNumber}</td>
                      <td>{row.reason}</td>
                      <td>
                        {'fields' in row
                          ? row.fields?.join(', ') || '—'
                          : 'firstRowNumber' in row
                            ? (row.firstRowNumber ?? '—')
                            : '—'}
                      </td>
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
              disabled={(skipPage + 1) * 100 >= rows.length}
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
