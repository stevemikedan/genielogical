import { useContext } from 'react';
import { TreeContext } from '@/context/tree-context.tsx';
import type { TreeContextValue } from '@/context/tree-context.tsx';

export function useTree(): TreeContextValue {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('useTree must be used within a TreeProvider');
  }
  return context;
}
