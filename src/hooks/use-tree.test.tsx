import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTree } from './use-tree.ts';
import { TreeProvider } from '@/context/tree-context.tsx';

/**
 * Test component that calls useTree() and renders its state.
 * Used to verify context is accessible from within TreeProvider.
 */
function TestConsumer() {
  const { state, dispatch } = useTree();
  return (
    <div>
      <span data-testid="phase">{state.phase}</span>
      <span data-testid="has-dispatch">{typeof dispatch === 'function' ? 'yes' : 'no'}</span>
    </div>
  );
}

/**
 * Test component that calls useTree() outside of a TreeProvider.
 * React will throw during render.
 */
function TestConsumerOutsideProvider() {
  const { state } = useTree();
  return <span>{state.phase}</span>;
}

describe('useTree', () => {
  it('throws a descriptive error when used outside TreeProvider', () => {
    // Suppress React error boundary console noise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumerOutsideProvider />);
    }).toThrow('useTree must be used within a TreeProvider');

    consoleSpy.mockRestore();
  });

  it('returns context value (state + dispatch) when used inside TreeProvider', () => {
    render(
      <TreeProvider>
        <TestConsumer />
      </TreeProvider>,
    );

    expect(screen.getByTestId('phase')).toHaveTextContent('empty');
    expect(screen.getByTestId('has-dispatch')).toHaveTextContent('yes');
  });

  it('provides the initial state with all expected fields', () => {
    function DetailedConsumer() {
      const { state } = useTree();
      return (
        <div>
          <span data-testid="phase">{state.phase}</span>
          <span data-testid="graph">{String(state.graph)}</span>
          <span data-testid="stats">{String(state.stats)}</span>
          <span data-testid="selectedPersonId">{String(state.selectedPersonId)}</span>
          <span data-testid="searchQuery">{state.searchQuery}</span>
          <span data-testid="error">{String(state.error)}</span>
        </div>
      );
    }

    render(
      <TreeProvider>
        <DetailedConsumer />
      </TreeProvider>,
    );

    expect(screen.getByTestId('phase')).toHaveTextContent('empty');
    expect(screen.getByTestId('graph')).toHaveTextContent('null');
    expect(screen.getByTestId('stats')).toHaveTextContent('null');
    expect(screen.getByTestId('selectedPersonId')).toHaveTextContent('null');
    expect(screen.getByTestId('searchQuery')).toHaveTextContent('');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });
});
