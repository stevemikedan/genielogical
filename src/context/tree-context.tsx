import { createContext, useReducer, useMemo, type ReactNode } from 'react';
import type { TreeState, TreeAction } from './tree-state.ts';
import { treeReducer, initialTreeState } from './tree-state.ts';

export interface TreeContextValue {
  state: TreeState;
  dispatch: React.Dispatch<TreeAction>;
}

export const TreeContext = createContext<TreeContextValue | null>(null);

export function TreeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(treeReducer, initialTreeState);

  const value = useMemo<TreeContextValue>(
    () => ({ state, dispatch }),
    [state],
  );

  return <TreeContext value={value}>{children}</TreeContext>;
}
