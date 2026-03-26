import { useState, useCallback } from 'react';
import type { Person, AlternateName } from '@/types/person.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { parseDateInput } from '@/parser/date-input-parser.ts';
import { parsePlaceInput } from '@/parser/place-input-parser.ts';

interface EditPersonFormProps {
  person: Person;
  dispatch: React.Dispatch<TreeAction>;
  onDone: () => void;
}

function formatDateForInput(date: Person['birth']['date']): string {
  if (!date) return '';
  return date.raw || (date.year ? String(date.year) : '');
}

function formatPlaceForInput(place: Person['birth']['place']): string {
  if (!place) return '';
  return place.raw || place.parts.filter(Boolean).join(', ') || '';
}

type AltNameType = AlternateName['type'];

const ALT_NAME_TYPES: Array<{ value: AltNameType; label: string }> = [
  { value: 'aka', label: 'Also Known As' },
  { value: 'married', label: 'Married Name' },
  { value: 'maiden', label: 'Maiden Name' },
  { value: 'birth', label: 'Birth Name' },
  { value: 'nickname', label: 'Nickname' },
  { value: 'immigrant', label: 'Immigrant Name' },
  { value: 'religious', label: 'Religious Name' },
  { value: 'other', label: 'Other' },
];

export function EditPersonForm({ person, dispatch, onDone }: EditPersonFormProps) {
  // ── Core fields ──
  const [given, setGiven] = useState(person.name.given);
  const [middle, setMiddle] = useState(person.name.middle);
  const [surname, setSurname] = useState(person.name.surname);
  const [maidenName, setMaidenName] = useState(person.name.maidenName);
  const [prefix, setPrefix] = useState(person.name.prefix);
  const [suffix, setSuffix] = useState(person.name.suffix);
  const [sex, setSex] = useState(person.sex);
  const [birthDate, setBirthDate] = useState(formatDateForInput(person.birth.date));
  const [birthPlace, setBirthPlace] = useState(formatPlaceForInput(person.birth.place));
  const [deathDate, setDeathDate] = useState(formatDateForInput(person.death.date));
  const [deathPlace, setDeathPlace] = useState(formatPlaceForInput(person.death.place));

  // ── Additional details ──
  const [showAdditional, setShowAdditional] = useState(false);
  const [burialDate, setBurialDate] = useState(formatDateForInput(person.burial?.date ?? null));
  const [burialPlace, setBurialPlace] = useState(formatPlaceForInput(person.burial?.place ?? null));
  const [notes, setNotes] = useState(person.notes);
  const [alternateNames, setAlternateNames] = useState<AlternateName[]>(person.alternateNames);

  // ── Alternate name editing ──
  const [newAltName, setNewAltName] = useState('');
  const [newAltType, setNewAltType] = useState<AltNameType>('aka');

  const addAlternateName = useCallback(() => {
    const trimmed = newAltName.trim();
    if (!trimmed) return;
    const parts = trimmed.split(' ');
    const altName: AlternateName = {
      name: {
        full: trimmed,
        given: parts[0] ?? '',
        middle: '',
        surname: parts.slice(1).join(' '),
        maidenName: '',
        prefix: '',
        suffix: '',
        raw: trimmed,
      },
      type: newAltType,
      notes: '',
    };
    setAlternateNames(prev => [...prev, altName]);
    setNewAltName('');
  }, [newAltName, newAltType]);

  const removeAlternateName = useCallback((index: number) => {
    setAlternateNames(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const givenTrimmed = given.trim();
    const surnameTrimmed = surname.trim();
    const middleTrimmed = middle.trim();
    const fullName = [prefix.trim(), givenTrimmed, middleTrimmed, surnameTrimmed, suffix.trim()]
      .filter(Boolean).join(' ');

    const updates: Partial<Person> = {
      name: {
        full: fullName,
        given: givenTrimmed,
        middle: middleTrimmed,
        surname: surnameTrimmed,
        maidenName: maidenName.trim(),
        prefix: prefix.trim(),
        suffix: suffix.trim(),
        raw: fullName,
      },
      sex,
      birth: {
        date: birthDate.trim() ? parseDateInput(birthDate.trim()) : null,
        place: birthPlace.trim() ? parsePlaceInput(birthPlace.trim()) : null,
      },
      death: {
        date: deathDate.trim() ? parseDateInput(deathDate.trim()) : null,
        place: deathPlace.trim() ? parsePlaceInput(deathPlace.trim()) : null,
      },
      burial: (burialDate.trim() || burialPlace.trim()) ? {
        date: burialDate.trim() ? parseDateInput(burialDate.trim()) : null,
        place: burialPlace.trim() ? parsePlaceInput(burialPlace.trim()) : null,
      } : null,
      notes,
      alternateNames,
    };

    dispatch({
      type: 'UPDATE_PERSON',
      personId: person.id,
      updates,
    });

    onDone();
  }, [given, middle, surname, maidenName, prefix, suffix, sex, birthDate, birthPlace,
    deathDate, deathPlace, burialDate, burialPlace, notes, alternateNames,
    person.id, dispatch, onDone]);

  const inputClass = 'w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-gold/50';
  const labelClass = 'block text-xs text-text-dim mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-border rounded p-3 bg-bg">
      <h4 className="text-sm font-medium text-text-primary">Edit Person</h4>

      {/* Name */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Given Name</label>
          <input type="text" value={given} onChange={e => setGiven(e.target.value)}
            autoFocus className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Middle Name</label>
          <input type="text" value={middle} onChange={e => setMiddle(e.target.value)}
            placeholder="Middle" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Surname</label>
          <input type="text" value={surname} onChange={e => setSurname(e.target.value)}
            className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Maiden Name</label>
          <input type="text" value={maidenName} onChange={e => setMaidenName(e.target.value)}
            placeholder="Birth surname" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Prefix</label>
          <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)}
            placeholder="Dr., Rev." className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Suffix</label>
          <input type="text" value={suffix} onChange={e => setSuffix(e.target.value)}
            placeholder="Jr., III" className={inputClass} />
        </div>
      </div>

      {/* Sex */}
      <div>
        <label className={labelClass}>Sex</label>
        <div className="flex gap-3">
          {([['M', 'Male'], ['F', 'Female'], ['U', 'Unknown']] as const).map(([val, label]) => (
            <label key={val} className="flex items-center gap-1 cursor-pointer text-xs text-text-secondary">
              <input type="radio" name="editSex" value={val}
                checked={sex === val} onChange={() => setSex(val)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Birth */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Birth Date</label>
          <input type="text" value={birthDate} onChange={e => setBirthDate(e.target.value)}
            placeholder="15 Mar 1842" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Birth Place</label>
          <input type="text" value={birthPlace} onChange={e => setBirthPlace(e.target.value)}
            placeholder="City, State, Country" className={inputClass} />
        </div>
      </div>

      {/* Death */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Death Date</label>
          <input type="text" value={deathDate} onChange={e => setDeathDate(e.target.value)}
            placeholder="1 Jan 1900" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Death Place</label>
          <input type="text" value={deathPlace} onChange={e => setDeathPlace(e.target.value)}
            placeholder="City, State, Country" className={inputClass} />
        </div>
      </div>

      {/* ── Additional Details (expandable) ── */}
      <button
        type="button"
        onClick={() => setShowAdditional(!showAdditional)}
        className="text-xs text-gold/80 hover:text-gold transition-colors flex items-center gap-1"
      >
        <span className={`transition-transform ${showAdditional ? 'rotate-90' : ''}`}>&#x25B6;</span>
        Additional Details
      </button>

      {showAdditional && (
        <div className="space-y-3 pl-2 border-l-2 border-border">
          {/* Burial */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Burial Date</label>
              <input type="text" value={burialDate} onChange={e => setBurialDate(e.target.value)}
                placeholder="Date of burial" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Burial Place</label>
              <input type="text" value={burialPlace} onChange={e => setBurialPlace(e.target.value)}
                placeholder="Cemetery, City, State" className={inputClass} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Research notes, observations, context..."
              className={`${inputClass} resize-y`}
            />
          </div>

          {/* Alternate Names */}
          <div>
            <label className={labelClass}>Alternate Names</label>
            {alternateNames.length > 0 && (
              <div className="space-y-1 mb-2">
                {alternateNames.map((alt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-text-primary">{alt.name.full}</span>
                    <span className="text-text-dim">({alt.type})</span>
                    <button
                      type="button"
                      onClick={() => removeAlternateName(i)}
                      className="text-tier4/70 hover:text-tier4 text-xs ml-auto"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAltName}
                onChange={e => setNewAltName(e.target.value)}
                placeholder="Alternate name"
                className={`${inputClass} flex-1`}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlternateName(); } }}
              />
              <select
                value={newAltType}
                onChange={e => setNewAltType(e.target.value as AltNameType)}
                className="bg-surface border border-border rounded px-1.5 py-1 text-xs text-text-primary"
              >
                {ALT_NAME_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addAlternateName}
                disabled={!newAltName.trim()}
                className="px-2 py-1 text-xs rounded border border-border text-text-secondary
                           hover:text-gold hover:border-gold/40 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-3 py-1 rounded bg-gold text-bg text-sm font-medium hover:bg-gold-light transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1 rounded border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
