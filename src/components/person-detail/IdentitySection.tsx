import { useState } from 'react';
import type { Person } from '@/types/person.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { EditPersonForm } from './EditPersonForm.tsx';

const SEX_LABELS: Record<string, string> = { M: 'Male', F: 'Female', U: 'Unknown' };

function formatDate(date: Person['birth']): string {
  if (!date.date) return 'Unknown';
  if (date.date.raw) return date.date.raw;
  if (date.date.year) return String(date.date.year);
  return 'Unknown';
}

function formatPlace(place: Person['birth']['place']): string | null {
  if (!place) return null;
  return place.raw || place.parts.filter(Boolean).join(', ') || null;
}

function computeLifespan(person: Person): string | null {
  const birthYear = person.birth.date?.year;
  const deathYear = person.death.date?.year;
  if (birthYear && deathYear) {
    return `${deathYear - birthYear} years`;
  }
  return null;
}

interface IdentitySectionProps {
  person: Person;
  dispatch: TreeAction extends never ? never : React.Dispatch<TreeAction>;
}

export function IdentitySection({ person, dispatch }: IdentitySectionProps) {
  const [editing, setEditing] = useState(false);
  const lifespan = computeLifespan(person);
  const birthPlace = formatPlace(person.birth.place);
  const deathPlace = formatPlace(person.death.place);

  if (editing) {
    return (
      <EditPersonForm
        person={person}
        dispatch={dispatch}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <section>
      <div className="space-y-2">
        {/* Sex & GEDCOM xref + Edit button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-secondary">{SEX_LABELS[person.sex] ?? 'Unknown'}</span>
            {person.gedcomXref && (
              <span className="font-mono text-text-dim text-xs">{person.gedcomXref}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-text-dim hover:text-gold transition-colors px-1.5 py-0.5
                       rounded hover:bg-gold/10"
            title="Edit person details"
          >
            &#x270E; Edit
          </button>
        </div>

        {/* Birth */}
        <div className="text-sm">
          <span className="text-text-dim">Born: </span>
          <span className="text-text-primary">{formatDate(person.birth)}</span>
          {birthPlace && (
            <span className="text-text-secondary"> — {birthPlace}</span>
          )}
        </div>

        {/* Death */}
        {(person.death.date || person.death.place) && (
          <div className="text-sm">
            <span className="text-text-dim">Died: </span>
            <span className="text-text-primary">{formatDate(person.death)}</span>
            {deathPlace && (
              <span className="text-text-secondary"> — {deathPlace}</span>
            )}
          </div>
        )}

        {/* Lifespan */}
        {lifespan && (
          <div className="text-sm text-text-secondary">
            Lived ~{lifespan}
          </div>
        )}

        {/* Name details if they differ from full */}
        {(person.name.prefix || person.name.suffix || person.name.maidenName) && (
          <div className="text-xs text-text-dim">
            {person.name.prefix && <span>Prefix: {person.name.prefix} </span>}
            {person.name.suffix && <span>Suffix: {person.name.suffix} </span>}
            {person.name.maidenName && <span>Maiden name: {person.name.maidenName}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
