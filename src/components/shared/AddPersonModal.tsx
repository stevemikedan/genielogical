import { useState, useCallback } from 'react';
import { useTree } from '@/hooks/index.ts';
import { generatePersonId } from '@/utils/id-generator.ts';
import { parseDateInput } from '@/parser/date-input-parser.ts';
import { parsePlaceInput } from '@/parser/place-input-parser.ts';
import type { Person } from '@/types/person.ts';

interface AddPersonModalProps {
  onClose: () => void;
  onCreated: (personId: string) => void;
  defaultSex?: 'M' | 'F' | 'U';
}

type Sex = 'M' | 'F' | 'U';

export function AddPersonModal({ onClose, onCreated, defaultSex }: AddPersonModalProps) {
  const { dispatch } = useTree();

  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState<Sex>(defaultSex ?? 'U');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [deathPlace, setDeathPlace] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const givenTrimmed = given.trim();
    const surnameTrimmed = surname.trim();

    if (!givenTrimmed && !surnameTrimmed) return;

    const fullName = [givenTrimmed, surnameTrimmed].filter(Boolean).join(' ');
    const id = generatePersonId();

    const person: Person = {
      id,
      name: {
        full: fullName,
        given: givenTrimmed,
        middle: '',
        surname: surnameTrimmed,
        maidenName: '',
        prefix: '',
        suffix: '',
        raw: fullName,
      },
      alternateNames: [],
      sex,
      birth: {
        date: birthDate.trim() ? parseDateInput(birthDate.trim()) : null,
        place: birthPlace.trim() ? parsePlaceInput(birthPlace.trim()) : null,
      },
      death: {
        date: deathDate.trim() ? parseDateInput(deathDate.trim()) : null,
        place: deathPlace.trim() ? parsePlaceInput(deathPlace.trim()) : null,
      },
      burial: null,
      events: [],
      notes: '',
      customTags: [],
      confidenceTier: 4,
      confidenceReason: 'Newly created, no sources',
      status: 'tentative',
      sourceIds: [],
      flagIds: [],
      researchStepIds: [],
      conjectureIds: [],
      gedcomXref: null,
      familyIdAsSpouse: [],
      familyIdAsChild: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: 'ADD_PERSON', person });
    onCreated(id);
  }, [given, surname, sex, birthDate, birthPlace, deathDate, deathPlace, dispatch, onCreated]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[480px] max-w-[90vw]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            Add Person
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text-primary text-xl leading-none p-1"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">Given Name *</label>
              <input
                type="text"
                value={given}
                onChange={e => setGiven(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">Surname</label>
              <input
                type="text"
                value={surname}
                onChange={e => setSurname(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="Smith"
              />
            </div>
          </div>

          {/* Sex */}
          <div>
            <label className="block text-xs text-text-dim mb-1">Sex</label>
            <div className="flex gap-4">
              {([['M', 'Male'], ['F', 'Female'], ['U', 'Unknown']] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer text-sm text-text-secondary">
                  <input
                    type="radio"
                    name="sex"
                    value={val}
                    checked={sex === val}
                    onChange={() => setSex(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Birth */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">Birth Date</label>
              <input
                type="text"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="15 Mar 1842 or about 1840"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">Birth Place</label>
              <input
                type="text"
                value={birthPlace}
                onChange={e => setBirthPlace(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="Richmond, Virginia, USA"
              />
            </div>
          </div>

          {/* Death */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">Death Date</label>
              <input
                type="text"
                value={deathDate}
                onChange={e => setDeathDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="1 Jan 1900"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">Death Place</label>
              <input
                type="text"
                value={deathPlace}
                onChange={e => setDeathPlace(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                           placeholder-text-dim focus:outline-none focus:border-gold/50"
                placeholder="London, England"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                         hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!given.trim() && !surname.trim()}
              className="px-4 py-1.5 text-sm rounded bg-gold text-bg font-medium
                         hover:bg-gold-light transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Person
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
