import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { call } from '../../api/client';
import { Button } from '../ui/button';

type Row = { id: number; consumerNumber: string; status: string };
type Result = { nextId: number; throughId: number; done: boolean; rows: Row[] };
const labels: Record<string, string> = {
  UPDATED: '좌표 등록',
  EMPTY_ADDRESS: '주소 없음',
  NO_UNIQUE_MATCH: '검색 결과 없음 또는 여러 후보',
  CHANGED_OR_ALREADY_SET: '주소 변경 또는 좌표 등록됨',
};
export function GeocodingPanel() {
  const client = useQueryClient();
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  async function start() {
    stop.current = false;
    setBusy(true);
    setRows([]);
    setMessage('주소 변환 중…');
    let cursor = 0;
    let throughId: number | undefined;
    try {
      while (!stop.current) {
        const result = await call<Result>('/admin/geocoding', {
          method: 'POST',
          body: JSON.stringify({ afterId: cursor, throughId, region: region.trim() }),
        });
        setRows((previous) => [...previous, ...result.rows]);
        cursor = result.nextId;
        throughId = result.throughId;
        if (result.done) {
          setMessage('주소 변환이 완료됐습니다. 등록된 위치를 지도에서 확인하세요.');
          break;
        }
      }
      if (stop.current) setMessage('중지했습니다. 등록된 좌표는 유지됩니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '주소 변환에 실패했습니다.');
    } finally {
      setBusy(false);
      await client.invalidateQueries();
    }
  }
  const success = rows.filter((row) => row.status === 'UPDATED').length;
  const skipped = rows.filter((row) => row.status !== 'UPDATED');
  return (
    <section className="panel geocoding-panel">
      <h3>주소로 좌표 자동 등록</h3>
      <p>
        전체 수용가 중 좌표가 없는 주소를 NAVER로 변환합니다. 기존 좌표는 유지하며 검색 결과가 여러
        개면 건너뜁니다. API 사용량에 따라 비용이 발생할 수 있습니다.
      </p>
      <label className="field">
        주소 앞에 붙일 지역명 (시·군·구 포함)
        <input
          value={region}
          disabled={busy}
          maxLength={100}
          placeholder="예: 경상북도 경산시"
          onChange={(event) => setRegion(event.target.value)}
        />
      </label>
      <p>
        입력한 지역의 수용가인지 확인하세요. 실행 중에는 이 화면을 유지하세요. 지도에는 현재 조회
        페이지의 수용가가 표시됩니다.
      </p>
      <div className="geocoding-actions">
        <Button disabled={busy || region.trim().length < 2} onClick={() => void start()}>
          전체 미등록 주소 변환
        </Button>
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              stop.current = true;
              setMessage('현재 요청 완료 후 중지합니다…');
            }}
          >
            중지
          </Button>
        )}
      </div>
      <p role="status">
        {message}{' '}
        {rows.length > 0 && `처리 ${rows.length}건 · 등록 ${success}건 · 제외 ${skipped.length}건`}
      </p>
      {skipped.length > 0 && (
        <details>
          <summary>제외 사유 확인 (최근 100건)</summary>
          <ul>
            {skipped.slice(-100).map((row) => (
              <li key={row.id}>
                {row.consumerNumber}: {labels[row.status] ?? row.status}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
