import { describe, it, expect } from 'vitest';
import { extractActionsFromResponse } from './action-parser.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { ChatContext } from './chat-context.ts';

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: { prefix: '', given: name, middle: '', surname: '', suffix: '', full: name, maidenName: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: 'Test',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeGraph(persons: Person[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  return graph;
}

const baseContext: ChatContext = {
  selectedPersonId: null,
  activeView: 'tree',
  treeSummary: {
    totalPeople: 0,
    totalGenerations: 0,
    subjectName: 'Test',
    branchCount: 0,
    topNotableAncestors: [],
    topFlags: [],
    overallHealthScore: 100,
    generationalDistribution: [],
    deepestAncestors: [],
    tierDistribution: [],
  },
  selectedPersonContext: null,
};

describe('extractActionsFromResponse', () => {
  it('returns empty array for plain text', () => {
    const actions = extractActionsFromResponse('Just a plain response.', baseContext, null);
    expect(actions).toHaveLength(0);
  });

  it('detects source import from structured description', () => {
    const response = `I've parsed that:

**Title**: Marriage of John Smith and Jane Doe
**Type**: Vital record
**Class**: Primary
**Date**: 15 Mar 1842
**Place**: Edinburgh, Scotland
**Repository**: ScotlandsPeople
**Proves**: Marriage`;

    const actions = extractActionsFromResponse(response, baseContext, null);
    const importAction = actions.find(a => a.type === 'import_source');
    expect(importAction).toBeDefined();
    expect(importAction!.data.title).toBe('Marriage of John Smith and Jane Doe');
    expect(importAction!.data.sourceClass).toBe('primary');
    expect(importAction!.data.repository).toBe('ScotlandsPeople');
  });

  it('detects source import from table format', () => {
    const response = `| Field | Value |
|---|---|
| **Title** | Census record 1850 |
| **Type** | Census |
| **Class** | Secondary |`;

    const actions = extractActionsFromResponse(response, baseContext, null);
    const importAction = actions.find(a => a.type === 'import_source');
    expect(importAction).toBeDefined();
    expect(importAction!.data.title).toBe('Census record 1850');
  });

  it('detects bold person mentions matching tree data', () => {
    const graph = makeGraph([
      makePerson('p1', 'John Smith'),
      makePerson('p2', 'Mary Johnson'),
    ]);

    const response = 'Your ancestor **John Smith** was born in 1800.';
    const actions = extractActionsFromResponse(response, baseContext, graph);
    const openAction = actions.find(a => a.type === 'open_person');
    expect(openAction).toBeDefined();
    expect(openAction!.data.personId).toBe('p1');
  });

  it('does not create open_person for selected person', () => {
    const graph = makeGraph([makePerson('p1', 'John Smith')]);
    const context = { ...baseContext, selectedPersonId: 'p1' };

    const response = 'Looking at **John Smith**...';
    const actions = extractActionsFromResponse(response, context, graph);
    const openAction = actions.find(a => a.type === 'open_person');
    expect(openAction).toBeUndefined();
  });

  it('detects duplicate analysis language', () => {
    const response = 'These are almost certainly the same person — identical name, birth year, and birthplace.';
    const actions = extractActionsFromResponse(response, baseContext, null);
    expect(actions.some(a => a.type === 'mark_duplicate')).toBe(true);
  });

  it('detects research recommendations', () => {
    const response = 'As a next step, you should search the Orkney Archives for pre-1733 baptism records.';
    const actions = extractActionsFromResponse(response, baseContext, null);
    expect(actions.some(a => a.type === 'add_research_step')).toBe(true);
  });

  it('limits person mentions to 3', () => {
    const graph = makeGraph([
      makePerson('p1', 'Alice'),
      makePerson('p2', 'Bob'),
      makePerson('p3', 'Charlie'),
      makePerson('p4', 'Diana'),
      makePerson('p5', 'Eve'),
    ]);

    const response = '**Alice**, **Bob**, **Charlie**, **Diana**, **Eve** are all in your tree.';
    const actions = extractActionsFromResponse(response, baseContext, graph);
    const openActions = actions.filter(a => a.type === 'open_person');
    expect(openActions.length).toBeLessThanOrEqual(3);
  });

  it('normalizes source class to valid values', () => {
    const response = `**Title**: Some Record
**Type**: Church register
**Class**: Primary source document`;

    const actions = extractActionsFromResponse(response, baseContext, null);
    const importAction = actions.find(a => a.type === 'import_source');
    expect(importAction).toBeDefined();
    expect(importAction!.data.sourceClass).toBe('primary');
  });

  // ── Flag detection ────────────────────────────────────────────────

  it('detects flag suggestion from chronological impossibility', () => {
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = 'The dates don\'t add up — a birth year of 1500 is chronological impossibility for this lineage.';
    const actions = extractActionsFromResponse(response, context, null);
    const flagAction = actions.find(a => a.type === 'create_flag');
    expect(flagAction).toBeDefined();
    expect(flagAction!.data.personId).toBe('p1');
    expect(flagAction!.data.severity).toBe('critical');
    expect(flagAction!.data.category).toBe('chronological');
  });

  it('detects flag suggestion for no evidence', () => {
    const context = { ...baseContext, selectedPersonId: 'p2' };
    const response = 'There is no evidence or documentation to support this claim.';
    const actions = extractActionsFromResponse(response, context, null);
    expect(actions.some(a => a.type === 'create_flag')).toBe(true);
  });

  it('does not create flag without selected person', () => {
    const response = 'This data is wrong and should be flagged.';
    const actions = extractActionsFromResponse(response, baseContext, null);
    expect(actions.some(a => a.type === 'create_flag')).toBe(false);
  });

  // ── Conjecture detection ──────────────────────────────────────────

  it('detects conjecture from hypothesis language', () => {
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = 'My best guess is that these two families are connected through a marriage in the 1750s.';
    const actions = extractActionsFromResponse(response, context, null);
    const conjAction = actions.find(a => a.type === 'create_conjecture');
    expect(conjAction).toBeDefined();
    expect(conjAction!.data.personId).toBe('p1');
    expect(conjAction!.data.hypothesis).toContain('best guess');
  });

  it('detects conjecture from speculation language', () => {
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = 'This is speculative, but the name similarity suggests a connection.';
    const actions = extractActionsFromResponse(response, context, null);
    expect(actions.some(a => a.type === 'create_conjecture')).toBe(true);
  });

  it('does not create conjecture without selected person', () => {
    const response = 'One hypothesis is that they migrated from Scotland.';
    const actions = extractActionsFromResponse(response, baseContext, null);
    expect(actions.some(a => a.type === 'create_conjecture')).toBe(false);
  });

  // ── Deep research detection ───────────────────────────────────────

  it('detects deep research suggestion', () => {
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = 'This connection needs deep research across multiple archives.';
    const actions = extractActionsFromResponse(response, context, null);
    expect(actions.some(a => a.type === 'run_deep_research')).toBe(true);
  });

  it('detects deep dive suggestion', () => {
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = 'A deep dive into Scottish records would be valuable.';
    const actions = extractActionsFromResponse(response, context, null);
    expect(actions.some(a => a.type === 'run_deep_research')).toBe(true);
  });

  // ── Enhanced duplicate detection ──────────────────────────────────

  it('extracts person IDs from duplicate analysis', () => {
    const graph = makeGraph([
      makePerson('p1', 'John Smith'),
      makePerson('p2', 'John Smyth'),
    ]);
    const context = { ...baseContext, selectedPersonId: 'p1' };
    const response = '**John Smith** and **John Smyth** are almost certainly the same person.';
    const actions = extractActionsFromResponse(response, context, graph);
    const dupAction = actions.find(a => a.type === 'mark_duplicate');
    expect(dupAction).toBeDefined();
    const personIds = dupAction!.data.personIds as string[];
    expect(personIds).toContain('p1');
    expect(personIds).toContain('p2');
  });
});
