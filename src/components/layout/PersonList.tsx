import { useMemo, useState } from 'react';
import type { Person } from '@/types/index.ts';
import { useTree } from '@/hooks/index.ts';
import { formatDisplayName } from '@/utils/name-display.ts';
import { matchesPlaceQuery } from '@/utils/place-search.ts';

type SearchMode = 'name' | 'place';
type SortField = 'name' | 'birth' | 'death' | 'sources' | 'place';
type SortDir = 'asc' | 'desc';

function formatYear(person: Person, field: 'birth' | 'death'): string {
  const year = person[field]?.date?.year;
  if (year == null) return '\u2014';
  const q = person[field]?.date?.qualifier;
  if (q === 'about') return `~${year}`;
  if (q === 'before') return `<${year}`;
  if (q === 'after') return `>${year}`;
  return String(year);
}

function getSortValue(person: Person, field: SortField): string | number {
  switch (field) {
    case 'name': return person.name.surname.toLowerCase() + ' ' + person.name.given.toLowerCase();
    case 'birth': return person.birth?.date?.year ?? 99999;
    case 'death': return person.death?.date?.year ?? 99999;
    case 'sources': return person.sourceIds.length;
    case 'place': return (person.birth?.place?.raw ?? '').toLowerCase();
  }
}

export function PersonList() {
  const { state, dispatch } = useTree();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchMode, setSearchMode] = useState<SearchMode>('name');

  const graph = state.graph;
  const searchQuery = state.searchQuery;

  const filtered = useMemo(() => {
    if (!graph) return [];
    const persons = Array.from(graph.persons.values());
    const q = searchQuery.trim();
    if (!q) return persons;

    if (searchMode === 'place') {
      return persons.filter(p => matchesPlaceQuery(p, q));
    }

    const ql = q.toLowerCase();
    return persons.filter(p => {
      const name = p.name.full.toLowerCase();
      const given = p.name.given.toLowerCase();
      const surname = p.name.surname.toLowerCase();
      return name.includes(ql) || given.includes(ql) || surname.includes(ql);
    });
  }, [graph, searchQuery, searchMode]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl text-text-primary">
          Individuals
          <span className="text-text-dim text-base ml-2">
            ({filtered.length.toLocaleString()}{searchQuery ? ` of ${graph?.persons.size.toLocaleString()}` : ''})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden border border-border">
            {(['name', 'place'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setSearchMode(mode)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  searchMode === mode
                    ? 'bg-gold text-bg'
                    : 'bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {mode === 'name' ? 'Name' : 'Place'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={searchMode === 'name' ? 'Search names...' : 'Search places...'}
            value={searchQuery}
            onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
            className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-dim focus:border-gold focus:outline-none w-64"
          />
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px_80px_1fr] bg-surface-hover text-xs text-text-dim font-medium uppercase tracking-wider">
          <button type="button" className="text-left px-4 py-2 hover:text-text-secondary" onClick={() => toggleSort('name')}>
            Name{sortIndicator('name')}
          </button>
          <button type="button" className="text-left px-2 py-2 hover:text-text-secondary" onClick={() => toggleSort('birth')}>
            Birth{sortIndicator('birth')}
          </button>
          <button type="button" className="text-left px-2 py-2 hover:text-text-secondary" onClick={() => toggleSort('death')}>
            Death{sortIndicator('death')}
          </button>
          <button type="button" className="text-left px-2 py-2 hover:text-text-secondary" onClick={() => toggleSort('sources')}>
            Sources{sortIndicator('sources')}
          </button>
          <button type="button" className="text-left px-2 py-2 hover:text-text-secondary" onClick={() => toggleSort('place')}>
            Birth Place{sortIndicator('place')}
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {sorted.map(person => (
            <button
              key={person.id}
              type="button"
              onClick={() => dispatch({ type: 'SELECT_PERSON', personId: person.id })}
              className={`
                grid grid-cols-[1fr_80px_80px_80px_1fr] w-full text-left text-sm border-t border-border
                hover:bg-surface-hover transition-colors cursor-pointer
                ${state.selectedPersonId === person.id ? 'bg-surface-hover border-l-2 border-l-gold' : ''}
              `}
            >
              <div className="px-4 py-2 truncate">
                <span className="font-[family-name:var(--font-display)] text-text-primary">
                  {formatDisplayName(person.name)}
                </span>
                {person.sex !== 'U' && (
                  <span className="text-text-dim ml-1.5 text-xs">
                    {person.sex === 'M' ? '\u2642' : '\u2640'}
                  </span>
                )}
              </div>
              <div className="px-2 py-2 text-text-secondary font-[family-name:var(--font-mono)] text-xs">
                {formatYear(person, 'birth')}
              </div>
              <div className="px-2 py-2 text-text-secondary font-[family-name:var(--font-mono)] text-xs">
                {formatYear(person, 'death')}
              </div>
              <div className="px-2 py-2 text-text-secondary font-[family-name:var(--font-mono)] text-xs">
                {person.sourceIds.length || '\u2014'}
              </div>
              <div className="px-2 py-2 text-text-dim text-xs truncate">
                {person.birth?.place?.raw || '\u2014'}
              </div>
            </button>
          ))}
          {sorted.length === 0 && (
            <div className="px-4 py-8 text-center text-text-dim">
              {searchQuery ? 'No matches found.' : 'No individuals loaded.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
