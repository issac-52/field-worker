import { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Settings2 } from 'lucide-react';
import { useWork } from '../context/WorkContext';
import { FeeEditor } from '../components/fees/FeeEditor';
import { formatDate, formatWon } from '../lib/format';
import { PHASE_LABEL } from '../types';
import type { FeeAdjustmentResult, FeeRule } from '../types';

export function FeesPage() {
  const { rules, navigate } = useWork();
  const [mode, setMode] = useState<'rule' | 'adjust'>();
  const [result, setResult] = useState<FeeAdjustmentResult>();
  const [editingRule, setEditingRule] = useState<FeeRule>();
  return (
    <>
      <button className="back" onClick={() => navigate('admin')}>
        <ArrowLeft size={17} />
        관리자 메뉴
      </button>
      <section className="pagehead">
        <h1>작업비 관리</h1>
      </section>
      <div className="fee-summary">
        {(['START', 'END'] as const).map((phase) => (
          <div key={phase}>
            <span>{PHASE_LABEL[phase]} 기준 단가</span>
            <strong>
              {formatWon(rules.filter((rule) => rule.phase === phase).at(-1)?.amount ?? 0)}
            </strong>
          </div>
        ))}
      </div>
      <section className="panel admin-pad">
        <div className="panel-title">
          <div>
            <h3>기본 단가 규칙</h3>
            <p className="muted">새로 등록하는 검침에 적용</p>
          </div>
          <button
            className="primary-btn small"
            onClick={() => {
              setEditingRule(undefined);
              setMode('rule');
            }}
          >
            <Plus size={16} />
            규칙 추가
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>단계</th>
                <th>시작일</th>
                <th>종료일</th>
                <th>건당 단가</th>
                <th>변경</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="table-phase">{PHASE_LABEL[rule.phase]}</td>
                  <td>{formatDate(rule.startDate)}</td>
                  <td>{formatDate(rule.endDate)}</td>
                  <td>
                    <b>{formatWon(rule.amount)}</b>
                  </td>
                  <td>
                    <button
                      className="outline-btn"
                      onClick={() => {
                        setEditingRule(rule);
                        setMode('rule');
                      }}
                    >
                      {rule.phase} 단가 변경
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel admin-pad spaced">
        <div className="panel-title">
          <h3>기존 검침 작업비 변경</h3>
        </div>
        <div className="adjust-card">
          <div className="adjust-icon">
            <Settings2 size={22} />
          </div>
          <div>
            <b>기간별 일괄 변경</b>
            <p>단계와 검침 기간을 지정해 기존 작업비를 변경합니다.</p>
          </div>
          <button className="outline-btn" onClick={() => setMode('adjust')}>
            변경하기
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
      {result && (
        <p role="status" className="adjust-result">
          {result.updatedCount.toLocaleString()}건 변경 · {formatWon(result.beforeTotal)} →{' '}
          {formatWon(result.afterTotal)}
        </p>
      )}
      {mode && (
        <FeeEditor
          mode={mode}
          rule={mode === 'rule' ? editingRule : undefined}
          onClose={() => setMode(undefined)}
          onAdjusted={setResult}
        />
      )}
    </>
  );
}
