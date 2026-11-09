import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { call, request } from '../api/client';
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
};
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
  const [jobId, setJobId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const history = useQuery({
    queryKey: ['document-jobs'],
    queryFn: () => call<History[]>('/exports/cards'),
  });
  const job = useQuery({
    queryKey: ['document-job', jobId],
    queryFn: () => call<Job>(`/exports/cards/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) =>
      ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 2000 : false,
  });
  async function create() {
    setBusy(true);
    setError('');
    try {
      const result = await call<{ id: string }>('/exports/cards', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          middleBlock: middleBlock || undefined,
          smallBlock: smallBlock || undefined,
          title: title.trim(),
        }),
      });
      setJobId(result.id);
      await client.invalidateQueries({ queryKey: ['document-jobs'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 생성 요청 실패');
    } finally {
      setBusy(false);
    }
  }
  async function download(part: number) {
    setBusy(true);
    setError('');
    try {
      const response = await request(`/exports/cards/${jobId}/parts/${part}`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `검침카드-${part}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드 실패');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel hwpx-panel">
      <h2>한글 검침카드 (HWPX)</h2>
      <p>
        {siteId ? '이 수용가' : smallBlock || middleBlock || '전체 수용가'}의 검침카드를 생성합니다.
        원경·시작 근경·완료 근경 사진을 넣고 위치도는 비워 둡니다.
      </p>
      <label className="field">
        문서 상단 사업명
        <input
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </label>
      <Button
        className="primary-btn"
        onClick={() => void create()}
        disabled={busy || !title.trim()}
      >
        검침카드 생성 요청
      </Button>
      <p className="form-help">
        화면을 닫아도 생성은 계속됩니다. 변경 없는 문서는 재사용하며, 최대 50건씩 ZIP으로 나누어
        7일간 보관합니다. 사진·정보 변경 후에는 다시 생성해 주세요.
      </p>
      {(error || job.error || history.error) && (
        <p role="alert" className="form-error">
          {error || job.error?.message || history.error?.message}
        </p>
      )}
      {job.isFetching && !job.data && <p role="status">작업을 확인하는 중…</p>}
      {job.data && (
        <div aria-live="polite">
          <p>
            {labels[job.data.status] ?? job.data.status} · {job.data.completed.toLocaleString()} /{' '}
            {job.data.total.toLocaleString()}건
          </p>
          {job.data.error && <p className="form-error">{job.data.error}</p>}
          <div className="hwpx-parts">
            {job.data.parts.map((part) => (
              <Button
                key={part.part}
                variant="outline"
                className="outline-btn"
                disabled={busy}
                onClick={() => void download(part.part)}
              >
                {part.firstOrdinal}~{part.lastOrdinal}번 ZIP 다운로드
              </Button>
            ))}
          </div>
        </div>
      )}
      <details>
        <summary>최근 생성 요청 (보관 기간 7일)</summary>
        <ul>
          {history.data?.map((item) => (
            <li key={item.id}>
              <Button variant="ghost" className="text-btn" onClick={() => setJobId(item.id)}>
                {new Date(item.createdAt).toLocaleString('ko-KR')} · {item.total.toLocaleString()}건
                보기
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
