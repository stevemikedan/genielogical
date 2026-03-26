/**
 * CrossTreeLinkModal — search other trees for matching persons, link with confidence rating.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Person } from '@/types/person.ts';
import type { TreeMetadata } from '@/types/tree.ts';
import type { CrossTreeLink } from '@/types/cross-tree-link.ts';
import { loadTreeGraph } from '@/storage/tree-repository.ts';
import { saveCrossTreeLink } from '@/storage/tree-repository.ts';
import { findMatchesForPerson } from '@/engine/cross-tree-matcher.ts';
import type { CrossTreeMatch } from '@/engine/cross-tree-matcher.ts';
import { generateCrossTreeLinkId } from '@/utils/id-generator.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

interface CrossTreeLinkModalProps {
  person: Person;
  currentTreeId: string;
  otherTrees: TreeMetadata[];
  onClose: () => void;
  onLinked: (link: CrossTreeLink) => void;
}

export function CrossTreeLinkModal({
  person,
  currentTreeId,
  otherTrees,
  onClose,
  onLinked,
}: CrossTreeLinkModalProps) {
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(
    otherTrees.length > 0 ? otherTrees[0].id : null,
  );
  const [otherGraph, setOtherGraph] = useState<TreeGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [matches, setMatches] = useState<CrossTreeMatch[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Load the selected tree
  useEffect(() => {
    if (!selectedTreeId) return;
    let cancelled = false;
    setIsLoading(true);

    loadTreeGraph(selectedTreeId).then(({ graph }) => {
      if (!cancelled) {
        setOtherGraph(graph);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedTreeId]);

  // Run matcher when graph loads
  useEffect(() => {
    if (!otherGraph) {
      setMatches([]);
      return;
    }
    const results = findMatchesForPerson(person, otherGraph);
    setMatches(results);
  }, [person, otherGraph]);

  const filteredTrees = useMemo(() =>
    otherTrees.filter(t => t.id !== currentTreeId),
    [otherTrees, currentTreeId],
  );

  const handleLink = useCallback(async (match: CrossTreeMatch, confidence: CrossTreeLink['confidence']) => {
    if (!selectedTreeId) return;
    setLinkingId(match.personB.id);

    const link: CrossTreeLink = {
      id: generateCrossTreeLinkId(),
      personIdA: person.id,
      treeIdA: currentTreeId,
      personIdB: match.personB.id,
      treeIdB: selectedTreeId,
      confidence,
      notes: match.reasons.join('; '),
      createdAt: new Date(),
    };

    await saveCrossTreeLink(link);
    onLinked(link);
    setLinkingId(null);
  }, [person.id, currentTreeId, selectedTreeId, onLinked]);

  const confidenceColor = {
    confirmed: 'text-tier1',
    probable: 'text-tier2',
    possible: 'text-tier3',
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
              Find in Other Trees
            </h3>
            <p className="text-sm text-text-dim mt-0.5">
              Looking for matches to {person.name.full}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="text-text-dim hover:text-text-primary text-xl leading-none p-1"
          >&times;</button>
        </div>

        {/* Tree selector */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <label className="block text-xs text-text-dim mb-1">Search in tree:</label>
          {filteredTrees.length === 0 ? (
            <p className="text-sm text-text-dim">No other trees available.</p>
          ) : (
            <select
              value={selectedTreeId ?? ''}
              onChange={e => setSelectedTreeId(e.target.value || null)}
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm text-text-primary
                         focus:outline-none focus:border-gold/50"
            >
              {filteredTrees.map(tree => (
                <option key={tree.id} value={tree.id}>
                  {tree.name} ({tree.personCount} people)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Matches */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="text-center py-8 text-text-dim">Loading tree...</div>
          )}

          {!isLoading && matches.length === 0 && otherGraph && (
            <div className="text-center py-8 text-text-dim">
              No matching persons found in this tree.
            </div>
          )}

          {!isLoading && matches.map(match => (
            <div key={match.personB.id}
              className="flex items-start justify-between py-3 border-b border-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-[family-name:var(--font-heading)] text-text-primary">
                  {match.personB.name.full}
                </div>
                <div className="text-xs text-text-dim font-[family-name:var(--font-mono)] mt-0.5">
                  {match.personB.birth.date?.year ?? '?'} - {match.personB.death.date?.year ?? '?'}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {match.reasons.map((reason, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-surface-hover text-text-secondary">
                      {reason}
                    </span>
                  ))}
                </div>
                <div className={`text-xs mt-1 ${confidenceColor[match.confidence]}`}>
                  Score: {Math.round(match.score * 100)}% ({match.confidence})
                </div>
              </div>

              <div className="flex flex-col gap-1 ml-3 shrink-0">
                {(['confirmed', 'probable', 'possible'] as const).map(conf => (
                  <button
                    key={conf}
                    type="button"
                    onClick={() => handleLink(match, conf)}
                    disabled={linkingId === match.personB.id}
                    className={`px-2 py-1 text-xs rounded border border-border
                               hover:bg-surface-hover transition-colors capitalize
                               ${linkingId === match.personB.id ? 'opacity-50' : ''}`}
                  >
                    Link as {conf}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
