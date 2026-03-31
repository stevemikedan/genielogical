import { describe, it, expect, beforeEach } from 'vitest';
import { treeReducer, initialTreeState } from './tree-state.ts';
import type { TreeState } from './tree-state.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Conjecture } from '@/types/conjecture.ts';
import type { Flag } from '@/types/flag.ts';

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

function makeSource(id: string, sourceClass: Source['sourceClass'] = 'secondary'): Source {
  return {
    id,
    origin: 'user_added',
    sourceClass,
    sourceType: 'census',
    title: `Source ${id}`,
    citation: '',
    notes: '',
    url: null,
    repository: null,
    provesWhat: [],
    attachedToPersonIds: [],
    attachedToEdgeIds: [],
    gedcomTag: null,
    addedAt: new Date(),
    addedBy: 'test',
  };
}

function makeFlag(id: string, overrides: Partial<Flag> = {}): Flag {
  return {
    id,
    category: 'chronological',
    severity: 'warning',
    title: 'Test Flag',
    description: 'test',
    suggestedAction: 'test',
    ruleId: 'test',
    affectedPersonIds: [],
    affectedEdgeIds: [],
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

function makeConjecture(id: string, personId: string): Conjecture {
  return {
    id,
    personId,
    hypothesis: 'Test hypothesis',
    confidencePercent: 50,
    supportingEvidence: '',
    contradictingEvidence: '',
    sourceIds: [],
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
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

  describe('UPDATE_PERSON_STATUS', () => {
    it('sets status on existing person', () => {
      state.graph!.addPerson(makePerson('p1'));
      const result = treeReducer(state, { type: 'UPDATE_PERSON_STATUS', personId: 'p1', status: 'validated' });
      expect(result.graph!.getPersonById('p1')?.status).toBe('validated');
    });

    it('updates the updatedAt timestamp', () => {
      const person = makePerson('p1');
      person.updatedAt = new Date('2020-01-01');
      state.graph!.addPerson(person);
      const result = treeReducer(state, { type: 'UPDATE_PERSON_STATUS', personId: 'p1', status: 'under_review' });
      expect(result.graph!.getPersonById('p1')!.updatedAt.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
    });

    it('returns same state if person not found', () => {
      const result = treeReducer(state, { type: 'UPDATE_PERSON_STATUS', personId: 'missing', status: 'validated' });
      expect(result).toEqual(state);
    });

    it('returns same state if no graph', () => {
      const result = treeReducer(initialTreeState, { type: 'UPDATE_PERSON_STATUS', personId: 'p1', status: 'validated' });
      expect(result).toBe(initialTreeState);
    });
  });

  describe('ADD_SOURCE', () => {
    it('adds source to graph and attaches to person', () => {
      state.graph!.addPerson(makePerson('p1'));
      const source = makeSource('s1', 'primary');
      const result = treeReducer(state, { type: 'ADD_SOURCE', source, personIds: ['p1'], edgeIds: [] });
      expect(result.graph!.sources.get('s1')).toBeDefined();
      expect(result.graph!.getPersonById('p1')?.sourceIds).toContain('s1');
    });

    it('attaches source to edge', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));
      const source = makeSource('s1');
      const result = treeReducer(state, { type: 'ADD_SOURCE', source, personIds: [], edgeIds: ['e1'] });
      expect(result.graph!.getEdgeById('e1')?.sourceIds).toContain('s1');
    });

    it('does not duplicate sourceId if already present', () => {
      const person = makePerson('p1');
      person.sourceIds = ['s1'];
      state.graph!.addPerson(person);
      state.graph!.sources.set('s1', makeSource('s1'));
      const source = makeSource('s1');
      const result = treeReducer(state, { type: 'ADD_SOURCE', source, personIds: ['p1'], edgeIds: [] });
      const ids = result.graph!.getPersonById('p1')?.sourceIds.filter(id => id === 's1');
      expect(ids).toHaveLength(1);
    });

    it('updates source attachedToPersonIds and attachedToEdgeIds', () => {
      state.graph!.addPerson(makePerson('p1'));
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));
      const source = makeSource('s1');
      const result = treeReducer(state, { type: 'ADD_SOURCE', source, personIds: ['p1'], edgeIds: ['e1'] });
      const stored = result.graph!.sources.get('s1')!;
      expect(stored.attachedToPersonIds).toEqual(['p1']);
      expect(stored.attachedToEdgeIds).toEqual(['e1']);
    });

    it('returns same state if no graph', () => {
      const result = treeReducer(initialTreeState, { type: 'ADD_SOURCE', source: makeSource('s1'), personIds: [], edgeIds: [] });
      expect(result).toBe(initialTreeState);
    });
  });

  describe('REMOVE_SOURCE', () => {
    it('removes source and detaches from person', () => {
      const person = makePerson('p1');
      person.sourceIds = ['s1'];
      state.graph!.addPerson(person);
      const source = makeSource('s1');
      source.attachedToPersonIds = ['p1'];
      state.graph!.sources.set('s1', source);

      const result = treeReducer(state, { type: 'REMOVE_SOURCE', sourceId: 's1' });
      expect(result.graph!.sources.has('s1')).toBe(false);
      expect(result.graph!.getPersonById('p1')?.sourceIds).not.toContain('s1');
    });

    it('detaches from edge', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      const edge = makeEdge('e1', 'parent', 'child');
      edge.sourceIds = ['s1'];
      state.graph!.addEdge(edge);
      const source = makeSource('s1');
      source.attachedToEdgeIds = ['e1'];
      state.graph!.sources.set('s1', source);

      const result = treeReducer(state, { type: 'REMOVE_SOURCE', sourceId: 's1' });
      expect(result.graph!.getEdgeById('e1')?.sourceIds).not.toContain('s1');
    });

    it('returns same state if source not found', () => {
      const result = treeReducer(state, { type: 'REMOVE_SOURCE', sourceId: 'nonexistent' });
      expect(result).toEqual(state);
    });
  });

  describe('UPDATE_FLAG_STATUS', () => {
    it('updates flag userStatus', () => {
      state.flags = [makeFlag('f1')];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'acknowledged', userNote: null });
      expect(result.flags[0].userStatus).toBe('acknowledged');
    });

    it('sets userNote when provided', () => {
      state.flags = [makeFlag('f1')];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'investigating', userNote: 'Looking into this' });
      expect(result.flags[0].userNote).toBe('Looking into this');
    });

    it('sets resolvedAt when status is resolved', () => {
      state.flags = [makeFlag('f1')];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'resolved', userNote: null });
      expect(result.flags[0].resolvedAt).toBeInstanceOf(Date);
    });

    it('does not set resolvedAt for non-resolved status', () => {
      state.flags = [makeFlag('f1')];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'dismissed', userNote: null });
      expect(result.flags[0].resolvedAt).toBeNull();
    });

    it('preserves existing userNote when new note is null', () => {
      state.flags = [makeFlag('f1', { userNote: 'Existing note' })];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'acknowledged', userNote: null });
      expect(result.flags[0].userNote).toBe('Existing note');
    });

    it('does not modify other flags', () => {
      state.flags = [makeFlag('f1'), makeFlag('f2')];
      const result = treeReducer(state, { type: 'UPDATE_FLAG_STATUS', flagId: 'f1', userStatus: 'dismissed', userNote: null });
      expect(result.flags[1].userStatus).toBe('new');
    });
  });

  describe('SET_PRIMARY_PATH', () => {
    it('sets isPrimary on target edge and clears on siblings in group', () => {
      state.graph!.addPerson(makePerson('parent1'));
      state.graph!.addPerson(makePerson('parent2'));
      state.graph!.addPerson(makePerson('child'));

      const e1 = makeEdge('e1', 'parent1', 'child');
      e1.parallelGroupId = 'grp1';
      e1.isPrimary = true;
      const e2 = makeEdge('e2', 'parent2', 'child');
      e2.parallelGroupId = 'grp1';
      e2.isPrimary = false;

      state.graph!.addEdge(e1);
      state.graph!.addEdge(e2);

      const result = treeReducer(state, { type: 'SET_PRIMARY_PATH', edgeId: 'e2' });
      expect(result.graph!.getEdgeById('e1')?.isPrimary).toBe(false);
      expect(result.graph!.getEdgeById('e2')?.isPrimary).toBe(true);
    });

    it('returns same state if edge has no parallelGroupId', () => {
      state.graph!.addPerson(makePerson('parent'));
      state.graph!.addPerson(makePerson('child'));
      state.graph!.addEdge(makeEdge('e1', 'parent', 'child'));

      const result = treeReducer(state, { type: 'SET_PRIMARY_PATH', edgeId: 'e1' });
      // Should still return (edge has no parallelGroupId so it early-returns)
      expect(result).toEqual(state);
    });

    it('returns same state if edge not found', () => {
      const result = treeReducer(state, { type: 'SET_PRIMARY_PATH', edgeId: 'missing' });
      expect(result).toEqual(state);
    });
  });

  describe('ADD_CONJECTURE', () => {
    it('adds conjecture to map', () => {
      state.graph!.addPerson(makePerson('p1'));
      const conj = makeConjecture('c1', 'p1');
      const result = treeReducer(state, { type: 'ADD_CONJECTURE', conjecture: conj });
      expect(result.conjectures.get('c1')).toBeDefined();
      expect(result.conjectures.get('c1')?.hypothesis).toBe('Test hypothesis');
    });

    it('adds conjectureId to person', () => {
      state.graph!.addPerson(makePerson('p1'));
      const conj = makeConjecture('c1', 'p1');
      const result = treeReducer(state, { type: 'ADD_CONJECTURE', conjecture: conj });
      expect(result.graph!.getPersonById('p1')?.conjectureIds).toContain('c1');
    });

    it('does not duplicate conjectureId on person', () => {
      const person = makePerson('p1');
      person.conjectureIds = ['c1'];
      state.graph!.addPerson(person);
      const conj = makeConjecture('c1', 'p1');
      const result = treeReducer(state, { type: 'ADD_CONJECTURE', conjecture: conj });
      expect(result.graph!.getPersonById('p1')?.conjectureIds.filter(id => id === 'c1')).toHaveLength(1);
    });
  });

  describe('UPDATE_CONJECTURE', () => {
    it('updates conjecture fields', () => {
      state.conjectures = new Map([['c1', makeConjecture('c1', 'p1')]]);
      const result = treeReducer(state, {
        type: 'UPDATE_CONJECTURE',
        conjectureId: 'c1',
        updates: { hypothesis: 'Updated hypothesis', status: 'confirmed' },
      });
      expect(result.conjectures.get('c1')?.hypothesis).toBe('Updated hypothesis');
      expect(result.conjectures.get('c1')?.status).toBe('confirmed');
    });

    it('updates updatedAt timestamp', () => {
      const conj = makeConjecture('c1', 'p1');
      conj.updatedAt = new Date('2020-01-01');
      state.conjectures = new Map([['c1', conj]]);
      const result = treeReducer(state, {
        type: 'UPDATE_CONJECTURE',
        conjectureId: 'c1',
        updates: { confidencePercent: 90 },
      });
      expect(result.conjectures.get('c1')!.updatedAt.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
    });

    it('returns same state if conjecture not found', () => {
      const result = treeReducer(state, {
        type: 'UPDATE_CONJECTURE',
        conjectureId: 'missing',
        updates: { hypothesis: 'x' },
      });
      expect(result).toBe(state);
    });
  });

  describe('SET_DEEP_SCAN', () => {
    it('stores deep scan result', () => {
      const scanResult = { subjectId: 'p1', totalUniqueAncestors: 10, maxGenerationReached: 5, branches: [], generationDistribution: new Map(), allNotableFigures: [] };
      const result = treeReducer(state, { type: 'SET_DEEP_SCAN', result: scanResult });
      expect(result.deepScanResult).toBe(scanResult);
    });
  });

  describe('SET_STORY_PATHS', () => {
    it('stores story path result', () => {
      const storyResult = { subjectId: 'p1', notableAncestors: [], byCategory: new Map() };
      const result = treeReducer(state, { type: 'SET_STORY_PATHS', result: storyResult });
      expect(result.storyPathResult).toBe(storyResult);
    });
  });

  describe('SET_RESEARCH_PRIORITIES', () => {
    it('stores research priority list', () => {
      const priorities = [{ edgeId: 'e1', parentId: 'p1', childId: 'c1', currentTier: 4 as const, impactScore: 5, affectedNotablePaths: [], affectedPathCount: 1, description: 'test' }];
      const result = treeReducer(state, { type: 'SET_RESEARCH_PRIORITIES', priorities });
      expect(result.researchPriorities).toHaveLength(1);
      expect(result.researchPriorities[0].edgeId).toBe('e1');
    });
  });

  describe('SET_AI_NOTABLE_CONTEXT', () => {
    it('inserts into aiNotableContexts map', () => {
      const context = { personId: 'p1', historicalContext: 'Test', connectionPlausibility: 'Likely', suggestedReadings: [], generatedAt: new Date() };
      const result = treeReducer(state, { type: 'SET_AI_NOTABLE_CONTEXT', context });
      expect(result.aiNotableContexts.get('p1')).toBeDefined();
      expect(result.aiNotableContexts.get('p1')?.historicalContext).toBe('Test');
    });

    it('overwrites existing entry for same personId', () => {
      const ctx1 = { personId: 'p1', historicalContext: 'Old', connectionPlausibility: '', suggestedReadings: [], generatedAt: new Date() };
      state.aiNotableContexts = new Map([['p1', ctx1]]);
      const ctx2 = { personId: 'p1', historicalContext: 'New', connectionPlausibility: '', suggestedReadings: [], generatedAt: new Date() };
      const result = treeReducer(state, { type: 'SET_AI_NOTABLE_CONTEXT', context: ctx2 });
      expect(result.aiNotableContexts.get('p1')?.historicalContext).toBe('New');
    });
  });

  describe('SET_BATCH_PROGRESS', () => {
    it('stores batch progress', () => {
      const progress = { scope: 'all_flagged' as const, total: 100, completed: 50, failed: 2, estimatedCostUsd: 0.5, actualCostUsd: 0.25, status: 'running' as const, startedAt: new Date() };
      const result = treeReducer(state, { type: 'SET_BATCH_PROGRESS', progress });
      expect(result.aiBatchProgress?.completed).toBe(50);
    });

    it('clears batch progress with null', () => {
      state.aiBatchProgress = { scope: 'all_flagged', total: 100, completed: 100, failed: 0, estimatedCostUsd: 0.5, actualCostUsd: 0.5, status: 'complete', startedAt: new Date() };
      const result = treeReducer(state, { type: 'SET_BATCH_PROGRESS', progress: null });
      expect(result.aiBatchProgress).toBeNull();
    });
  });

  describe('SET_AI_ENRICH', () => {
    it('inserts enrich result into map', () => {
      const enrichResult = { personId: 'p1', identifiedAs: 'Test', summary: 'Summary', suggestions: [], sourcesSearched: [], webCitations: [], generatedAt: new Date(), modelId: 'test' };
      const result = treeReducer(state, { type: 'SET_AI_ENRICH', result: enrichResult });
      expect(result.aiEnrichResults.get('p1')?.summary).toBe('Summary');
    });
  });

  describe('SET_RESEARCH_STEPS', () => {
    it('replaces research steps array', () => {
      const steps = [{ id: 'rs1', personId: 'p1', edgeId: null, origin: 'rule_based' as const, description: 'Test', suggestedSource: '', suggestedUrl: null, reasoning: '', impact: 'high' as const, status: 'not_started' as const, completedAt: null, resultNote: null, generatedAt: new Date() }];
      const result = treeReducer(state, { type: 'SET_RESEARCH_STEPS', steps });
      expect(result.researchSteps).toHaveLength(1);
      expect(result.researchSteps[0].id).toBe('rs1');
    });
  });

  describe('UPDATE_RESEARCH_STEP', () => {
    it('updates step status', () => {
      state.researchSteps = [{ id: 'rs1', personId: 'p1', edgeId: null, origin: 'rule_based', description: 'Test', suggestedSource: '', suggestedUrl: null, reasoning: '', impact: 'high', status: 'not_started', completedAt: null, resultNote: null, generatedAt: new Date() }];
      const result = treeReducer(state, { type: 'UPDATE_RESEARCH_STEP', stepId: 'rs1', status: 'complete' });
      expect(result.researchSteps[0].status).toBe('complete');
      expect(result.researchSteps[0].completedAt).toBeInstanceOf(Date);
    });

    it('does not set completedAt for non-complete status', () => {
      state.researchSteps = [{ id: 'rs1', personId: 'p1', edgeId: null, origin: 'rule_based', description: 'Test', suggestedSource: '', suggestedUrl: null, reasoning: '', impact: 'high', status: 'complete', completedAt: new Date(), resultNote: null, generatedAt: new Date() }];
      const result = treeReducer(state, { type: 'UPDATE_RESEARCH_STEP', stepId: 'rs1', status: 'not_started' });
      expect(result.researchSteps[0].status).toBe('not_started');
    });
  });

  describe('SET_AI_QUICK_CHECK', () => {
    it('inserts quick check result for personId', () => {
      const qc = { plausibility: 'plausible' as const, issues: [], suggestedTier: 3 as const, tierReason: 'test', quickWin: null };
      const result = treeReducer(state, { type: 'SET_AI_QUICK_CHECK', personId: 'p1', result: qc });
      expect(result.aiQuickChecks.get('p1')?.plausibility).toBe('plausible');
    });
  });

  describe('SET_AI_VALIDATION_REPORT', () => {
    it('inserts validation report for personId', () => {
      const report = { personAssessment: { plausibility: 'plausible' as const, summary: 'ok' }, parentalLink: null, recordsFound: [], recordsExpectedButNotFound: [], dateDiscrepancies: [], suggestedTier: 2 as const, nextStep: null };
      const result = treeReducer(state, { type: 'SET_AI_VALIDATION_REPORT', personId: 'p1', report });
      expect(result.aiValidationReports.get('p1')).toBeDefined();
    });
  });

  describe('APPEND_DEEP_RESEARCH_ROUND', () => {
    it('appends round to new session', () => {
      const round = { round: 1, searchesPerformed: [], findings: [], status: 'CONTINUE' as const };
      const result = treeReducer(state, { type: 'APPEND_DEEP_RESEARCH_ROUND', personId: 'p1', round });
      expect(result.aiDeepResearchSessions.get('p1')).toHaveLength(1);
    });

    it('appends to existing session', () => {
      const r1 = { round: 1, searchesPerformed: [], findings: [], status: 'CONTINUE' as const };
      state.aiDeepResearchSessions = new Map([['p1', [r1]]]);
      const r2 = { round: 2, searchesPerformed: [], findings: [], status: 'COMPLETE' as const };
      const result = treeReducer(state, { type: 'APPEND_DEEP_RESEARCH_ROUND', personId: 'p1', round: r2 });
      expect(result.aiDeepResearchSessions.get('p1')).toHaveLength(2);
      expect(result.aiDeepResearchSessions.get('p1')![1].round).toBe(2);
    });
  });

  describe('CLEAR_DEEP_RESEARCH', () => {
    it('removes session for personId', () => {
      const r1 = { round: 1, searchesPerformed: [], findings: [], status: 'COMPLETE' as const };
      state.aiDeepResearchSessions = new Map([['p1', [r1]]]);
      const result = treeReducer(state, { type: 'CLEAR_DEEP_RESEARCH', personId: 'p1' });
      expect(result.aiDeepResearchSessions.has('p1')).toBe(false);
    });

    it('does not fail if session does not exist', () => {
      const result = treeReducer(state, { type: 'CLEAR_DEEP_RESEARCH', personId: 'nonexistent' });
      expect(result.aiDeepResearchSessions.has('nonexistent')).toBe(false);
    });
  });

  describe('SET_ANCESTRY_CONFLICTS', () => {
    it('replaces ancestry conflicts array', () => {
      const conflicts = [{ personIdA: 'p1', personIdB: 'p2', pathA: { fatherId: 'f1', fatherName: 'F', motherId: null, motherName: null, grandparentCount: 0 }, pathB: { fatherId: 'f2', fatherName: 'G', motherId: null, motherName: null, grandparentCount: 0 }, conflictType: 'different_father' as const, descendantsAffectedA: 1, descendantsAffectedB: 1, sharedDescendants: [], sourceCountA: 0, sourceCountB: 0, confidenceTierA: 4 as const, confidenceTierB: 4 as const }];
      const result = treeReducer(state, { type: 'SET_ANCESTRY_CONFLICTS', conflicts });
      expect(result.ancestryConflicts).toHaveLength(1);
    });
  });

  describe('SET_CONVERGENCE_POINTS', () => {
    it('replaces convergence points array', () => {
      const points = [{ ancestorId: 'a1', ancestorName: 'Ancestor', paths: [], conflictDetected: false, divergenceGeneration: 3 }];
      const result = treeReducer(state, { type: 'SET_CONVERGENCE_POINTS', points });
      expect(result.convergencePoints).toHaveLength(1);
      expect(result.convergencePoints[0].ancestorId).toBe('a1');
    });
  });

  describe('LOAD_TREE', () => {
    it('loads tree with graph, flags, and treeId', () => {
      const graph = new TreeGraph();
      graph.addPerson(makePerson('p1'));
      graph.addPerson(makePerson('p2'));
      const flags = [makeFlag('f1')];
      const result = treeReducer(initialTreeState, { type: 'LOAD_TREE', graph, flags, currentTreeId: 'tree-1' });

      expect(result.phase).toBe('loaded');
      expect(result.graph).toBe(graph);
      expect(result.flags).toBe(flags);
      expect(result.currentTreeId).toBe('tree-1');
    });

    it('generates stats from graph', () => {
      const graph = new TreeGraph();
      graph.addPerson(makePerson('p1'));
      graph.addPerson(makePerson('p2'));
      const result = treeReducer(initialTreeState, { type: 'LOAD_TREE', graph, flags: [], currentTreeId: 'tree-1' });
      expect(result.stats!.individualCount).toBe(2);
    });

    it('resets AI and analysis state', () => {
      state.aiQuickChecks = new Map([['p1', { plausibility: 'plausible' as const, issues: [], suggestedTier: 3 as const, tierReason: 'x', quickWin: null }]]);
      state.ancestryConflicts = [{ personIdA: 'a', personIdB: 'b', pathA: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 }, pathB: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 }, conflictType: 'different_parents', descendantsAffectedA: 0, descendantsAffectedB: 0, sharedDescendants: [], sourceCountA: 0, sourceCountB: 0, confidenceTierA: 4 as const, confidenceTierB: 4 as const }];
      const graph = new TreeGraph();
      const result = treeReducer(state, { type: 'LOAD_TREE', graph, flags: [], currentTreeId: 'tree-2' });
      expect(result.aiQuickChecks.size).toBe(0);
      expect(result.ancestryConflicts).toHaveLength(0);
      expect(result.conjectures.size).toBe(0);
    });
  });

  describe('SET_FLAGS', () => {
    it('replaces flags array', () => {
      const flags = [makeFlag('f1'), makeFlag('f2')];
      const result = treeReducer(state, { type: 'SET_FLAGS', flags });
      expect(result.flags).toHaveLength(2);
    });
  });
});
