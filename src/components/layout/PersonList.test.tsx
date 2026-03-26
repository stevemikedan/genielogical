import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonList } from './PersonList.tsx';
import { TreeContext } from '@/context/tree-context.tsx';
import type { TreeContextValue } from '@/context/tree-context.tsx';
import type { TreeState } from '@/context/tree-state.ts';
import type { Person } from '@/types/index.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  const { id, ...rest } = overrides;
  return {
    id,
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test /Person/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: '',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: id,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  };
}

function createMockGraph(persons: Person[]): TreeGraph {
  return {
    persons: new Map(persons.map(p => [p.id, p])),
    edges: new Map(),
    sources: new Map(),
    parentEdges: new Map(),
    childEdges: new Map(),
    spouseMap: new Map(),
    familyIndex: new Map(),
  } as unknown as TreeGraph;
}

function renderWithContext(state: Partial<TreeState>, dispatch?: TreeState extends never ? never : React.Dispatch<never>) {
  const fullState: TreeState = {
    phase: 'loaded',
    graph: null,
    stats: null,
    currentTreeId: null,
    flags: [],
    conjectures: new Map(),
    selectedPersonId: null,
    searchQuery: '',
    error: null,
    expandToAncestor: null,
    deepScanResult: null,
    storyPathResult: null,
    researchPriorities: [],
    aiValidations: new Map(),
    aiEdgeValidations: new Map(),
    aiNotableContexts: new Map(),
    aiBatchProgress: null,
    aiEnrichResults: new Map(),
    researchSteps: [],
    ...state,
  };

  const mockDispatch = dispatch ?? vi.fn();

  const contextValue: TreeContextValue = {
    state: fullState,
    dispatch: mockDispatch as TreeContextValue['dispatch'],
  };

  return {
    ...render(
      <TreeContext value={contextValue}>
        <PersonList />
      </TreeContext>,
    ),
    mockDispatch,
  };
}

const john = makePerson({
  id: '@I1@',
  name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
  sex: 'M',
  birth: {
    date: { date: null, endDate: null, qualifier: 'exact' as const, raw: '1850', year: 1850 },
    place: { raw: 'London, England', city: 'London', county: null, state: null, country: 'England', parts: ['London', 'England'] },
  },
  death: {
    date: { date: null, endDate: null, qualifier: 'about' as const, raw: 'ABT 1920', year: 1920 },
    place: null,
  },
  sourceIds: ['@S1@', '@S2@'],
});

const jane = makePerson({
  id: '@I2@',
  name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' },
  sex: 'F',
  birth: {
    date: { date: null, endDate: null, qualifier: 'exact' as const, raw: '1870', year: 1870 },
    place: null,
  },
});

const alice = makePerson({
  id: '@I3@',
  name: { full: 'Alice Wonderland', given: 'Alice', middle: '', surname: 'Wonderland', maidenName: '', prefix: '', suffix: '', raw: 'Alice /Wonderland/' },
  sex: 'F',
});

