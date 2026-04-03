import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeSelector } from './TreeSelector.tsx';
import type { TreeMetadata } from '@/types/tree.ts';

const mockTrees: TreeMetadata[] = [
  { id: 'tree-1', name: 'Smith Family', personCount: 100, edgeCount: 90, generationCount: 5, description: '', gedcomFileName: null, createdAt: new Date('2025-01-01'), lastModifiedAt: new Date('2025-06-01'), lastOpenedAt: new Date('2025-06-01') },
  { id: 'tree-2', name: 'Jones Family', personCount: 50, edgeCount: 40, generationCount: 3, description: '', gedcomFileName: null, createdAt: new Date('2025-02-01'), lastModifiedAt: new Date('2025-05-01'), lastOpenedAt: new Date('2025-05-01') },
];

const mockWorkspaceState: { trees: TreeMetadata[]; currentTreeId: string; saveStatus: string; loading: boolean } = {
  trees: mockTrees,
  currentTreeId: 'tree-1',
  saveStatus: 'saved',
  loading: false,
};

const mockSwitchTree = vi.fn();
const mockCreateNewTree = vi.fn();
const mockRemoveTree = vi.fn();

vi.mock('@/hooks/use-workspace.ts', () => ({
  useWorkspace: () => ({
    workspaceState: mockWorkspaceState,
    switchTree: mockSwitchTree,
    createNewTree: mockCreateNewTree,
    removeTree: mockRemoveTree,
  }),
}));

describe('TreeSelector', () => {
  const onImportFile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceState.trees = [...mockTrees];
    mockWorkspaceState.currentTreeId = 'tree-1';
    mockWorkspaceState.saveStatus = 'saved';
  });

  it('shows current tree name', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    expect(screen.getByText('Smith Family')).toBeInTheDocument();
  });

  it('shows "No tree" when no current tree', () => {
    mockWorkspaceState.currentTreeId = 'nonexistent';
    render(<TreeSelector onImportFile={onImportFile} />);
    expect(screen.getByText('No tree')).toBeInTheDocument();
  });

  it('shows save status indicator', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows saving status', () => {
    mockWorkspaceState.saveStatus = 'saving';
    render(<TreeSelector onImportFile={onImportFile} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    fireEvent.click(screen.getByText('Smith Family'));
    expect(screen.getByText('Jones Family')).toBeInTheDocument();
  });

  it('shows tree list with person counts', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    fireEvent.click(screen.getByText('Smith Family'));
    expect(screen.getByText(/100 people/)).toBeInTheDocument();
    expect(screen.getByText(/50 people/)).toBeInTheDocument();
  });

  it('shows "New Tree" and "Import GEDCOM" buttons', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    fireEvent.click(screen.getByText('Smith Family'));
    expect(screen.getByText('+ New Tree')).toBeInTheDocument();
    expect(screen.getByText('Import GEDCOM')).toBeInTheDocument();
  });

  it('shows "No saved trees yet" when trees empty', () => {
    mockWorkspaceState.trees = [];
    render(<TreeSelector onImportFile={onImportFile} />);
    fireEvent.click(screen.getByText('No tree'));
    expect(screen.getByText('No saved trees yet.')).toBeInTheDocument();
  });

  it('shows new tree form when "+ New Tree" clicked', () => {
    render(<TreeSelector onImportFile={onImportFile} />);
    fireEvent.click(screen.getByText('Smith Family'));
    fireEvent.click(screen.getByText('+ New Tree'));
    expect(screen.getByPlaceholderText('Tree name...')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });
});
