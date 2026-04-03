import { describe, it, expect } from 'vitest';
import { buildSuggestedPrompts } from './suggested-prompts.ts';
import type { ChatContext } from './chat-context.ts';

const baseContext: ChatContext = {
  selectedPersonId: null,
  activeView: 'tree',
  treeSummary: {
    totalPeople: 100,
    totalGenerations: 5,
    subjectName: 'Steve Daniel',
    branchCount: 8,
    topNotableAncestors: [],
    topFlags: [],
    overallHealthScore: 80,
    generationalDistribution: [],
    deepestAncestors: [],
    tierDistribution: [],
  },
  selectedPersonContext: null,
};

describe('buildSuggestedPrompts', () => {
  it('returns tree-level prompts when no person selected', () => {
    const prompts = buildSuggestedPrompts(baseContext);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.length).toBeLessThanOrEqual(4);
    expect(prompts[0].text).toBe("What's interesting about my tree?");
  });

  it('includes critical issues prompt when flags exist', () => {
    const context = {
      ...baseContext,
      treeSummary: {
        ...baseContext.treeSummary,
        topFlags: [{ title: 'Date issue', severity: 'critical' }],
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.some(p => p.text.includes('critical issues'))).toBe(true);
  });

  it('includes notable ancestors prompt when notables exist', () => {
    const context = {
      ...baseContext,
      treeSummary: {
        ...baseContext.treeSummary,
        topNotableAncestors: [{ name: 'King Robert', category: 'royalty', gen: 12 }],
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.some(p => p.text.includes('notable ancestors'))).toBe(true);
  });

  it('returns person-specific prompts when person selected', () => {
    const context: ChatContext = {
      ...baseContext,
      selectedPersonId: 'p1',
      selectedPersonContext: {
        name: 'John Smith',
        dates: 'b. 1800, d. 1870',
        places: 'Edinburgh, Scotland',
        tier: 4,
        parents: [],
        children: [],
        flags: [{ title: 'Missing sources', severity: 'warning' }],
        sources: [],
        onNotablePaths: [],
        ancestorChainDepth: 0,
        deepestAncestorName: null,
      },
    };
    const prompts = buildSuggestedPrompts(context);
    // Should have person-specific prompts
    expect(prompts.some(p => p.text.includes('John Smith'))).toBe(true);
  });

  it('suggests finding records for unsourced person', () => {
    const context: ChatContext = {
      ...baseContext,
      selectedPersonId: 'p1',
      selectedPersonContext: {
        name: 'Mary Johnson',
        dates: 'dates unknown',
        places: 'places unknown',
        tier: 4,
        parents: [{ name: 'Father', tier: 3 }],
        children: [],
        flags: [],
        sources: [],
        onNotablePaths: [],
        ancestorChainDepth: 0,
        deepestAncestorName: null,
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.some(p => p.text.includes('Find records for Mary Johnson'))).toBe(true);
  });

  it('suggests parent research for person with no parents', () => {
    const context: ChatContext = {
      ...baseContext,
      selectedPersonId: 'p1',
      selectedPersonContext: {
        name: 'Alice Brown',
        dates: 'b. 1850',
        places: 'London',
        tier: 3,
        parents: [],
        children: [{ name: 'Bob' }],
        flags: [],
        sources: [{ title: 'Census', sourceClass: 'secondary' }],
        onNotablePaths: [],
        ancestorChainDepth: 0,
        deepestAncestorName: null,
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.some(p => p.text.includes("Alice Brown's parents"))).toBe(true);
  });

  it('suggests notable path inquiry when on notable paths', () => {
    const context: ChatContext = {
      ...baseContext,
      selectedPersonId: 'p1',
      selectedPersonContext: {
        name: 'James Stuart',
        dates: 'b. 1600',
        places: 'Scotland',
        tier: 2,
        parents: [{ name: 'Father', tier: 2 }],
        children: [{ name: 'Child' }],
        flags: [],
        sources: [{ title: 'Parish record', sourceClass: 'primary' }],
        onNotablePaths: ['King Robert the Bruce'],
        ancestorChainDepth: 0,
        deepestAncestorName: null,
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.some(p => p.text.includes('King Robert the Bruce'))).toBe(true);
  });

  it('limits to 4 prompts max', () => {
    const context: ChatContext = {
      ...baseContext,
      selectedPersonId: 'p1',
      selectedPersonContext: {
        name: 'Test Person',
        dates: 'unknown',
        places: 'unknown',
        tier: 4,
        parents: [],
        children: [],
        flags: [{ title: 'Issue', severity: 'critical' }],
        sources: [],
        onNotablePaths: ['Notable A', 'Notable B'],
        ancestorChainDepth: 0,
        deepestAncestorName: null,
      },
    };
    const prompts = buildSuggestedPrompts(context);
    expect(prompts.length).toBeLessThanOrEqual(4);
  });
});
