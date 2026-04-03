import { useState, useEffect, useCallback, useContext } from 'react';
import { useTree, usePersonDetail } from '@/hooks/index.ts';
import { IdentitySection } from './IdentitySection.tsx';
import { EventTimeline } from './EventTimeline.tsx';
import { FamilyConnectionsSection } from './FamilyConnectionsSection.tsx';
import { ParallelPathsSection } from './ParallelPathsSection.tsx';
import { StatusConfidenceSection } from './StatusConfidenceSection.tsx';
import { SourcesSection } from './SourcesSection.tsx';
import { FlagsSection } from './FlagsSection.tsx';
import { ConjectureSection } from './ConjectureSection.tsx';
import { ProofLadderSection } from './ProofLadderSection.tsx';
import { AIValidationSection } from './AIValidationSection.tsx';
import { AIEnrichSection } from './AIEnrichSection.tsx';
import { ConflictResolutionSection } from './ConflictResolutionSection.tsx';
import { ResearchStepsSection } from './ResearchStepsSection.tsx';
import { WorkspaceContext } from '@/context/workspace-context.tsx';
import { CrossTreeLinkModal } from '@/components/layout/CrossTreeLinkModal.tsx';
import { MergePersonsModal } from '@/components/layout/MergePersonsModal.tsx';
import { formatDisplayName } from '@/utils/name-display.ts';

export function PersonDetailPanel() {
  const { state, dispatch } = useTree();
  const detail = usePersonDetail(
    state.selectedPersonId,
    state.graph,
    state.flags,
    state.conjectures,
    state.storyPathResult?.notableAncestors,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCrossTreeLink, setShowCrossTreeLink] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const workspaceCtx = useContext(WorkspaceContext);
  const hasMultipleTrees = (workspaceCtx?.state.trees.length ?? 0) > 1;

  const handleClose = useCallback(() => {
    dispatch({ type: 'SELECT_PERSON', personId: null });
  }, [dispatch]);

  const handleNavigate = useCallback((personId: string) => {
    dispatch({ type: 'SELECT_PERSON', personId });
  }, [dispatch]);

  const handleProofChainNavigate = useCallback((personId: string) => {
    dispatch({ type: 'SELECT_PERSON', personId });
    dispatch({ type: 'EXPAND_TO_ANCESTOR', targetPersonId: personId });
  }, [dispatch]);

  const handleDeletePerson = useCallback(() => {
    if (!detail) return;
    dispatch({ type: 'REMOVE_PERSON', personId: detail.person.id });
  }, [detail, dispatch]);

  // Escape key closes panel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  // Reset delete confirmation when person changes
  useEffect(() => {
    setConfirmDelete(false);
  }, [state.selectedPersonId]);

  if (!detail) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-surface border-l border-border z-50
                   overflow-y-auto shadow-2xl
                   animate-[slideIn_300ms_ease-out]"
        style={{
          // @ts-expect-error CSS custom animation handled via inline keyframes
          '--tw-enter-translate-x': '100%',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-[family-name:var(--font-heading)] text-lg text-text-primary truncate pr-2">
            {formatDisplayName(detail.person.name)}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-dim hover:text-text-primary transition-colors text-xl leading-none p-1"
            aria-label="Close panel"
          >
            &times;
          </button>
        </div>

        {/* Duplicate suspect alert */}
        {(() => {
          const dupFlags = detail.flags.filter(f => f.category === 'duplicate_suspect');
          if (dupFlags.length === 0) return null;
          return dupFlags.map(flag => {
            const otherPersonId = flag.affectedPersonIds.find(id => id !== detail.person.id);
            if (!otherPersonId) return null;
            const otherPerson = state.graph?.persons.get(otherPersonId);
            const otherName = otherPerson?.name.full ?? otherPersonId;
            return (
              <div
                key={flag.id}
                className="mx-4 mt-3 px-3 py-2 bg-tier3-bg border border-tier3 rounded text-sm text-tier3 flex items-center justify-between gap-2"
              >
                <span>
                  Possible duplicate: <strong>{otherName}</strong> has similar name and dates.
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleNavigate(otherPersonId)}
                    className="px-2 py-0.5 text-xs font-medium bg-tier3/20 hover:bg-tier3/30 border border-tier3 rounded transition-colors"
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeTargetId(otherPersonId)}
                    className="px-2 py-0.5 text-xs font-medium bg-gold/20 hover:bg-gold/30 border border-gold text-gold rounded transition-colors"
                  >
                    Merge
                  </button>
                </div>
              </div>
            );
          });
        })()}

        {/* Sections */}
        <div className="px-4 py-4 space-y-6">
          <IdentitySection person={detail.person} dispatch={dispatch} />

          <StatusConfidenceSection
            person={detail.person}
            dispatch={dispatch}
          />

          <AIValidationSection personId={detail.person.id} />

          <ConflictResolutionSection personId={detail.person.id} onNavigate={handleNavigate} />

          <AIEnrichSection personId={detail.person.id} />

          <FamilyConnectionsSection
            person={detail.person}
            parents={detail.parents}
            children={detail.children}
            siblings={detail.siblings}
            spouses={detail.spouses}
            graph={state.graph!}
            onNavigate={handleNavigate}
          />

          {detail.parallelEdges.length > 0 && (
            <ParallelPathsSection
              parallelEdges={detail.parallelEdges}
              graph={state.graph!}
              dispatch={dispatch}
            />
          )}

          {detail.person.events.length > 0 && (
            <EventTimeline events={detail.person.events} />
          )}

          <SourcesSection
            sources={detail.sources}
            person={detail.person}
            parentEdges={detail.parentEdges}
            graph={state.graph!}
            dispatch={dispatch}
          />

          {detail.flags.length > 0 && (
            <FlagsSection
              flags={detail.flags}
              dispatch={dispatch}
            />
          )}

          <ProofLadderSection
            proofLadder={detail.proofLadder}
            onNavigate={handleProofChainNavigate}
          />

          <ResearchStepsSection personId={detail.person.id} />

          <ConjectureSection
            conjectures={detail.conjectures}
            personId={detail.person.id}
            dispatch={dispatch}
          />

          {/* Cross-tree link */}
          {hasMultipleTrees && state.currentTreeId && (
            <section className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowCrossTreeLink(true)}
                className="text-sm text-gold hover:text-gold-light transition-colors"
              >
                Find in other trees
              </button>
            </section>
          )}

          {/* Delete Person */}
          <section className="border-t border-border pt-4">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-tier4/70 hover:text-tier4 transition-colors"
              >
                Delete this person...
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-tier4">
                  Remove <strong>{detail.person.name.full}</strong> and all their edges? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDeletePerson}
                    className="px-3 py-1 rounded bg-tier4 text-bg text-xs font-medium
                               hover:bg-tier4-text transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1 rounded border border-border text-xs text-text-secondary
                               hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {showCrossTreeLink && state.currentTreeId && workspaceCtx && (
        <CrossTreeLinkModal
          person={detail.person}
          currentTreeId={state.currentTreeId}
          otherTrees={workspaceCtx.state.trees}
          onClose={() => setShowCrossTreeLink(false)}
          onLinked={() => setShowCrossTreeLink(false)}
        />
      )}

      {mergeTargetId && (
        <MergePersonsModal
          personIdA={detail.person.id}
          personIdB={mergeTargetId}
          onClose={() => setMergeTargetId(null)}
        />
      )}
    </>
  );
}
