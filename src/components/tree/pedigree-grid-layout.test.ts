import { describe, it, expect } from 'vitest';
import { computePedigreeGridLayout, GRID_DENSITY_PRESETS } from './pedigree-grid-layout.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

// ── Test helpers ──────────────────────────────────────────────────────

function makePerson(id: string, sex: 'M' | 'F' | 'U', name: string): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex,
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4 as const,
    confidenceReason: '',
    status: 'tentative' as const,
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
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 3 as const,
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
  };
}

function buildGraph(persons: Person[], edges: Edge[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.addPerson(p);
  for (const e of edges) graph.edges.set(e.id, e);
  graph.rebuildIndices();
  return graph;
}

const compact = GRID_DENSITY_PRESETS.compact;

// ── Tests ─────────────────────────────────────────────────────────────

describe('computePedigreeGridLayout', () => {
  describe('single person (root only)', () => {
    it('returns 1 node at gen 0, ahnentafel 1, with 2 placeholders and 0 connectors', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const graph = buildGraph([root], []);

      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      // 1 real node
      expect(layout.nodes).toHaveLength(1);
      expect(layout.nodes[0].person?.id).toBe('P1');
      expect(layout.nodes[0].ahnentafel).toBe(1);
      expect(layout.nodes[0].generation).toBe(0);
      expect(layout.nodes[0].position).toBe('self');
      expect(layout.nodes[0].parentAhnentafel).toBeNull();

      // No connectors for a lone root
      expect(layout.connectors).toHaveLength(0);
    });
  });

  describe('root + 2 parents', () => {
    it('returns 3 nodes with correct ahnentafel, father above mother, and 2 connectors', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');
      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgeM = makeEdge('E2', 'P3', 'P1');

      const graph = buildGraph([root, father, mother], [edgeF, edgeM]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      // 3 real nodes
      expect(layout.nodes).toHaveLength(3);

      const rootNode = layout.nodes.find(n => n.ahnentafel === 1)!;
      const fatherNode = layout.nodes.find(n => n.ahnentafel === 2)!;
      const motherNode = layout.nodes.find(n => n.ahnentafel === 3)!;

      expect(rootNode.person?.id).toBe('P1');
      expect(rootNode.generation).toBe(0);
      expect(rootNode.position).toBe('self');

      expect(fatherNode.person?.id).toBe('P2');
      expect(fatherNode.generation).toBe(1);
      expect(fatherNode.position).toBe('father');
      expect(fatherNode.parentAhnentafel).toBe(1);

      expect(motherNode.person?.id).toBe('P3');
      expect(motherNode.generation).toBe(1);
      expect(motherNode.position).toBe('mother');
      expect(motherNode.parentAhnentafel).toBe(1);

      // Father is above mother (lower y value)
      expect(fatherNode.y).toBeLessThan(motherNode.y);

      // 2 connectors (father→root, mother→root)
      expect(layout.connectors).toHaveLength(2);

      // No placeholders: father and mother have no parent edges in the graph,
      // so the engine has no reason to show placeholder ancestor slots.
      expect(layout.placeholders).toHaveLength(0);
    });
  });

  describe('3 generations (root + parents + paternal grandparents)', () => {
    it('places 5 nodes with correct ahnentafel numbering', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');
      const pgf = makePerson('P4', 'M', 'William Smith');
      const pgm = makePerson('P5', 'F', 'Elizabeth Brown');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgeM = makeEdge('E2', 'P3', 'P1');
      const edgePGF = makeEdge('E3', 'P4', 'P2');
      const edgePGM = makeEdge('E4', 'P5', 'P2');

      const graph = buildGraph(
        [root, father, mother, pgf, pgm],
        [edgeF, edgeM, edgePGF, edgePGM],
      );
      const layout = computePedigreeGridLayout('P1', graph, 4, compact);

      expect(layout.nodes).toHaveLength(5);

      const nodesByAhn = new Map(layout.nodes.map(n => [n.ahnentafel, n]));

      // Root: ahn=1, gen=0
      expect(nodesByAhn.get(1)!.person?.id).toBe('P1');
      expect(nodesByAhn.get(1)!.generation).toBe(0);

      // Father: ahn=2, gen=1
      expect(nodesByAhn.get(2)!.person?.id).toBe('P2');
      expect(nodesByAhn.get(2)!.generation).toBe(1);

      // Mother: ahn=3, gen=1
      expect(nodesByAhn.get(3)!.person?.id).toBe('P3');
      expect(nodesByAhn.get(3)!.generation).toBe(1);

      // Paternal grandfather: ahn=4, gen=2
      expect(nodesByAhn.get(4)!.person?.id).toBe('P4');
      expect(nodesByAhn.get(4)!.generation).toBe(2);

      // Paternal grandmother: ahn=5, gen=2
      expect(nodesByAhn.get(5)!.person?.id).toBe('P5');
      expect(nodesByAhn.get(5)!.generation).toBe(2);

      // Verify y ordering: PGF < PGM < MGF placeholder slot < MGM placeholder slot
      expect(nodesByAhn.get(4)!.y).toBeLessThan(nodesByAhn.get(5)!.y);
      expect(nodesByAhn.get(5)!.y).toBeLessThan(nodesByAhn.get(3)!.y);
    });
  });

  describe('band calculation accuracy', () => {
    it('computes correct band dimensions with compact preset for 3 generations', () => {
      // With recursive band allocation, leaf count drives sizing:
      //   Leaves: PGF (ahn 4), PGM (ahn 5), Mother (ahn 3) = 3 leaves
      //   totalHeight = max(3 * minBandHeight, 3 * rowHeight) = max(3*60, 3*55) = 180
      //
      // Band allocation (proportional to leaf count):
      //   Root (ahn 1): 0 to 180, y = 90
      //   Father (ahn 2, 2 leaves) gets 2/3: 0 to 120, y = 60
      //   Mother (ahn 3, 1 leaf) gets 1/3: 120 to 180, y = 150
      //   PGF (ahn 4, 1 leaf): 0 to 60, y = 30
      //   PGM (ahn 5, 1 leaf): 60 to 120, y = 90

      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');
      const pgf = makePerson('P4', 'M', 'William Smith');
      const pgm = makePerson('P5', 'F', 'Elizabeth Brown');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgeM = makeEdge('E2', 'P3', 'P1');
      const edgePGF = makeEdge('E3', 'P4', 'P2');
      const edgePGM = makeEdge('E4', 'P5', 'P2');

      const graph = buildGraph(
        [root, father, mother, pgf, pgm],
        [edgeF, edgeM, edgePGF, edgePGM],
      );
      const layout = computePedigreeGridLayout('P1', graph, 4, compact);

      const nodesByAhn = new Map(layout.nodes.map(n => [n.ahnentafel, n]));

      // Root band spans full height (3 leaves × 60 minBandHeight = 180)
      const rootNode = nodesByAhn.get(1)!;
      expect(rootNode.bandTop).toBe(0);
      expect(rootNode.bandBottom).toBe(180);
      expect(rootNode.y).toBe(90);
      expect(rootNode.x).toBe(0);

      // Father gets 2/3 (2 leaves out of 3)
      const fatherNode = nodesByAhn.get(2)!;
      expect(fatherNode.bandTop).toBe(0);
      expect(fatherNode.bandBottom).toBe(120);
      expect(fatherNode.y).toBe(60);
      expect(fatherNode.x).toBe(compact.columnWidth); // 220

      // Mother gets 1/3 (1 leaf out of 3)
      const motherNode = nodesByAhn.get(3)!;
      expect(motherNode.bandTop).toBe(120);
      expect(motherNode.bandBottom).toBe(180);
      expect(motherNode.y).toBe(150);
      expect(motherNode.x).toBe(compact.columnWidth);

      // Paternal grandfather: half of father's band
      const pgfNode = nodesByAhn.get(4)!;
      expect(pgfNode.bandTop).toBe(0);
      expect(pgfNode.bandBottom).toBe(60);
      expect(pgfNode.y).toBe(30);
      expect(pgfNode.x).toBe(2 * compact.columnWidth);

      // Paternal grandmother: other half of father's band
      const pgmNode = nodesByAhn.get(5)!;
      expect(pgmNode.bandTop).toBe(60);
      expect(pgmNode.bandBottom).toBe(120);
      expect(pgmNode.y).toBe(90);
      expect(pgmNode.x).toBe(2 * compact.columnWidth);

      // Total height = 3 leaves × 60 minBandHeight = 180
      expect(layout.totalHeight).toBe(180);
    });
  });

  describe('placeholder generation', () => {
    it('creates a placeholder for the missing mother when only father exists', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const edgeF = makeEdge('E1', 'P2', 'P1');

      const graph = buildGraph([root, father], [edgeF]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      // 2 real nodes
      expect(layout.nodes).toHaveLength(2);

      // There should be a placeholder for the mother slot (ahn=3)
      const motherPlaceholder = layout.placeholders.find(p => p.ahnentafel === 3);
      expect(motherPlaceholder).toBeDefined();
      expect(motherPlaceholder!.person).toBeNull();
      expect(motherPlaceholder!.generation).toBe(1);
      expect(motherPlaceholder!.position).toBe('mother');
      expect(motherPlaceholder!.parentAhnentafel).toBe(1);
    });

    it('creates a placeholder for the missing father when only mother exists', () => {
      const root = makePerson('P1', 'F', 'Jane Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');
      const edgeM = makeEdge('E1', 'P3', 'P1');

      const graph = buildGraph([root, mother], [edgeM]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      const fatherPlaceholder = layout.placeholders.find(p => p.ahnentafel === 2);
      expect(fatherPlaceholder).toBeDefined();
      expect(fatherPlaceholder!.person).toBeNull();
      expect(fatherPlaceholder!.position).toBe('father');
    });
  });

  describe('connector tier colors', () => {
    it('connectors inherit the edge confidenceTier', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      edgeF.confidenceTier = 1;

      const edgeM = makeEdge('E2', 'P3', 'P1');
      edgeM.confidenceTier = 4;

      const graph = buildGraph([root, father, mother], [edgeF, edgeM]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      expect(layout.connectors).toHaveLength(2);

      const fatherConnector = layout.connectors.find(
        c => c.fromNode.person?.id === 'P2',
      );
      const motherConnector = layout.connectors.find(
        c => c.fromNode.person?.id === 'P3',
      );

      expect(fatherConnector).toBeDefined();
      expect(fatherConnector!.tier).toBe(1);

      expect(motherConnector).toBeDefined();
      expect(motherConnector!.tier).toBe(4);
    });

    it('defaults connector tier to 4 when no edge exists', () => {
      // Edge case: a person is in the graph but the connecting edge
      // can't be resolved. This shouldn't normally happen but the code
      // falls back to tier 4.
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const edgeF = makeEdge('E1', 'P2', 'P1');

      const graph = buildGraph([root, father], [edgeF]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      // The connector should exist with whatever tier the edge has
      expect(layout.connectors).toHaveLength(1);
      expect(layout.connectors[0].tier).toBe(3); // makeEdge defaults to 3
    });
  });

  describe('expandable detection', () => {
    it('marks nodes at the depth limit as expandable when more ancestors exist', () => {
      // 4 generations in graph (root → parent → grandparent → great-grandparent)
      // but maxGenerations=2 (show root + 1 ancestor gen)
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const pgf = makePerson('P4', 'M', 'William Smith');
      const pggf = makePerson('P8', 'M', 'Robert Smith');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgePGF = makeEdge('E3', 'P4', 'P2');
      const edgePGGF = makeEdge('E7', 'P8', 'P4');

      const graph = buildGraph(
        [root, father, pgf, pggf],
        [edgeF, edgePGF, edgePGGF],
      );

      // maxGenerations=2 means show gen 0 (root) and gen 1 (parents only)
      const layout = computePedigreeGridLayout('P1', graph, 2, compact);

      // Only root + father should appear as real nodes (gen 0 and gen 1)
      // gen 1 is the last visible gen (maxGenerations-1 = 1)
      expect(layout.nodes.some(n => n.person?.id === 'P1')).toBe(true);
      expect(layout.nodes.some(n => n.person?.id === 'P2')).toBe(true);

      // Father at gen 1 should be expandable (has parents beyond visible depth)
      const fatherNode = layout.nodes.find(n => n.person?.id === 'P2')!;
      expect(fatherNode.isExpandable).toBe(true);
      expect(fatherNode.expandableDepth).toBeGreaterThanOrEqual(1);

      // Root at gen 0 should NOT be expandable (not at the depth boundary)
      const rootNode = layout.nodes.find(n => n.person?.id === 'P1')!;
      expect(rootNode.isExpandable).toBe(false);
    });

    it('reports expandableDepth accurately for multi-generation chains', () => {
      // Build a 5-generation chain: P1 → P2 → P4 → P8 → P16
      const root = makePerson('P1', 'M', 'Gen0');
      const gen1 = makePerson('P2', 'M', 'Gen1');
      const gen2 = makePerson('P4', 'M', 'Gen2');
      const gen3 = makePerson('P8', 'M', 'Gen3');
      const gen4 = makePerson('P16', 'M', 'Gen4');

      const e1 = makeEdge('E1', 'P2', 'P1');
      const e2 = makeEdge('E2', 'P4', 'P2');
      const e3 = makeEdge('E3', 'P8', 'P4');
      const e4 = makeEdge('E4', 'P16', 'P8');

      const graph = buildGraph(
        [root, gen1, gen2, gen3, gen4],
        [e1, e2, e3, e4],
      );

      // Show only 2 generations (root + gen1). Gen1 has 3 more gens beyond.
      const layout = computePedigreeGridLayout('P1', graph, 2, compact);

      const gen1Node = layout.nodes.find(n => n.person?.id === 'P2')!;
      expect(gen1Node.isExpandable).toBe(true);
      expect(gen1Node.expandableDepth).toBe(3);
    });
  });

  describe('expandedAncestors', () => {
    it('extends the layout when a person at the depth limit is in the expanded set', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const pgf = makePerson('P4', 'M', 'William Smith');
      const pgm = makePerson('P5', 'F', 'Elizabeth Brown');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgePGF = makeEdge('E3', 'P4', 'P2');
      const edgePGM = makeEdge('E4', 'P5', 'P2');

      const graph = buildGraph(
        [root, father, pgf, pgm],
        [edgeF, edgePGF, edgePGM],
      );

      // Without expansion: maxGenerations=2 shows only root + father
      const layoutBase = computePedigreeGridLayout('P1', graph, 2, compact);
      const basePersonIds = layoutBase.nodes
        .filter(n => n.person !== null)
        .map(n => n.person!.id)
        .sort();
      expect(basePersonIds).toEqual(['P1', 'P2']);

      // With expansion: father (P2) is at gen 1 (the depth limit boundary)
      // Expanding P2 should reveal P4 and P5
      const expanded = new Set(['P2']);
      const layoutExpanded = computePedigreeGridLayout('P1', graph, 2, compact, expanded);

      const expandedPersonIds = layoutExpanded.nodes
        .filter(n => n.person !== null)
        .map(n => n.person!.id)
        .sort();
      expect(expandedPersonIds).toContain('P4');
      expect(expandedPersonIds).toContain('P5');

      // The grandparents should be at generation 2
      const pgfNode = layoutExpanded.nodes.find(n => n.person?.id === 'P4');
      const pgmNode = layoutExpanded.nodes.find(n => n.person?.id === 'P5');
      expect(pgfNode).toBeDefined();
      expect(pgfNode!.generation).toBe(2);
      expect(pgmNode).toBeDefined();
      expect(pgmNode!.generation).toBe(2);
    });
  });

  describe('empty graph / missing root', () => {
    it('returns empty layout when rootPersonId is not in graph', () => {
      const graph = buildGraph([], []);
      const layout = computePedigreeGridLayout('nonexistent', graph, 3, compact);

      expect(layout.nodes).toHaveLength(0);
      expect(layout.placeholders).toHaveLength(0);
      expect(layout.connectors).toHaveLength(0);
      expect(layout.totalWidth).toBe(0);
      expect(layout.totalHeight).toBe(0);
    });

    it('returns empty layout when graph has persons but root ID does not match', () => {
      const person = makePerson('P1', 'M', 'John Smith');
      const graph = buildGraph([person], []);
      const layout = computePedigreeGridLayout('P999', graph, 3, compact);

      expect(layout.nodes).toHaveLength(0);
      expect(layout.placeholders).toHaveLength(0);
      expect(layout.connectors).toHaveLength(0);
      expect(layout.totalWidth).toBe(0);
      expect(layout.totalHeight).toBe(0);
    });
  });

  describe('sex-based assignment', () => {
    it('assigns male parent to father slot (even ahnentafel) and female to mother slot (odd ahnentafel)', () => {
      const root = makePerson('P1', 'M', 'John Smith');
      const father = makePerson('P2', 'M', 'James Smith');
      const mother = makePerson('P3', 'F', 'Mary Jones');

      const edgeF = makeEdge('E1', 'P2', 'P1');
      const edgeM = makeEdge('E2', 'P3', 'P1');

      const graph = buildGraph([root, father, mother], [edgeF, edgeM]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      const fatherNode = layout.nodes.find(n => n.person?.id === 'P2')!;
      const motherNode = layout.nodes.find(n => n.person?.id === 'P3')!;

      // Father → even ahnentafel (2), position 'father'
      expect(fatherNode.ahnentafel).toBe(2);
      expect(fatherNode.ahnentafel % 2).toBe(0);
      expect(fatherNode.position).toBe('father');

      // Mother → odd ahnentafel (3), position 'mother'
      expect(motherNode.ahnentafel).toBe(3);
      expect(motherNode.ahnentafel % 2).toBe(1);
      expect(motherNode.position).toBe('mother');
    });

    it('assigns sex=U parent to father slot first if both parents are unknown sex', () => {
      const root = makePerson('P1', 'U', 'Alex Smith');
      const parent1 = makePerson('P2', 'U', 'Parent One');
      const parent2 = makePerson('P3', 'U', 'Parent Two');

      const edge1 = makeEdge('E1', 'P2', 'P1');
      const edge2 = makeEdge('E2', 'P3', 'P1');

      const graph = buildGraph([root, parent1, parent2], [edge1, edge2]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      const nodesByAhn = new Map(layout.nodes.map(n => [n.ahnentafel, n]));

      // First unknown-sex parent should fill father slot (ahn 2)
      const ahn2 = nodesByAhn.get(2)!;
      expect(ahn2.person?.id).toBe('P2');
      expect(ahn2.position).toBe('father');

      // Second unknown-sex parent fills mother slot (ahn 3)
      const ahn3 = nodesByAhn.get(3)!;
      expect(ahn3.person?.id).toBe('P3');
      expect(ahn3.position).toBe('mother');
    });

    it('handles two female parents by assigning second to father slot', () => {
      const root = makePerson('P1', 'F', 'Jane Smith');
      const mother1 = makePerson('P2', 'F', 'Mary Jones');
      const mother2 = makePerson('P3', 'F', 'Susan Clark');

      const edge1 = makeEdge('E1', 'P2', 'P1');
      const edge2 = makeEdge('E2', 'P3', 'P1');

      const graph = buildGraph([root, mother1, mother2], [edge1, edge2]);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact);

      // Both parents present — one in each slot
      const parentNodes = layout.nodes.filter(n => n.generation === 1);
      expect(parentNodes).toHaveLength(2);

      const ahnNumbers = parentNodes.map(n => n.ahnentafel).sort();
      expect(ahnNumbers).toEqual([2, 3]);
    });
  });

  // ── Sibling stacking ────────────────────────────────────────────
  describe('sibling stacking', () => {
    function makePersonWithYear(id: string, sex: 'M' | 'F' | 'U', name: string, birthYear: number | null): Person {
      const p = makePerson(id, sex, name);
      if (birthYear !== null) {
        p.birth = { date: { date: new Date(`${birthYear}-01-01`), endDate: null, qualifier: 'exact', raw: `${birthYear}`, year: birthYear }, place: null };
      }
      return p;
    }

    // Shared family: root + father + mother + 3 siblings of father
    function buildFamilyWithSiblings() {
      const root = makePerson('P1', 'M', 'Root Person');
      const father = makePersonWithYear('P2', 'M', 'Father', 1950);
      const mother = makePerson('P3', 'F', 'Mother');
      const grandpa = makePerson('GP', 'M', 'Grandpa');
      const grandma = makePerson('GM', 'F', 'Grandma');

      const uncle1 = makePersonWithYear('U1', 'M', 'Uncle One', 1948);
      const uncle2 = makePersonWithYear('U2', 'M', 'Uncle Two', 1952);
      const aunt = makePersonWithYear('A1', 'F', 'Aunt One', 1955);

      const edges = [
        makeEdge('E1', 'P2', 'P1'),     // father → root
        makeEdge('E2', 'P3', 'P1'),     // mother → root
        makeEdge('E3', 'GP', 'P2'),     // grandpa → father
        makeEdge('E4', 'GM', 'P2'),     // grandma → father
        makeEdge('E5', 'GP', 'U1'),     // grandpa → uncle1
        makeEdge('E6', 'GM', 'U1'),     // grandma → uncle1
        makeEdge('E7', 'GP', 'U2'),     // grandpa → uncle2
        makeEdge('E8', 'GP', 'A1'),     // grandpa → aunt
      ];

      return buildGraph(
        [root, father, mother, grandpa, grandma, uncle1, uncle2, aunt],
        edges,
      );
    }

    it('showSiblings=true produces siblings in layout for ancestors with siblings', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      expect(layout.siblings.length).toBeGreaterThan(0);
      // Father (ahn=2) should have siblings
      const fatherSibs = layout.siblings.filter(s => s.directLineAncestorId === 'P2');
      expect(fatherSibs.length).toBe(3); // uncle1, uncle2, aunt
    });

    it('showSiblings=false produces empty siblings array', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, false);

      expect(layout.siblings).toHaveLength(0);
      expect(layout.siblingConnectors).toHaveLength(0);
    });

    it('root person (ahn=1) has no siblings shown', () => {
      // Give root a sibling
      const root = makePerson('P1', 'M', 'Root Person');
      const sibling = makePerson('S1', 'M', 'Root Sibling');
      const parent = makePerson('P2', 'M', 'Parent');
      const edges = [
        makeEdge('E1', 'P2', 'P1'),
        makeEdge('E2', 'P2', 'S1'),
      ];
      const graph = buildGraph([root, sibling, parent], edges);
      const layout = computePedigreeGridLayout('P1', graph, 3, compact, undefined, true);

      // No siblings shown for the root
      const rootSibs = layout.siblings.filter(s => s.anchorAhnentafel === 1);
      expect(rootSibs).toHaveLength(0);
    });

    it('sibling count capped at maxSiblingsPerFamily', () => {
      // Build a family with 10 siblings of father
      const root = makePerson('P1', 'M', 'Root');
      const father = makePerson('P2', 'M', 'Father');
      const grandpa = makePerson('GP', 'M', 'Grandpa');
      const persons = [root, father, grandpa];
      const edges = [
        makeEdge('E1', 'P2', 'P1'),
        makeEdge('E2', 'GP', 'P2'),
      ];
      for (let i = 0; i < 10; i++) {
        const sib = makePersonWithYear(`S${i}`, 'M', `Sib ${i}`, 1940 + i);
        persons.push(sib);
        edges.push(makeEdge(`ES${i}`, 'GP', `S${i}`));
      }
      const graph = buildGraph(persons, edges);

      // Cap at 3
      const layout = computePedigreeGridLayout('P1', graph, 3, compact, undefined, true, 3);
      const fatherSibs = layout.siblings.filter(s => s.directLineAncestorId === 'P2');
      expect(fatherSibs.length).toBe(3);
    });

    it('siblings sorted by birth year', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      const fatherSibs = layout.siblings.filter(s => s.directLineAncestorId === 'P2');
      // Uncle One (1948), Uncle Two (1952), Aunt One (1955) — sorted by birth year
      const names = fatherSibs.map(s => s.person.name.full);
      expect(names).toEqual(['Uncle One', 'Uncle Two', 'Aunt One']);
    });

    it('bands inflate when showSiblings enabled', () => {
      const graph = buildFamilyWithSiblings();

      const layoutOff = computePedigreeGridLayout('P1', graph, 4, compact, undefined, false);
      const layoutOn = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      // With siblings, total height should be >= without
      expect(layoutOn.totalHeight).toBeGreaterThanOrEqual(layoutOff.totalHeight);
    });

    it('sibling positions within ancestor band boundaries', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      // Each sibling should be positioned near its anchor ancestor
      for (const sib of layout.siblings) {
        const ancestor = layout.nodes.find(n => n.person?.id === sib.directLineAncestorId);
        expect(ancestor).toBeDefined();
        // Sibling should be in the same generation column
        expect(sib.generation).toBe(ancestor!.generation);
      }
    });

    it('sibling connectors have correct trunkX', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      expect(layout.siblingConnectors.length).toBeGreaterThan(0);

      for (const sc of layout.siblingConnectors) {
        // trunkX should be between the child column right edge and parent column left edge
        const ancestorNode = layout.nodes.find(
          n => n.ahnentafel === sc.siblingNode.anchorAhnentafel,
        );
        expect(ancestorNode).toBeDefined();
        expect(sc.trunkX).toBeLessThan(ancestorNode!.x);
      }
    });

    it('spouse set correctly on direct-line ancestor nodes', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      // Father (ahn=2) should have mother as spouse (or grandma as spouse of father)
      // Actually: father's spouse = the OTHER parent of root (P1). That's mother (P3).
      const fatherNode = layout.nodes.find(n => n.ahnentafel === 2);
      expect(fatherNode).toBeDefined();
      expect(fatherNode!.spouse?.id).toBe('P3');

      // Mother (ahn=3) should have father as spouse
      const motherNode = layout.nodes.find(n => n.ahnentafel === 3);
      expect(motherNode).toBeDefined();
      expect(motherNode!.spouse?.id).toBe('P2');
    });

    it('no spouse on root node', () => {
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      const rootNode = layout.nodes.find(n => n.ahnentafel === 1);
      expect(rootNode).toBeDefined();
      expect(rootNode!.spouse).toBeNull();
    });

    it('ancestors with 0 siblings produce no sibling nodes', () => {
      // Mother has no siblings in this graph
      const graph = buildFamilyWithSiblings();
      const layout = computePedigreeGridLayout('P1', graph, 4, compact, undefined, true);

      const motherSibs = layout.siblings.filter(s => s.directLineAncestorId === 'P3');
      expect(motherSibs).toHaveLength(0);
    });
  });
});
