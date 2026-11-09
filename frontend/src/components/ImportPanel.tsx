import { useState } from 'react';
import { call } from '../api/client';
import { Button } from './ui/button';
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
  hiddenRows?: number;
  skippedRows?: { sheet: string; rowNumber: number; reason: string; firstRowNumber?: number }[];
};
type PrunePlan = {
  planId: string;
  keepCount: number;
  deleteCount: number;
  photoCount: number;
  inspectionCount: number;
  protectedCount: number;
  documentJobCount: number;
  confirmation: string;
  sample: { consumerNumber: string; middleBlock: string }[];
};
export function ImportPanel() {
  const { refresh } = useWork();
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [plan, setPlan] = useState<PrunePlan>();
  const [confirmation, setConfirmation] = useState('');
  const [pruneMessage, setPruneMessage] = useState('');
  const [mode, setMode] = useState<'register' | 'repair'>('register');
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Result>();
  const [skipPage, setSkipPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function previewPrune() {
    if (!file) return;
    setBusy(true);
    setError('');
    setPlan(undefined);
    setConfirmation('');
    setPruneMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      setPlan(await call<PrunePlan>('/admin/imports/prune/preview', { method: 'POST', body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 미리보기 실패');
    } finally {
      setBusy(false);
    }
  }
  async function executePrune() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const result = await call<{ deleted: number }>(
        `/admin/imports/prune/${plan.planId}/execute`,
        { method: 'POST', body: JSON.stringify({ confirmation }) },
      );
      setPruneMessage(
        `${result.deleted.toLocaleString()}건 삭제 완료. 저장소 파일은 순차 정리됩니다.`,
      );
      setPlan(undefined);
      setConfirmation('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  }
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
            setPlan(undefined);
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
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={visibleOnly}
            disabled={busy}
            onChange={(e) => {
              setVisibleOnly(e.target.checked);
              setPlan(undefined);
              setResult(undefined);
            }}
          />{' '}
          엑셀에서 보이는 행만 업로드
        </span>
      </label>
      <p>
        필터를 적용하고 저장한 XLSX를 사용하세요. 이 옵션은 필터 또는 수동으로 숨긴 행을 제외합니다.
        업로드만으로 기존 DB를 삭제하지 않습니다.
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
            body.append('visibleOnly', String(visibleOnly));
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
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setPlan(undefined);
            setConfirmation('');
          }}
        />
        <button disabled={busy || !file}>
          {busy ? '처리 중…' : mode === 'repair' ? '빈 기본정보 보완' : '등록'}
        </button>
      </form>
      {visibleOnly && (
        <section className="prune-panel" aria-label="보이는 수용가 외 DB 삭제">
          <h3>보이는 수용가만 남기고 기존 DB 정리</h3>
          <p>
            현재 파일에서 보이는 수용가번호 외의 <strong>전체 기존 수용가</strong>를 삭제합니다.
            숨긴 행뿐 아니라 파일에 없는 수용가도 대상입니다. 먼저 보이는 수용가를 업로드한 다음
            삭제 미리보기를 확인하세요.
          </p>
          <Button
            type="button"
            variant="outline"
            className="outline-btn"
            disabled={busy || !file}
            onClick={() => void previewPrune()}
          >
            삭제 대상 미리보기
          </Button>
          {plan && (
            <div>
              <p>
                유지 {plan.keepCount.toLocaleString()}건 · 삭제 {plan.deleteCount.toLocaleString()}
                건
              </p>
              <p>
                연결 사진 {plan.photoCount.toLocaleString()}장 · 검침{' '}
                {plan.inspectionCount.toLocaleString()}건 · 무효화할 한글 작업{' '}
                {plan.documentJobCount.toLocaleString()}건
              </p>
              <p>
                삭제 대상의 사진·검침·이력도 삭제합니다. 대상이 포함된 한글 작업은 유지 수용가가
                섞인 ZIP을 포함해 전체 삭제됩니다. 내려받은 파일은 회수되지 않습니다.
              </p>
              {plan.protectedCount > 0 && (
                <p role="alert">
                  확정·지급 정산 수용가 {plan.protectedCount}건이 포함돼 삭제 전체가 차단됩니다.
                </p>
              )}
              <details>
                <summary>삭제 대상 예시 (최대 50건)</summary>
                <ul>
                  {plan.sample.map((row) => (
                    <li key={row.consumerNumber}>
                      {row.consumerNumber} · {row.middleBlock || '중블록 없음'}
                    </li>
                  ))}
                </ul>
              </details>
              <label className="field">
                삭제 확인: {plan.confirmation}
                <input
                  value={confirmation}
                  disabled={busy || plan.protectedCount > 0}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="outline-btn"
                disabled={
                  busy ||
                  !plan.deleteCount ||
                  plan.protectedCount > 0 ||
                  confirmation !== plan.confirmation
                }
                onClick={() => void executePrune()}
              >
                확인한 DB 수용가 영구 삭제
              </Button>
              <p>
                미리보기는 15분간 유효하며 DB가 변경되면 다시 확인해야 합니다. 삭제는 되돌릴 수
                없습니다.
              </p>
            </div>
          )}
          {pruneMessage && <p role="status">{pruneMessage}</p>}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            검사 {result.totalRows} ·{' '}
            {result.updated !== undefined
              ? `보완 ${result.updated} · 변경 없음 ${result.unchanged} · 미등록 수용가 ${result.notFound}`
              : `등록 ${result.inserted} · 기존 ${result.alreadyExists}`}{' '}
            · 파일 중복 {result.duplicateInFile} · 숨김 제외 {result.hiddenRows ?? 0} · 오류{' '}
            {result.invalid}
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
