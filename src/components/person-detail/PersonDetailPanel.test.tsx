import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonDetailPanel } from './PersonDetailPanel.tsx';
import { makePerson, makeGraph } from '@/test/test-utils.ts';
import type { TreeState } from '@/context/tree-state.ts';

const mockDispatch = vi.fn();

const testPerson = makePerson({
  id: 'p1',
  name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
});

const testGraph = makeGraph([testPerson]);

const mockState: Partial<TreeState> = {
  selectedPersonId: 'p1',
  graph: testGraph,
  flags: [],
  conjectures: new Map(),
  ancestryConflicts: [],
  currentTreeId: null,
};

vi.mock('@/hooks/index.ts', () => ({
  useTree: () => ({ state: mockState, dispatch: mockDispatch }),
  usePersonDetail: () => ({
    person: testPerson,
    parents: [],
    children: [],
    siblings: [],
    spouses: [],
    parentEdges: [],
    parallelEdges: [],
    sources: [],
    flags: [],
    conjectures: [],
    proofLadder: { links: [], weakestTier: 4, weakestPersonId: null, bridgeZones: [] },
  }),
}));

// Mock sub-components that have their own complex deps
vi.mock('./AIValidationSection.tsx', () => ({
  AIValidationSection: () => <div data-testid="ai-validation">AI Validation</div>,
}));
vi.mock('./AIEnrichSection.tsx', () => ({
  AIEnrichSection: () => <div data-testid="ai-enrich">AI Enrich</div>,
}));
vi.mock('./ConflictResolutionSection.tsx', () => ({
  ConflictResolutionSection: () => null,
}));
vi.mock('./ResearchStepsSection.tsx', () => ({
  ResearchStepsSection: () => null,
}));
vi.mock('@/context/workspace-context.tsx', () => ({
  WorkspaceContext: { _currentValue: null },
}));
vi.mock('@/components/layout/CrossTreeLinkModal.tsx', () => ({
  CrossTreeLinkModal: () => null,
}));
vi.mock('@/utils/name-display.ts', () => ({
  formatDisplayName: (name: { full: string }) => name.full,
}));

describe('PersonDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selectedPersonId = 'p1';
  });

  it('renders person name in header', () => {
    render(<PersonDetailPanel />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('has close button with aria-label', () => {
    render(<PersonDetailPanel />);
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument();
  });

  it('dispatches SELECT_PERSON null on close button click', () => {
    render(<PersonDetailPanel />);
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SELECT_PERSON', personId: null });
  });

  it('dispatches SELECT_PERSON null on Escape key', () => {
    render(<PersonDetailPanel />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SELECT_PERSON', personId: null });
  });

  it('dispatches SELECT_PERSON null on backdrop click', () => {
    render(<PersonDetailPanel />);
    // The backdrop is the first fixed div with bg-black/40
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SELECT_PERSON', personId: null });
  });

  it('shows "Delete this person..." button', () => {
    render(<PersonDetailPanel />);
    expect(screen.getByText('Delete this person...')).toBeInTheDocument();
  });

  it('shows confirmation on delete click', () => {
    render(<PersonDetailPanel />);
    fireEvent.click(screen.getByText('Delete this person...'));
    // Text is split across elements: "Remove " + <strong>"John Smith"</strong> + " and all their edges..."
    expect(screen.getByText((_content, element) =>
      element?.tagName === 'P' &&
      element?.textContent?.includes('Remove') === true &&
      element?.textContent?.includes('John Smith') === true &&
      element?.textContent?.includes('all their edges') === true,
    )).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('dispatches REMOVE_PERSON on confirm delete', () => {
    render(<PersonDetailPanel />);
    fireEvent.click(screen.getByText('Delete this person...'));
    fireEvent.click(screen.getByText('Delete'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'REMOVE_PERSON', personId: 'p1' });
  });

  it('cancels delete confirmation', () => {
    render(<PersonDetailPanel />);
    fireEvent.click(screen.getByText('Delete this person...'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Delete this person...')).toBeInTheDocument();
  });

  it('renders AI validation section', () => {
    render(<PersonDetailPanel />);
    expect(screen.getByTestId('ai-validation')).toBeInTheDocument();
  });

  it('renders AI enrich section', () => {
    render(<PersonDetailPanel />);
    expect(screen.getByTestId('ai-enrich')).toBeInTheDocument();
  });
});
