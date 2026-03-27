import { describe, it, expect } from 'vitest';
import { buildChatContext, formatContextForPrompt } from './chat-context.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

function makePerson(id: string, name: string, sex: 'M' | 'F' | 'U' = 'U'): Person {
  return {
    id,
    name: { prefix: '', given: name, middle: '', surname: '', suffix: '', full: name, maidenName: '', raw: name },
    alternateNames: [],
    sex,
    birth: { date: { raw: '1800', year: 1800, date: null, endDate: null, qualifier: 'exact' }, place: { raw: 'Scotland', country: 'Scotland', state: null, county: null, city: null, parts: ['Scotland'] } },
    death: { date: { raw: '1860', year: 1860, date: null, endDate: null, qualifier: 'exact' }, place: null },
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(id: string, parentId: string, childId: string): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 3,
    confidenceReason: 'Test',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    createdAt: new Date(),
  };
}

function buildGraph(persons: Person[], edges: Edge[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

describe('buildChatContext', () => {
  it('builds context with empty tree', () => {
    const graph = new TreeGraph();
    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.totalPeople).toBe(0);
    expect(context.treeSummary.overallHealthScore).toBe(100);
    expect(context.selectedPersonContext).toBeNull();
  });

  it('includes selected person context', () => {
    const persons = [
      makePerson('child', 'John Smith', 'M'),
      makePerson('father', 'James Smith', 'M'),
    ];
    const edges = [makeEdge('e1', 'father', 'child')];
    const graph = buildGraph(persons, edges);

    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: 'child',
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.selectedPersonContext).not.toBeNull();
    expect(context.selectedPersonContext!.name).toBe('John Smith');
    expect(context.selectedPersonContext!.parents.length).toBe(1);
    expect(context.selectedPersonContext!.parents[0].name).toBe('James Smith');
  });

  it('reports totalPeople correctly', () => {
    const persons = [
      makePerson('a', 'A'),
      makePerson('b', 'B'),
      makePerson('c', 'C'),
    ];
    const graph = buildGraph(persons, []);

    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.totalPeople).toBe(3);
  });

  it('computes health score with flags', () => {
    const persons = [
      makePerson('a', 'A'),
      makePerson('b', 'B'),
    ];
    const graph = buildGraph(persons, []);

    const context = buildChatContext({
      graph,
      flags: [{
        id: 'f1',
        ruleId: 'test',
        title: 'Test flag',
        description: 'Test',
        severity: 'critical',
        category: 'chronological',
        suggestedAction: '',
        affectedPersonIds: ['a'],
        affectedEdgeIds: [],
        userStatus: 'new',
        userNote: null,
        detectedAt: new Date(),
        resolvedAt: null,
      }],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.overallHealthScore).toBe(50);
  });
});

describe('formatContextForPrompt', () => {
  it('formats tree summary into text', () => {
    const context = buildChatContext({
      graph: buildGraph([makePerson('a', 'Alice')], []),
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    const text = formatContextForPrompt(context);
    expect(text).toContain('TREE:');
    expect(text).toContain('1 people');
    expect(text).toContain('SELECTED: None');
  });

  it('includes selected person in formatted text', () => {
    const graph = buildGraph([makePerson('a', 'Alice')], []);
    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: 'a',
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    const text = formatContextForPrompt(context);
    expect(text).toContain('SELECTED: Alice');
    expect(text).toContain('Tier: 3');
  });
});