describe('PersonList', () => {
  describe('empty state', () => {
    it('renders "No individuals loaded" when graph is null', () => {
      renderWithContext({ graph: null });
      expect(screen.getByText('No individuals loaded.')).toBeInTheDocument();
    });

    it('renders "No individuals loaded" when graph has no persons', () => {
      const emptyGraph = createMockGraph([]);
      renderWithContext({ graph: emptyGraph });
      expect(screen.getByText('No individuals loaded.')).toBeInTheDocument();
    });
  });

  describe('rendering persons', () => {
    it('renders person names from the graph', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph });

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('shows person count', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph });

      // The count is displayed as "(3)" in the header
      expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    });

    it('shows sex indicator for M and F persons', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph });

      // Male symbol and female symbol should be present
      expect(screen.getByText('\u2642')).toBeInTheDocument();
      expect(screen.getByText('\u2640')).toBeInTheDocument();
    });

    it('does not show sex indicator for sex=U persons', () => {
      const unknownSex = makePerson({ id: '@I4@', sex: 'U' });
      const graph = createMockGraph([unknownSex]);
      renderWithContext({ graph });

      expect(screen.queryByText('\u2642')).not.toBeInTheDocument();
      expect(screen.queryByText('\u2640')).not.toBeInTheDocument();
    });

    it('displays birth year formatted correctly', () => {
      const graph = createMockGraph([john]);
      renderWithContext({ graph });

      // John has birth year 1850 (exact) and death year ~1920 (about)
      expect(screen.getByText('1850')).toBeInTheDocument();
      expect(screen.getByText('~1920')).toBeInTheDocument();
    });

    it('displays source count for persons with sources', () => {
      const graph = createMockGraph([john]);
      renderWithContext({ graph });

      // John has 2 sources
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays birth place when available', () => {
      const graph = createMockGraph([john]);
      renderWithContext({ graph });

      expect(screen.getByText('London, England')).toBeInTheDocument();
    });
  });

  describe('search filtering', () => {
    it('filters the list when searchQuery is set', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph, searchQuery: 'john' });

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
      expect(screen.queryByText('Alice Wonderland')).not.toBeInTheDocument();
    });

    it('filters by surname', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph, searchQuery: 'doe' });

      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.queryByText('Alice Wonderland')).not.toBeInTheDocument();
    });

    it('shows "No matches found." when search has no results', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph, searchQuery: 'zzzzzzz' });

      expect(screen.getByText('No matches found.')).toBeInTheDocument();
    });

    it('shows filtered count with total when searching', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph, searchQuery: 'john' });

      // The count span contains "(1 of 3)"
      const countSpan = screen.getByText(/of 3/);
      expect(countSpan).toBeInTheDocument();
      expect(countSpan.textContent).toContain('1');
      expect(countSpan.textContent).toContain('of 3');
    });

    it('dispatches SET_SEARCH when typing in search input', () => {
      const graph = createMockGraph([john, jane]);
      const { mockDispatch } = renderWithContext({ graph });

      const searchInput = screen.getByPlaceholderText('Search names...');
      fireEvent.change(searchInput, { target: { value: 'Smith' } });

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_SEARCH', query: 'Smith' });
    });
  });

  describe('sorting', () => {
    it('sorts by name ascending by default', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph });

      // Default sort is by name ascending (surname first): Doe, Smith, Wonderland
      const buttons = screen.getAllByRole('button');
      // The person buttons contain the names
      const personButtons = buttons.filter(b => b.textContent?.includes('Smith') || b.textContent?.includes('Doe') || b.textContent?.includes('Wonderland'));
      expect(personButtons[0]).toHaveTextContent('Jane Doe');
      expect(personButtons[1]).toHaveTextContent('John Smith');
      expect(personButtons[2]).toHaveTextContent('Alice Wonderland');
    });

    it('toggles sort direction on repeated click of the same column', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph });

      // Click the Name header button to toggle to desc
      const nameHeader = screen.getByText(/^Name/);
      fireEvent.click(nameHeader);

      // Now sorted descending: Wonderland, Smith, Doe
      const buttons = screen.getAllByRole('button');
      const personButtons = buttons.filter(b => b.textContent?.includes('Smith') || b.textContent?.includes('Doe') || b.textContent?.includes('Wonderland'));
      expect(personButtons[0]).toHaveTextContent('Alice Wonderland');
      expect(personButtons[1]).toHaveTextContent('John Smith');
      expect(personButtons[2]).toHaveTextContent('Jane Doe');
    });

    it('sorts by birth year when birth header is clicked', () => {
      const graph = createMockGraph([john, jane, alice]);
      renderWithContext({ graph });

      // Use exact match to avoid matching "Birth Place" div
      const birthHeader = screen.getByRole('button', { name: /^Birth$/ });
      fireEvent.click(birthHeader);

      // John: 1850, Jane: 1870, Alice: no date (99999)
      const buttons = screen.getAllByRole('button');
      const personButtons = buttons.filter(b => b.textContent?.includes('Smith') || b.textContent?.includes('Doe') || b.textContent?.includes('Wonderland'));
      expect(personButtons[0]).toHaveTextContent('John Smith');
      expect(personButtons[1]).toHaveTextContent('Jane Doe');
      expect(personButtons[2]).toHaveTextContent('Alice Wonderland');
    });

    it('shows sort indicator on active column', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph });

      // Default sort is name asc, so Name header should have up arrow
      const nameHeader = screen.getByText(/Name.*\u25B2/);
      expect(nameHeader).toBeInTheDocument();
    });

    it('changes sort indicator to down arrow on desc', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph });

      const nameHeader = screen.getByText(/^Name/);
      fireEvent.click(nameHeader);

      // Now descending, should show down arrow
      expect(screen.getByText(/Name.*\u25BC/)).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('dispatches SELECT_PERSON when a person row is clicked', () => {
      const graph = createMockGraph([john, jane]);
      const { mockDispatch } = renderWithContext({ graph });

      // Click on John Smith's row
      const johnRow = screen.getByText('John Smith').closest('button')!;
      fireEvent.click(johnRow);

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SELECT_PERSON', personId: '@I1@' });
    });

    it('dispatches SELECT_PERSON with correct personId for different persons', () => {
      const graph = createMockGraph([john, jane]);
      const { mockDispatch } = renderWithContext({ graph });

      const janeRow = screen.getByText('Jane Doe').closest('button')!;
      fireEvent.click(janeRow);

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SELECT_PERSON', personId: '@I2@' });
    });

    it('highlights the selected person row', () => {
      const graph = createMockGraph([john, jane]);
      renderWithContext({ graph, selectedPersonId: '@I1@' });

      const johnRow = screen.getByText('John Smith').closest('button')!;
      // The selected row has a border-l-gold class
      expect(johnRow.className).toContain('border-l-gold');
    });
  });
});
