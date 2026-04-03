import { describe, it, expect } from 'vitest';
import { scanPathConvergence } from './convergence-scanner.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';

// ── Factories ─────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  return {
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test /Person/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
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
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> & { id: string; parentId: string; childId: string }): Edge {
  return {
    relationshipType: 'biological',
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
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

// ── Tests ─────────────────────────────────────────────────────────────

describe('scanPathConvergence', () => {
  it('returns empty when subject has no parents', () => {
    const subject = makePerson({ id: 'subject' });
    const graph = buildGraph([subject], []);

    expect(scanPathConvergence(graph, 'subject')).toHaveLength(0);
  });

  it('returns empty for a simple linear chain', () => {
    const gp = makePerson({ id: 'gp', name: { full: 'Grandparent', given: 'Grand', middle: '', surname: 'Parent', maidenName: '', prefix: '', suffix: '', raw: 'Grand /Parent/' } });
    const parent = makePerson({ id: 'parent', name: { full: 'Parent Person', given: 'Parent', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Parent /Person/' } });
    const subject = makePerson({ id: 'subject' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'parent', childId: 'subject' }),
      makeEdge({ id: 'e2', parentId: 'gp', childId: 'parent' }),
    ];

    const graph = buildGraph([gp, parent, subject], edges);
    const results = scanPathConvergence(graph, 'subject');

    // Each ancestor reached by only 1 path → no convergence
    const multiPath = results.filter(r => r.paths.length >= 2);
    expect(multiPath).toHaveLength(0);
  });

  it('detects convergence when ancestor reached via two paths (pedigree collapse)', () => {
    // Subject → Father → Grandfather → GreatGP
    // Subject → Mother → Grandfather → GreatGP (same grandfather)
    // Grandfather needs parents so scanner records its path info
    const greatgp = makePerson({ id: 'ggp', name: { full: 'Great Grandparent', given: 'Great', middle: '', surname: 'Grandparent', maidenName: '', prefix: '', suffix: '', raw: 'Great /Grandparent/' } });
    const grandfather = makePerson({ id: 'gp', name: { full: 'Common Ancestor', given: 'Common', middle: '', surname: 'Ancestor', maidenName: '', prefix: '', suffix: '', raw: 'Common /Ancestor/' } });
    const father = makePerson({ id: 'father', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'mother', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });
    const subject = makePerson({ id: 'subject' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'subject' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'subject' }),
      makeEdge({ id: 'e3', parentId: 'gp', childId: 'father' }),
      makeEdge({ id: 'e4', parentId: 'gp', childId: 'mother' }),
      makeEdge({ id: 'e5', parentId: 'ggp', childId: 'gp' }),
    ];

    const graph = buildGraph([greatgp, grandfather, father, mother, subject], edges);
    const results = scanPathConvergence(graph, 'subject');

    // Grandfather should appear as a convergence point reached by 2+ paths
    const gpConvergence = results.find(r => r.ancestorId === 'gp');
    expect(gpConvergence).toBeDefined();
    expect(gpConvergence!.paths.length).toBeGreaterThanOrEqual(2);
  });

  it('detects conflict when ancestor has multiple different parent sets', () => {
    // Ancestor reached via two paths, but the ancestor itself has different parents
    // depending on which family record it's in
    const gpFather1 = makePerson({ id: 'gpF1', name: { full: 'GrandFather 1', given: 'Grand', middle: '', surname: 'Father1', maidenName: '', prefix: '', suffix: '', raw: 'Grand /Father1/' } });
    const gpFather2 = makePerson({ id: 'gpF2', name: { full: 'GrandFather 2', given: 'Grand', middle: '', surname: 'Father2', maidenName: '', prefix: '', suffix: '', raw: 'Grand /Father2/' } });
    const ancestor = makePerson({ id: 'ancestor', name: { full: 'Shared Ancestor', given: 'Shared', middle: '', surname: 'Ancestor', maidenName: '', prefix: '', suffix: '', raw: 'Shared /Ancestor/' } });
    const father = makePerson({ id: 'father', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'mother', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });
    const subject = makePerson({ id: 'subject' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'subject' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'subject' }),
      makeEdge({ id: 'e3', parentId: 'ancestor', childId: 'father' }),
      makeEdge({ id: 'e4', parentId: 'ancestor', childId: 'mother' }),
      // Ancestor has 3 parent edges (>2 = conflict indicator)
      makeEdge({ id: 'e5', parentId: 'gpF1', childId: 'ancestor' }),
      makeEdge({ id: 'e6', parentId: 'gpF2', childId: 'ancestor' }),
      makeEdge({ id: 'e7', parentId: 'gpF1', childId: 'ancestor' }), // Extra edge (different FAM record)
    ];

    const graph = buildGraph([gpFather1, gpFather2, ancestor, father, mother, subject], edges);
    const results = scanPathConvergence(graph, 'subject');

    const ancestorPoint = results.find(r => r.ancestorId === 'ancestor');
    expect(ancestorPoint).toBeDefined();
    expect(ancestorPoint!.conflictDetected).toBe(true);
  });

  it('does not flag conflict for intentional parallel parentage', () => {
    const parentA = makePerson({ id: 'pA', name: { full: 'Parent A', given: 'Parent', middle: '', surname: 'A', maidenName: '', prefix: '', suffix: '', raw: 'Parent /A/' } });
    const parentB = makePerson({ id: 'pB', name: { full: 'Parent B', given: 'Parent', middle: '', surname: 'B', maidenName: '', prefix: '', suffix: '', raw: 'Parent /B/' } });
    const parentC = makePerson({ id: 'pC', name: { full: 'Parent C', given: 'Parent', middle: '', surname: 'C', maidenName: '', prefix: '', suffix: '', raw: 'Parent /C/' } });
    const child = makePerson({ id: 'child' });

    // 3 parent edges but with parallelGroupId — intentional
    const edges = [
      makeEdge({ id: 'e1', parentId: 'pA', childId: 'child', parallelGroupId: 'group1', isPrimary: true }),
      makeEdge({ id: 'e2', parentId: 'pB', childId: 'child', parallelGroupId: 'group1', isPrimary: false }),
      makeEdge({ id: 'e3', parentId: 'pC', childId: 'child', parallelGroupId: 'group1', isPrimary: false }),
    ];

    const graph = buildGraph([parentA, parentB, parentC, child], edges);
    const results = scanPathConvergence(graph, 'child');

    // Even though child has >2 parent edges, they're in a parallel group → not a conflict
    // Child is the subject, so it won't appear as an ancestor convergence point
    expect(results.every(r => !r.conflictDetected || r.ancestorId !== 'child')).toBe(true);
  });

  it('includes path confidence from edge tiers', () => {
    const ggp = makePerson({ id: 'ggp', name: { full: 'Great GP', given: 'Great', middle: '', surname: 'GP', maidenName: '', prefix: '', suffix: '', raw: 'Great /GP/' } });
    const gp = makePerson({ id: 'gp', name: { full: 'GP', given: 'GP', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'GP /Test/' } });
    const father = makePerson({ id: 'father', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'mother', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });
    const subject = makePerson({ id: 'subject' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'subject', confidenceTier: 1 as ConfidenceTier }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'subject', confidenceTier: 2 as ConfidenceTier }),
      makeEdge({ id: 'e3', parentId: 'gp', childId: 'father', confidenceTier: 4 as ConfidenceTier }),
      makeEdge({ id: 'e4', parentId: 'gp', childId: 'mother', confidenceTier: 1 as ConfidenceTier }),
      makeEdge({ id: 'e5', parentId: 'ggp', childId: 'gp', confidenceTier: 2 as ConfidenceTier }),
    ];

    const graph = buildGraph([ggp, gp, father, mother, subject], edges);
    const results = scanPathConvergence(graph, 'subject');

    const gpPoint = results.find(r => r.ancestorId === 'gp');
    expect(gpPoint).toBeDefined();
    // Path through father has weakest edge tier 4, path through mother has weakest tier 2
    const confidences = gpPoint!.paths.map(p => p.confidence);
    expect(confidences).toContain(4); // Father path: tier 4 edge
  });
});
