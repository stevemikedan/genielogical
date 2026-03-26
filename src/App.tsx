import { useState, useCallback } from 'react';
import { TreeProvider, WorkspaceProvider } from '@/context/index.ts';
import { useTree } from '@/hooks/index.ts';
import { FileDropZone } from '@/components/shared/FileDropZone.tsx';
import { ParseProgress } from '@/components/shared/ParseProgress.tsx';
import { ParseSummary } from '@/components/layout/ParseSummary.tsx';
import { PersonList } from '@/components/layout/PersonList.tsx';
import { HealthDashboard } from '@/components/health-dashboard/index.ts';
import { TreeNavigator } from '@/components/tree/index.ts';
import { PersonDetailPanel } from '@/components/person-detail/index.ts';
import { DeepScanView } from '@/components/research/index.ts';
import { usePhaseEEngines } from '@/hooks/index.ts';
import { AIStatusIndicator } from '@/components/shared/AIStatusIndicator.tsx';
import { AddPersonModal } from '@/components/shared/AddPersonModal.tsx';
import { AddEdgeModal } from '@/components/shared/AddEdgeModal.tsx';
import { TreeSelector } from '@/components/layout/TreeSelector.tsx';
import { useWorkspace } from '@/hooks/use-workspace.ts';
import { useAutoSave } from '@/storage/auto-save.ts';

type LoadedTab = 'tree' | 'health' | 'people' | 'deepScan';

function AppContent() {
  const { state, dispatch } = useTree();
  const { workspaceState, importIntoNewTree, createNewTree } = useWorkspace();
  const [activeTab, setActiveTab] = useState<LoadedTab>('tree');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);

  // Re-run Phase E engines when root person changes
  usePhaseEEngines(state.selectedPersonId, state.graph, dispatch);

  // Auto-save current tree to IndexedDB
  useAutoSave(state.currentTreeId, state.graph, state.flags);

  const handleSelectPerson = (personId: string) => {
    dispatch({ type: 'SELECT_PERSON', personId });
    setActiveTab('tree');
  };

  const handleStartFromScratch = useCallback(async () => {
    await createNewTree('Untitled Tree');
    setShowAddPerson(true);
  }, [createNewTree]);

  const handleImportFile = useCallback(async (file: File, name: string) => {
    await importIntoNewTree(file, name);
  }, [importIntoNewTree]);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-brand)] text-2xl text-gold">
            GenieLogical
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            The genealogy app that helps you trust your tree.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {(state.phase === 'loaded' || workspaceState.trees.length > 0) && (
            <TreeSelector onImportFile={handleImportFile} />
          )}
          {state.phase === 'loaded' && (
            <>
              <nav className="flex gap-1 rounded-lg border border-border overflow-hidden">
                {([
                  { key: 'tree' as const, label: 'Tree' },
                  { key: 'deepScan' as const, label: 'Deep Scan' },
                  { key: 'health' as const, label: 'Health' },
                  { key: 'people' as const, label: 'People' },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-1.5 text-sm transition-colors ${
                      activeTab === tab.key
                        ? 'bg-gold text-bg font-medium'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tab.label}
                    {tab.key === 'health' && state.flags.length > 0 && (
                      <span className="ml-1.5 text-xs opacity-75">({state.flags.length})</span>
                    )}
                  </button>
                ))}
              </nav>
              <button
                type="button"
                onClick={() => setShowAddPerson(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-gold
                           hover:bg-gold/10 transition-colors"
                title="Add person"
              >
                <span className="text-lg leading-none">+</span>
                <span className="hidden sm:inline">Add Person</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddEdge(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-text-secondary
                           hover:bg-surface hover:text-text-primary transition-colors"
                title="Connect persons"
              >
                <span className="text-lg leading-none">&#x2194;</span>
                <span className="hidden sm:inline">Connect</span>
              </button>
            </>
          )}
          <AIStatusIndicator />
          {state.phase === 'loaded' && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
              className="text-sm text-text-dim hover:text-text-secondary transition-colors"
            >
              Load another file
            </button>
          )}
        </div>
      </header>

      <main className="px-6 py-8">
        {state.phase === 'empty' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
            <FileDropZone />
            <div className="text-center">
              <span className="text-text-dim text-sm">or</span>
            </div>
            <button
              type="button"
              onClick={handleStartFromScratch}
              className="px-6 py-3 rounded-lg border border-gold/40 text-gold
                         hover:bg-gold/10 transition-colors text-sm font-medium"
            >
              Start from scratch
            </button>
          </div>
        )}

        {state.phase === 'parsing' && (
          <div className="flex items-center justify-center min-h-[70vh]">
            <ParseProgress />
          </div>
        )}

        {state.phase === 'loaded' && state.graph && state.stats && (
          <>
            {activeTab === 'tree' && (
              <TreeNavigator
                graph={state.graph}
                selectedPersonId={state.selectedPersonId}
                onSelectPerson={handleSelectPerson}
                expandToAncestor={state.expandToAncestor}
                onClearExpandTarget={() => dispatch({ type: 'EXPAND_TO_ANCESTOR', targetPersonId: null })}
              />
            )}

            {activeTab === 'deepScan' && state.deepScanResult && (
              <div className="max-w-6xl mx-auto">
                <DeepScanView
                  deepScan={state.deepScanResult}
                  storyPaths={state.storyPathResult}
                  priorities={state.researchPriorities}
                  onSelectPerson={handleSelectPerson}
                />
              </div>
            )}

            {activeTab === 'deepScan' && !state.deepScanResult && (
              <div className="max-w-6xl mx-auto text-center py-12 text-text-dim">
                <p className="text-lg mb-2">No deep scan available</p>
                <p className="text-sm">Select a person in the tree to run a deep scan of their ancestry.</p>
              </div>
            )}

            {activeTab === 'health' && (
              <div className="max-w-6xl mx-auto space-y-8">
                <ParseSummary stats={state.stats} />
                <HealthDashboard
                  graph={state.graph}
                  flags={state.flags}
                  onSelectPerson={handleSelectPerson}
                />
              </div>
            )}

            {activeTab === 'people' && (
              <div className="max-w-6xl mx-auto space-y-8">
                <PersonList />
              </div>
            )}
          </>
        )}

        {state.phase === 'error' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
            <div className="text-tier4 text-lg">Parse Error</div>
            <p className="text-text-secondary max-w-md text-center">{state.error}</p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
              className="text-sm text-gold hover:text-gold-light transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </main>

      {state.phase === 'loaded' && state.selectedPersonId && (
        <PersonDetailPanel />
      )}

      {showAddPerson && state.graph && (
        <AddPersonModal
          onClose={() => setShowAddPerson(false)}
          onCreated={(personId) => {
            setShowAddPerson(false);
            dispatch({ type: 'SELECT_PERSON', personId });
          }}
        />
      )}

      {showAddEdge && state.graph && (
        <AddEdgeModal
          graph={state.graph}
          onClose={() => setShowAddEdge(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <TreeProvider>
        <AppContent />
      </TreeProvider>
    </WorkspaceProvider>
  );
}

export default App
