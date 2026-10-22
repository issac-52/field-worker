import { useWork } from '../context/WorkContext';

export function BlockFilters() {
  const { middle, setMiddle, small, setSmall, blocks, summary, resetFilters } = useWork();
  return (
    <section className="block-filters panel" aria-label="블록 조회 조건">
      <label>
        중블록
        <select
          value={middle}
          onChange={(e) => {
            setMiddle(e.target.value);
            setSmall('');
          }}
        >
          <option value="">전체 중블록</option>
          {blocks
            .filter((block) => !block.parentId)
            .map((block) => (
              <option key={block.id} value={block.id}>
                {block.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        소블록
        <select value={small} onChange={(e) => setSmall(e.target.value)}>
          <option value="">전체 소블록</option>
          {blocks
            .filter((block) => block.parentId && (!middle || block.parentId === middle))
            .map((block) => (
              <option key={block.id} value={block.id}>
                {block.name}
              </option>
            ))}
        </select>
      </label>
      <button className="outline-btn" onClick={resetFilters}>
        초기화
      </button>
      <small>
        {summary.total.toLocaleString()}건 · 시작 {summary.startCount.toLocaleString()} / 종료{' '}
        {summary.endCount.toLocaleString()}건
      </small>
    </section>
  );
}
