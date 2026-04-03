import { describe, it, expect, beforeEach } from 'vitest';
import { TreeGraph } from './tree-graph.ts';
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
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
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
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
  };
}

describe('TreeGraph mutations', () => {
  let graph: TreeGraph;

  beforeEach(() => {
    graph = new TreeGraph();
  });

  describe('addPerson', () => {
    it('adds a person to the graph', () => {
      const person = makePerson('p1', 'John Smith');
      graph.addPerson(person);
      expect(graph.persons.size).toBe(1);
      expect(graph.getPersonById('p1')).toBe(person);
    });

    it('can add multiple persons', () => {
      graph.addPerson(makePerson('p1'));
      graph.addPerson(makePerson('p2'));
      expect(graph.persons.size).toBe(2);
    });
  });

  describe('updatePerson', () => {
    it('updates person fields', () => {
      graph.addPerson(makePerson('p1', 'John Smith'));
      graph.updatePerson('p1', { sex: 'M' });
      expect(graph.getPersonById('p1')?.sex).toBe('M');
    });

    it('sets updatedAt', () => {
      const person = makePerson('p1');
      const originalDate = person.updatedAt;
      graph.addPerson(person);
      graph.updatePerson('p1', { sex: 'F' });
      expect(graph.getPersonById('p1')!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalDate.getTime());
    });

    it('does nothing for non-existent person', () => {
      graph.updatePerson('nonexistent', { sex: 'M' });
      expect(graph.persons.size).toBe(0);
    });
  });

  describe('addEdge', () => {
    it('adds an edge and indexes it', () => {
      graph.addPerson(makePerson('parent'));
      graph.addPerson(makePerson('child'));
      graph.addEdge(makeEdge('e1', 'parent', 'child'));

      expect(graph.edges.size).toBe(1);
      expect(graph.getParents('child')).toHaveLength(1);
      expect(graph.getChildren('parent')).toHaveLength(1);
    });

    it('builds spouse map when two parents share a child', () => {
      graph.addPerson(makePerson('father'));
      graph.addPerson(makePerson('mother'));
      graph.addPerson(makePerson('child'));
      graph.addEdge(makeEdge('e1', 'father', 'child'));
      graph.addEdge(makeEdge('e2', 'mother', 'child'));

      const spouses = graph.getSpouses('father');
      expect(spouses).toHaveLength(1);
      expect(spouses[0].id).toBe('mother');
    });
  });

  describe('removeEdge', () => {
    it('removes an edge and un-indexes it', () => {
      graph.addPerson(makePerson('parent'));
      graph.addPerson(makePerson('child'));
      graph.addEdge(makeEdge('e1', 'parent', 'child'));

      graph.removeEdge('e1');

      expect(graph.edges.size).toBe(0);
      expect(graph.getParents('child')).toHaveLength(0);
      expect(graph.getChildren('parent')).toHaveLength(0);
    });

    it('updates spouse map after edge removal', () => {
      graph.addPerson(makePerson('father'));
      graph.addPerson(makePerson('mother'));
      graph.addPerson(makePerson('child'));
      graph.addEdge(makeEdge('e1', 'father', 'child'));
      graph.addEdge(makeEdge('e2', 'mother', 'child'));

      graph.removeEdge('e1');

      expect(graph.getSpouses('father')).toHaveLength(0);
      expect(graph.getSpouses('mother')).toHaveLength(0);
    });

    it('does nothing for non-existent edge', () => {
      graph.removeEdge('nonexistent');
      expect(graph.edges.size).toBe(0);
    });
  });

  describe('removePerson', () => {
    it('removes the person', () => {
      graph.addPerson(makePerson('p1'));
      graph.removePerson('p1');
      expect(graph.persons.size).toBe(0);
    });

    it('cascades: removes all edges involving the person', () => {
      graph.addPerson(makePerson('parent'));
      graph.addPerson(makePerson('child'));
      graph.addPerson(makePerson('grandchild'));
      graph.addEdge(makeEdge('e1', 'parent', 'child'));
      graph.addEdge(makeEdge('e2', 'child', 'grandchild'));

      graph.removePerson('child');

      expect(graph.persons.size).toBe(2);
      expect(graph.edges.size).toBe(0);
      expect(graph.getParents('grandchild')).toHaveLength(0);
      expect(graph.getChildren('parent')).toHaveLength(0);
    });

    it('detaches sources referencing the removed person', () => {
      graph.addPerson(makePerson('p1'));
      graph.sources.set('s1', {
        id: 's1',
        origin: 'user_added',
        sourceClass: 'primary',
        sourceType: 'vital_record',
        title: 'Test',
        citation: '',
        notes: '',
        url: null,
        repository: null,
        provesWhat: [],
        attachedToPersonIds: ['p1'],
        attachedToEdgeIds: [],
        gedcomTag: null,
        sourceHash: '',
        addedAt: new Date(),
        addedBy: 'test',
      });

      graph.removePerson('p1');

      expect(graph.sources.get('s1')!.attachedToPersonIds).toEqual([]);
    });

    it('does nothing for non-existent person', () => {
      graph.addPerson(makePerson('p1'));
      graph.removePerson('nonexistent');
      expect(graph.persons.size).toBe(1);
    });
  });

  describe('rebuildIndices', () => {
    it('rebuilds all indices from scratch', () => {
      graph.addPerson(makePerson('a'));
      graph.addPerson(makePerson('b'));
      graph.addPerson(makePerson('c'));
      graph.addEdge(makeEdge('e1', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'a', 'c'));

      // Manually corrupt indices
      graph.parentEdges.clear();
      graph.childEdges.clear();

      expect(graph.getChildren('a')).toHaveLength(0);

      graph.rebuildIndices();

      expect(graph.getChildren('a')).toHaveLength(2);
      expect(graph.getParents('b')).toHaveLength(1);
      expect(graph.getParents('c')).toHaveLength(1);
    });
  });
});
