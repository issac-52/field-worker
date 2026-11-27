import { highlightedCondition, SPECIAL_CONDITIONS } from '../lib/specialCondition';

export function ConditionBadge({ code }: { code?: string }) {
  const highlight = highlightedCondition(code);
  return highlight ? (
    <span className="condition-badge" data-condition={highlight}>
      {SPECIAL_CONDITIONS[highlight]}
    </span>
  ) : null;
}
