import type { Person } from '@/types/person.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';

interface PersonLinkProps {
  person: Person;
  onClick: (personId: string) => void;
  showBadge?: boolean;
}

export function PersonLink({ person, onClick, showBadge = true }: PersonLinkProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(person.id)}
      className="inline-flex items-center gap-1.5 text-left text-gold hover:text-gold-light transition-colors"
    >
      <span className="font-[family-name:var(--font-heading)]">{person.name.full}</span>
      {showBadge && <ConfidenceBadge tier={person.confidenceTier} />}
    </button>
  );
}
