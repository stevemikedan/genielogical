import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useWorkspace } from './use-workspace.ts';
import { useTree } from './use-tree.ts';
import { TreeProvider } from '@/context/tree-context.tsx';
import { WorkspaceProvider } from '@/context/workspace-context.tsx';

// Mock the storage layer
vi.mock('@/storage/tree-repository.ts', () => ({
  listTrees: vi.fn().mockResolvedValue([]),
  createTree: vi.fn().mockImplementation(async (name: string) => ({
    id: 'tree-new',
    name,
    description: '',
    gedcomFileName: null,
    personCount: 0,
    edgeCount: 0,
    generationCount: 0,
    createdAt: new Date(),
    lastModifiedAt: new Date(),
    lastOpenedAt: new Date(),
  })),
  loadTreeGraph: vi.fn().mockResolvedValue({
    graph: { persons: new Map(), edges: new Map(), sources: new Map(), getGenerationDepth: () => 0 },
    flags: [],
  }),
  saveTreeGraph: vi.fn().mockResolvedValue(undefined),
  deleteTree: vi.fn().mockResolvedValue(undefined),
}));

import { createTree, deleteTree as deleteTreeFromDb, loadTreeGraph, saveTreeGraph } from '@/storage/tree-repository.ts';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <TreeProvider>
        {children}
      </TreeProvider>
    </WorkspaceProvider>
  );
}

interface TestApi {
  workspace: ReturnType<typeof useWorkspace>;
  treePhase: string;
  currentTreeId: string | null;
}

function TestHarness({ onReady }: { onReady: (api: TestApi) => void }) {
  const workspace = useWorkspace();
  const { state } = useTree();
  onReady({
    workspace,
    treePhase: state.phase,
    currentTreeId: state.currentTreeId,
  });
  return (
    <div>
      <span data-testid="phase">{state.phase}</span>
      <span data-testid="tree-count">{workspace.workspaceState.trees.length}</span>
      <span data-testid="loading">{String(workspace.workspaceState.isLoading)}</span>
    </div>
  );
}

function renderHarness() {
  const apiRef: { current: TestApi | null } = { current: null };
  const result = render(
    <Wrapper>
      <TestHarness onReady={(a) => { apiRef.current = a; }} />
    </Wrapper>,
  );
  if (!apiRef.current) throw new Error('TestHarness did not call onReady');
  return { ...result, api: apiRef.current };
}

describe('useWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new tree and dispatches to both contexts', async () => {
    const { api } = renderHarness();

    await act(async () => {
      await api.workspace.createNewTree('Test Tree');
    });

    expect(createTree).toHaveBeenCalledWith('Test Tree');
    expect(screen.getByTestId('phase')).toHaveTextContent('loaded');
  });

  it('removes a tree and calls deleteTree', async () => {
    const { api } = renderHarness();

    await act(async () => {
      await api.workspace.removeTree('tree-xyz');
    });

    expect(deleteTreeFromDb).toHaveBeenCalledWith('tree-xyz');
  });

  it('switchTree saves current tree then loads new one', async () => {
    const { api } = renderHarness();

    // First create a tree so there's something to save
    await act(async () => {
      await api.workspace.createNewTree('First');
    });

    // Now switch
    await act(async () => {
      await api.workspace.switchTree('tree-other');
    });

    expect(loadTreeGraph).toHaveBeenCalledWith('tree-other');
  });

  it('saveCurrentTree does nothing when no tree is loaded', async () => {
    const { api } = renderHarness();

    await act(async () => {
      await api.workspace.saveCurrentTree();
    });

    expect(saveTreeGraph).not.toHaveBeenCalled();
  });

  it('exposes workspaceState', () => {
    const { api } = renderHarness();
    expect(api.workspace.workspaceState).toBeDefined();
    expect(api.workspace.workspaceState.saveStatus).toBe('saved');
  });
});
