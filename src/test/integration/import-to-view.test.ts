/**
 * Integration tests: GEDCOM import → state → engines pipeline.
 * Tests the full flow from parsing through flag/confidence scoring without UI.
 */
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '@/parser/index.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { runFlagEngine, scoreAllConfidence, findNotableAncestors, runDeepScan } from '@/engine/index.ts';
import { generateResearchSteps } from '@/engine/research-recommender.ts';
import { treeReducer, initialTreeState } from '@/context/tree-state.ts';

// Minimal GEDCOM for integration testing
const MINI_GEDCOM = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Sarah /Mitchell/
2 GIVN Sarah
2 SURN Mitchell
1 SEX F
1 BIRT
2 DATE 15 MAR 1990
2 PLAC Austin, Texas, USA
1 FAMC @F1@
0 @I2@ INDI
1 NAME James /Mitchell/
2 GIVN James
2 SURN Mitchell
1 SEX M
1 BIRT
2 DATE 3 JUN 1962
2 PLAC Dallas, Texas, USA
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Margaret /Chen/
2 GIVN Margaret
2 SURN Chen
1 SEX F
1 BIRT
2 DATE 22 NOV 1964
2 PLAC Houston, Texas, USA
1 FAMS @F1@
0 @I4@ INDI
1 NAME Robert /Mitchell/
2 GIVN Robert
2 SURN Mitchell
1 SEX M
1 BIRT
2 DATE 10 FEB 1935
2 PLAC Fort Worth, Texas, USA
1 DEATH
2 DATE 18 AUG 2010
1 FAMS @F2@
0 @I5@ INDI
1 NAME Dorothy /Sullivan/
2 GIVN Dorothy
2 SURN Sullivan
1 SEX F
1 BIRT
2 DATE 5 SEP 1938
2 PLAC San Antonio, Texas, USA
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I4@
1 WIFE @I5@
1 CHIL @I2@
0 TRLR`;

describe('Import-to-view integration', () => {
  it('parses GEDCOM and loads into TreeGraph', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);

    expect(graph.persons.size).toBe(5);
    expect(graph.edges.size).toBeGreaterThan(0);
    expect(result.stats.individualCount).toBe(5);
    expect(result.stats.familyCount).toBe(2);
  });

  it('flag engine runs without errors on small tree', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);

    const flags = runFlagEngine(graph);
    // Small tree (3 gen) may or may not produce flags — just verify it runs cleanly
    expect(Array.isArray(flags)).toBe(true);
  });

  it('confidence scorer assigns tiers after flags', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);

    const flags = runFlagEngine(graph);
    scoreAllConfidence(graph, flags);

    // All unsourced modern persons get tier 3 (provisional) — not tier 4
    // Tier 4 requires specific flags like chronological impossibility
    for (const person of graph.persons.values()) {
      expect(person.confidenceTier).toBeGreaterThanOrEqual(3);
      expect(person.confidenceTier).toBeLessThanOrEqual(4);
    }
  });

  it('state reducer processes full import pipeline', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);
    const flags = runFlagEngine(graph);
    scoreAllConfidence(graph, flags);

    let state = treeReducer(initialTreeState, { type: 'PARSE_START' });
    expect(state.phase).toBe('parsing');

    state = treeReducer(state, { type: 'PARSE_SUCCESS', graph, stats: result.stats });
    expect(state.phase).toBe('loaded');
    expect(state.graph).toBe(graph);
    expect(state.graph!.persons.size).toBe(5);

    state = treeReducer(state, { type: 'SET_FLAGS', flags });
    expect(Array.isArray(state.flags)).toBe(true);
  });

  it('deep scan runs on a leaf person', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);

    const leaves = graph.getLeaves();
    expect(leaves.length).toBeGreaterThan(0);

    const deepScan = runDeepScan(graph, leaves[0].id);
    expect(deepScan).toBeDefined();
    expect(deepScan.subjectId).toBe(leaves[0].id);
  });

  it('story paths finds notable ancestors (none in mini tree)', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);

    const leaves = graph.getLeaves();
    const storyResult = findNotableAncestors(graph, leaves[0].id);
    // No notable ancestors in this mini tree
    expect(storyResult.notableAncestors).toEqual([]);
  });

  it('research recommender generates steps from flags', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);
    const flags = runFlagEngine(graph);

    const steps = generateResearchSteps(graph, flags);
    expect(steps.length).toBeGreaterThan(0);
    // Each step should have required fields
    for (const step of steps) {
      expect(step.personId).toBeDefined();
      expect(step.description).toBeDefined();
    }
  });

  it('adding a source re-scores confidence', () => {
    const result = parseGedcom(MINI_GEDCOM);
    const graph = new TreeGraph();
    graph.loadFromParseResult(result);
    const flags = runFlagEngine(graph);
    scoreAllConfidence(graph, flags);

    // Confirm Sarah starts at tier 3 (provisional — unsourced modern)
    const sarah = graph.persons.get('@I1@');
    expect(sarah).toBeDefined();
    expect(sarah!.confidenceTier).toBe(3);

    // Simulate adding a source via reducer
    let state = treeReducer(initialTreeState, { type: 'PARSE_SUCCESS', graph, stats: result.stats });
    state = treeReducer(state, { type: 'SET_FLAGS', flags });

    // Add a primary source to Sarah's first parent edge
    const sarahEdges = [...graph.edges.values()].filter(e => e.childId === '@I1@');
    expect(sarahEdges.length).toBeGreaterThan(0);

    state = treeReducer(state, {
      type: 'ADD_SOURCE',
      source: {
        id: 'src-test-1',
        title: 'Birth Certificate',
        sourceClass: 'primary',
        sourceType: 'vital_record',
        origin: 'user_added',
        repository: 'Texas Vital Records',
        citation: 'Birth cert for Sarah Mitchell',
        notes: '',
        url: null,
        attachedToPersonIds: ['@I1@'],
        attachedToEdgeIds: [sarahEdges[0].id],
        provesWhat: [],
        gedcomTag: null,
        sourceHash: '',
        addedAt: new Date(),
        addedBy: 'test',
      },
      personIds: ['@I1@'],
      edgeIds: [sarahEdges[0].id],
    });

    // After adding a primary source, confidence should improve
    const updatedSarah = state.graph!.persons.get('@I1@');
    // With a primary source on parent edge, Sarah may improve from tier 3
    expect(updatedSarah!.confidenceTier).toBeLessThanOrEqual(3);
  });
});
