import { describe, it, expect, beforeEach } from 'vitest';
import { treeReducer, initialTreeState } from './tree-state.ts';
import type { TreeState } from './tree-state.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

function makePerson(id: string, name: string = 'Test Person'): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ')[1] ?? '', maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test',
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
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'test',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    createdAt: new Date(),
  };
}

function loadedState(): TreeState {
  const graph = new TreeGraph();
  return {
    ...initialTreeState,
    phase: 'loaded',
    graph,
    stats: {
      individualCount: 0,
      familyCount: 0,
      sourceCount: 0,
      edgeCount: 0,
      generationCount: 0,
      parseTimeMs: 0,
      gedcomVersion: null,
      charset: null,
      software: null,
      warningCount: 0,
      errorCount: 0,
    },
  };
}

describe('tree-state mutation actions', () => {
  let state: TreeState;

  beforeEach(() => {
    state = loadedState();
  });

  describe('INIT_EMPTY_TREE', () => {
    it('creates empty graph and sets phase to loaded', () => {
      const result = treeReducer(initialTreeState, { type: 'INIT_EMPTY_TREE' });
      expect(result.phase).toBe('loaded');
      expect(result.graph).toBeInstanceOf(TreeGraph);
      expect(result.graph!.persons.size).toBe(0);
      expect(result.stats).not.toBeNull();
    });
  });

  describe('ADD_PERSON', () => {
    it('adds a person to the graph', () => {
      const person = makePerson('p1', 'John Smith');
      const result = treeReducer(state, { type: 'ADD_PERSON', person });
      expect(result.graph!.persons.size).toBe(1);
      expect(result.graph!.getPersonById('p1')?.name.full).toBe('John Smith');
    });

    it('returns same state if no graph', () => {
      const noGraphState = { ...initialTreeState };
      const result = treeReducer(noGraphState, { type: 'ADD_PERSON', person: makePerson('p1') });
      expect(result).toBe(noGraphState);
    });
  });

  describe('UPDATE_PERSON', () => {
    it('updates person fields', () => {
      state.graph!.addPerson(makePerson('p1', 'John Smith'));
      const result = treeReducer(state, {
        type: 'UPDATE_PERSON',
        personId: 'p1',
        updates: {
          name: { full: 'Jane Smith', given: 'Jane', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Jane Smith' },
          sex: 'F',
        },
      });
      expect(result.graph!.getPersonById('p1')?.name.full).toBe('Jane Smith');
      expect(result.graph!.getPersonById('p1')?.sex).toBe('F');
    });
  });

  describe('REMOVE_PERSON', () => {
    it('removes person and cascades edges', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));

      const result = treeReducer(state, { type: 'REMOVE_PERSON', personId: 'child' });
      expect(result.graph!.persons.size).toBe(1);
      expect(result.graph!.edges.size).toBe(0);
    });

    it('clears selection if removed person was selected', () => {
      state.graph!.addPerson(makePerson('p1'));
      state.selectedPersonId = 'p1';

      const result = treeReducer(state, { type: 'REMOVE_PERSON', personId: 'p1' });
      expect(result.selectedPersonId).toBeNull();
    });

    it('does not clear selection of different person', () => {
      state.graph!.addPerson(makePerson('p1'));
      state.graph!.addPerson(makePerson('p2'));
      state.selectedPersonId = 'p2';

      const result = treeReducer(state, { type: 'REMOVE_PERSON', personId: 'p1' });
      expect(result.selectedPersonId).toBe('p2');
    });

    it('removes flags referencing the deleted person', () => {
      state.graph!.addPerson(makePerson('p1'));
      state.flags = [{
        id: 'f1',
        category: 'chronological',
        severity: 'warning',
        title: 'Test',
        description: 'test',
        suggestedAction: 'test',
        ruleId: 'test',
        affectedPersonIds: ['p1'],
        affectedEdgeIds: [],
        userStatus: 'new',
        userNote: null,
        detectedAt: new Date(),
        resolvedAt: null,
      }];

      const result = treeReducer(state, { type: 'REMOVE_PERSON', personId: 'p1' });
      expect(result.flags).toHaveLength(0);
    });
  });

  describe('ADD_EDGE', () => {
    it('adds an edge to the graph', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));

      const result = treeReducer(state, {
        type: 'ADD_EDGE',
        edge: makeEdge('e1', 'parent', 'child'),
      });

      expect(result.graph!.edges.size).toBe(1);
      expect(result.graph!.getParents('child')).toHaveLength(1);
    });
  });

  describe('REMOVE_EDGE', () => {
    it('removes an edge from the graph', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));

      const result = treeReducer(state, { type: 'REMOVE_EDGE', edgeId: 'e1' });
      expect(result.graph!.edges.size).toBe(0);
    });

    it('removes flags referencing the deleted edge', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));
      state.flags = [{
        id: 'f1',
        category: 'structural',
        severity: 'info',
        title: 'Test',
        description: 'test',
        suggestedAction: 'test',
        ruleId: 'test',
        affectedPersonIds: [],
        affectedEdgeIds: ['e1'],
        userStatus: 'new',
        userNote: null,
        detectedAt: new Date(),
        resolvedAt: null,
      }];

      const result = treeReducer(state, { type: 'REMOVE_EDGE', edgeId: 'e1' });
      expect(result.flags).toHaveLength(0);
    });
  });

  describe('MERGE_PERSONS', () => {
    it('merges sources from removed person to kept person', () => {
      const p1 = makePerson('keep', 'John Smith');
      p1.sourceIds = ['s1'];
      const p2 = makePerson('remove', 'Jon Smith');
      p2.sourceIds = ['s2'];

      state.graph!.addPerson(p1);
      state.graph!.addPerson(p2);
      state.graph!.sources.set('s1', {
        id: 's1', origin: 'user_added', sourceClass: 'primary', sourceType: 'vital_record',
        title: 'Source 1', citation: '', notes: '', url: null, repository: null,
        provesWhat: [], attachedToPersonIds: ['keep'], attachedToEdgeIds: [],
        gedcomTag: null, addedAt: new Date(), addedBy: 'test',
      });
      state.graph!.sources.set('s2', {
        id: 's2', origin: 'user_added', sourceClass: 'secondary', sourceType: 'census',
        title: 'Source 2', citation: '', notes: '', url: null, repository: null,
        provesWhat: [], attachedToPersonIds: ['remove'], attachedToEdgeIds: [],
        gedcomTag: null, addedAt: new Date(), addedBy: 'test',
      });

      const result = treeReducer(state, { type: 'MERGE_PERSONS', keepId: 'keep', removeId: 'remove' });

      expect(result.graph!.persons.size).toBe(1);
      expect(result.graph!.getPersonById('keep')?.sourceIds).toContain('s1');
      expect(result.graph!.getPersonById('keep')?.sourceIds).toContain('s2');
    });

    it('reassigns edges from removed person to kept person', () => {
      state.graph!.addPerson(makePerson('keep'));
      state.graph!.addPerson(makePerson('remove'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'remove', 'child'));

      const result = treeReducer(state, { type: 'MERGE_PERSONS', keepId: 'keep', removeId: 'remove' });

      const edge = result.graph!.getEdgeById('e1')!;
      expect(edge.parentId).toBe('keep');
      expect(result.graph!.getChildren('keep')).toHaveLength(1);
    });

    it('redirects selection from removed to kept person', () => {
      state.graph!.addPerson(makePerson('keep'));
      state.graph!.addPerson(makePerson('remove'));
      state.selectedPersonId = 'remove';

      const result = treeReducer(state, { type: 'MERGE_PERSONS', keepId: 'keep', removeId: 'remove' });
      expect(result.selectedPersonId).toBe('keep');
    });
  });
});
