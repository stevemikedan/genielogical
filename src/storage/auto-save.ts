/**
 * Auto-save hook — debounces tree graph writes to IndexedDB.
 *
 * Triggers 2 seconds after the last mutation. Reports save status
 * via callback so the UI can show indicators.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Flag } from '@/types/flag.ts';
import { saveTreeGraph } from './tree-repository.ts';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const DEBOUNCE_MS = 2000;

export function useAutoSave(
  treeId: string | null,
  graph: TreeGraph | null,
  flags: Flag[],
  onStatusChange?: (status: SaveStatus) => void,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  // Use a revision counter to detect when graph/flags have changed
  const revisionRef = useRef(0);
  const lastSavedRevisionRef = useRef(0);

  const save = useCallback(async () => {
    if (!treeId || !graph || isSavingRef.current) return;

    const currentRevision = revisionRef.current;
    if (currentRevision === lastSavedRevisionRef.current) return;

    isSavingRef.current = true;
    onStatusChange?.('saving');

    try {
      await saveTreeGraph(treeId, graph, flags);
      lastSavedRevisionRef.current = currentRevision;
      onStatusChange?.('saved');
    } catch {
      onStatusChange?.('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [treeId, graph, flags, onStatusChange]);

  // Debounce: schedule save after mutation
  useEffect(() => {
    if (!treeId || !graph) return;

    revisionRef.current += 1;
    onStatusChange?.('unsaved');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      save();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [treeId, graph, flags, save, onStatusChange]);

  // Save on unmount if unsaved
  useEffect(() => {
    return () => {
      if (revisionRef.current !== lastSavedRevisionRef.current && treeId && graph) {
        // Fire-and-forget save on unmount
        saveTreeGraph(treeId, graph, flags).catch(() => {
          // Silently fail on unmount save
        });
      }
    };
  // Intentionally omitting deps — runs only on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
