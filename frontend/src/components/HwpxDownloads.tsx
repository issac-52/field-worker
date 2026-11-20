import { useId, useRef, useState } from 'react';
import { ChevronRight, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { call, ApiError } from '../api/client';
import { Button } from './ui/button';

type Job = {
  id: string;
  title: string;
  status: string;
  total: number;
  completed: number;
  error: string;
  parts: { part: number; firstOrdinal: number; lastOrdinal: number }[];
};
type History = Pick<Job, 'id' | 'title' | 'status' | 'total' | 'completed'> & { createdAt: string };
const labels: Record<string, string> = {
  QUEUED: '대기 중',
  RUNNING: '생성 중',
  READY: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨',
  DELETING: '삭제 중',
};
const historyDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const isGenerating = (status: string) => status === 'QUEUED' || status === 'RUNNING';

function formatJobTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '요청 시각 미기재' : historyDate.format(date);
}

function Status({ status }: { status: string }) {
  return (
    <span className="hwpx-status" data-status={status}>
      {labels[status] ?? status}
    </span>
  );
}

export function HwpxDownloads({
  siteId,
  middleBlock,
  smallBlock,
}: {
  siteId?: number;
  middleBlock?: string;
  smallBlock?: string;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState('지방상수도 현대화사업 성과측정을 위한');
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [busy, setBusy] = useState<'create' | 'cancel' | 'delete' | 'download'>();
  const [showHistory, setShowHistory] = useState(false);
  const currentJob = useRef<HTMLElement>(null);
  const jobHeading = useId();
  const [error, setError] = useState('');
  const history = useQuery({
    queryKey: ['document-jobs'],
    enabled: open,
    queryFn: () => call<History[]>('/exports/cards'),
    refetchInterval: (q) =>
      q.state.data?.some((item) => ['QUEUED', 'RUNNING', 'DELETING'].includes(item.status))
        ? 2000
        : false,
  });
  const job = useQuery({
    queryKey: ['document-job', jobId],
    queryFn: () => call<Job>(`/exports/cards/${jobId}`),
    enabled: open && !!jobId,
    refetchInterval: (q) =>
      q.state.error instanceof ApiError && q.state.error.status === 404
        ? false
        : ['QUEUED', 'RUNNING', 'DELETING'].includes(q.state.data?.status ?? '')
          ? 2000
          : false,
  });
  function selectJob(id: string) {
    setJobId(id);
    setError('');
    window.requestAnimationFrame(() => {
      currentJob.current?.focus({ preventScroll: true });
      currentJob.current?.scrollIntoView({ block: 'nearest' });
    });
  }

  async function create() {
    const documentTitle = title.replace(/[\r\n]+/g, ' ').trim();
    if (busy || !documentTitle) return;
    setBusy('create');
    setError('');
    try {
      const result = await call<{ id: string }>('/exports/cards', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          middleBlock: middleBlock || undefined,
          smallBlock: smallBlock || undefined,
          title: documentTitle,
        }),
      });
      selectJob(result.id);
      await client.invalidateQueries({ queryKey: ['document-jobs'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 생성 요청 실패');
    } finally {
      setBusy(undefined);
    }
  }
  async function manage(id: string, action: 'cancel' | 'delete') {
    if (busy) return;
    if (
      action === 'delete' &&
      !window.confirm(
        '이 작업과 생성 결과를 삭제할까요? 진행 중이면 취소하며 다른 작업이 사용하는 문서는 유지합니다.',
      )
    )
      return;
    setBusy(action);
    setError('');
    try {
      await call(`/exports/cards/${id}${action === 'cancel' ? '/cancel' : ''}`, {
        method: action === 'cancel' ? 'POST' : 'DELETE',
      });
      if (action === 'delete' && jobId === id) setJobId(undefined);
      await client.invalidateQueries({ queryKey: ['document-jobs'] });
      await client.invalidateQueries({ queryKey: ['document-job', id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업 변경 실패');
    } finally {
      setBusy(undefined);
    }
  }
  async function download() {
    if (busy || job.data?.status !== 'READY') return;
    setBusy('download');
    setError('');
    try {
      await call(`/exports/cards/${jobId}/download-check`);
      const anchor = document.createElement('a');
      anchor.href = `/api/exports/cards/${jobId}/download`;
      anchor.download = '검침카드-전체.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드 실패');
    } finally {
      setBusy(undefined);
    }
  }
  const scope = siteId ? '이 수용가' : smallBlock || middleBlock || '전체 수용가';
  const selected = job.data;
  const records = history.data ?? [];
  const visibleHistory = showHistory ? records : records.slice(0, 3);
  return (
    <details
      className="admin-disclosure hwpx-disclosure"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span className="hwpx-trigger">
          <span className="hwpx-icon">
            <FileText size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>한글 검침카드 생성</strong>
            <small>{scope}</small>
          </span>
        </span>
      </summary>
      <section className="hwpx-panel" aria-label="한글 검침카드 생성 및 다운로드">
        <form
          className="hwpx-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="hwpx-title">
            <span>문서 상단 사업명</span>
            <textarea
              rows={2}
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!!busy}
            />
          </label>
          <Button type="submit" className="primary-btn" disabled={!!busy || !title.trim()}>
            <Plus size={17} aria-hidden="true" />
            {busy === 'create' ? '요청 중…' : '검침카드 생성 요청'}
          </Button>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {jobId && (
          <section ref={currentJob} tabIndex={-1} className="hwpx-job" aria-labelledby={jobHeading}>
            <div className="hwpx-job-heading">
              <h3 id={jobHeading}>{selected?.title || '선택한 작업'}</h3>
              {selected && <Status status={selected.status} />}
            </div>
            {job.error ? (
              <>
                <p role="alert">{job.error.message}</p>
                <Button type="button" variant="outline" onClick={() => void job.refetch()}>
                  작업 다시 불러오기
                </Button>
              </>
            ) : !selected ? (
              <p role="status">작업을 불러오는 중…</p>
            ) : (
              <>
                <div className="hwpx-job-progress">
                  <span>{selected.status === 'READY' ? '생성 완료' : '처리 건수'}</span>
                  <strong>
                    {selected.completed.toLocaleString()} / {selected.total.toLocaleString()}건
                  </strong>
                </div>
                {isGenerating(selected.status) && (
                  <>
                    <progress
                      max={Math.max(1, selected.total)}
                      value={selected.completed}
                      aria-label="검침카드 생성 진행률"
                    />
                    <p>이 화면을 닫아도 생성은 계속됩니다.</p>
                  </>
                )}
                {selected.error && (
                  <p role="alert" className="form-error">
                    {selected.error}
                  </p>
                )}
                {selected.status === 'READY' && (
                  <Button
                    type="button"
                    className="primary-btn hwpx-download"
                    disabled={!!busy}
                    onClick={() => void download()}
                  >
                    <Download size={18} aria-hidden="true" />
                    {busy === 'download' ? '다운로드 준비 중…' : '전체 ZIP 다운로드'}
                  </Button>
                )}
                {selected.status !== 'DELETING' && (
                  <details className="hwpx-job-options" key={selected.id}>
                    <summary>작업 관리</summary>
                    <div>
                      {isGenerating(selected.status) && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => void manage(selected.id, 'cancel')}
                        >
                          {busy === 'cancel' ? '취소 중…' : '생성 취소'}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="hwpx-delete"
                        disabled={!!busy}
                        onClick={() => void manage(selected.id, 'delete')}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        {busy === 'delete' ? '삭제 중…' : '결과 삭제'}
                      </Button>
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
        )}
        <section className="hwpx-history" aria-label="내 최근 생성 작업">
          <div className="hwpx-history-heading">
            <h3>최근 작업</h3>
            <span>7일 보관</span>
          </div>
          {history.error ? (
            <div className="hwpx-history-message">
              <p role="alert">{history.error.message}</p>
              <Button type="button" variant="outline" onClick={() => void history.refetch()}>
                목록 다시 불러오기
              </Button>
            </div>
          ) : history.isPending ? (
            <p role="status" className="hwpx-history-message">
              최근 작업을 불러오는 중…
            </p>
          ) : records.length === 0 ? (
            <p className="hwpx-history-message">아직 생성 요청이 없습니다.</p>
          ) : (
            <>
              <ul className="hwpx-history-list">
                {visibleHistory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="hwpx-history-item"
                      aria-current={item.id === jobId ? 'true' : undefined}
                      disabled={!!busy}
                      onClick={() => selectJob(item.id)}
                    >
                      <span className="hwpx-history-label">
                        <strong>{item.title}</strong>
                        <small>
                          {formatJobTime(item.createdAt)} · {item.total.toLocaleString()}건
                        </small>
                      </span>
                      <Status status={item.status} />
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {records.length > 3 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="hwpx-history-more"
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory((value) => !value)}
                >
                  {showHistory ? '최근 3건만 보기' : `최근 작업 ${records.length}건 모두 보기`}
                </Button>
              )}
            </>
          )}
        </section>
      </section>
    </details>
  );
}
