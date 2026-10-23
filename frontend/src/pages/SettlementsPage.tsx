import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Wallet } from 'lucide-react';
import { useWork } from '../context/work';
import { Pagination } from '../components/Pagination';
import { formatDate, formatWon } from '../lib/format';
import { PHASE_LABEL } from '../types';

export function SettlementsPage() {
  const {
    settleWorker,
    setSettleWorker,
    settlePhase,
    setSettlePhase,
    from,
    setFrom,
    until,
    setUntil,
    users,
    settlementData,
    openSite,
    changeSettlementPage,
    loading,
  } = useWork();
  const rows = settlementData?.items ?? [];
  return (
    <>
      <h1 className="sr-only">정산 내역</h1>
      <div className="settlement-filters block-filters panel">
        <label>
          조사자
          <select value={settleWorker} onChange={(e) => setSettleWorker(e.target.value)}>
            <option value="">전체 조사자</option>
            {users
              .filter((user) => user.role === 'WORKER')
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          단계
          <select value={settlePhase} onChange={(e) => setSettlePhase(e.target.value)}>
            <option value="">전체 단계</option>
            <option value="START">시작단계</option>
            <option value="END">종료단계</option>
          </select>
        </label>
        <label>
          시작일
          <Input
            type="date"
            value={from}
            onInput={(e) => setFrom(e.currentTarget.value)}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          종료일
          <Input
            type="date"
            min={from}
            value={until}
            onInput={(e) => setUntil(e.currentTarget.value)}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      </div>
      {from && until && from > until && (
        <p className="form-error" role="alert">
          종료일은 시작일 이후로 선택하세요.
        </p>
      )}
      <div className="settle-hero">
        <div>
          <span>조회 기간 작업비 합계</span>
          <strong>{formatWon(settlementData?.summary.totalFee ?? 0)}</strong>
        </div>
        <Wallet size={50} />
      </div>
      <section className="section-heading spaced">
        <h3>조사자별 집계</h3>
      </section>
      <div className="worker-stats">
        {users
          .filter(
            (user) => user.role === 'WORKER' && (!settleWorker || user.id === Number(settleWorker)),
          )
          .map((user) => {
            const result = settlementData?.summary.workers.find(
              (worker) => worker.workerId === user.id,
            );
            return (
              <div className="worker-stat" key={user.id}>
                <div className="avatar">{user.name[0]}</div>
                <div>
                  <b>{user.name}</b>
                  <small>{result?.count ?? 0}건</small>
                </div>
                <strong>{formatWon(result?.fee ?? 0)}</strong>
              </div>
            );
          })}
      </div>
      <section id="settlement-results" className="section-heading spaced">
        <h3>검침별 상세 내역</h3>
        <span>{(settlementData?.total ?? 0).toLocaleString()}건</span>
      </section>
      <div className="panel settle-list">
        {rows.map((row) => (
          <Button
            variant="ghost"
            className="settle-row"
            key={`${row.siteId}-${row.phase}`}
            onClick={() => openSite(row.siteId)}
          >
            <div>
              <b>
                {row.workerName}
                <small> #{row.managementNo}</small>
              </b>
              <span>
                {PHASE_LABEL[row.phase]} · {formatDate(row.date)} · {row.zone}
              </span>
            </div>
            <strong>{formatWon(row.fee)}</strong>
          </Button>
        ))}
        {!rows.length && (
          <div className="empty">{loading ? '불러오는 중...' : '검침 기록이 없습니다.'}</div>
        )}
      </div>
      <Pagination data={settlementData} onChange={changeSettlementPage} />
    </>
  );
}
