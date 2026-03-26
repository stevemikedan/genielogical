/**
 * WorkspaceContext — wraps TreeProvider. Loads tree list from IDB on mount.
 */

import { createContext, useReducer, useMemo, useEffect, type ReactNode } from 'react';
import type { WorkspaceState, WorkspaceAction } from './workspace-state.ts';
import { workspaceReducer, initialWorkspaceState } from './workspace-state.ts';
import { listTrees } from '@/storage/tree-repository.ts';

export interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);

  // Load tree list from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    listTrees().then(trees => {
      if (!cancelled) {
        dispatch({ type: 'SET_TREES', trees });
      }
    }).catch(() => {
      // IndexedDB unavailable — continue without persistence
    });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ state, dispatch }),
    [state],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
