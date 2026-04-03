/**
 * Shared test factories and helpers.
 * Import these in test files to avoid repeating boilerplate.
 */
import type { Person, PersonName } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { ParseStats } from '@/types/index.ts';
import type { TreeState } from '@/context/tree-state.ts';
import { initialTreeState } from '@/context/tree-state.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';

// ---- Person factory ----

type MakePersonOverrides = Omit<Partial<Person>, 'name'> & { id: string; name?: Partial<PersonName> };

export function makePerson(overrides: MakePersonOverrides): Person {
  const given = overrides.name?.given ?? 'Test';
  const surname = overrides.name?.surname ?? 'Person';
  const full = overrides.name?.full ?? `${given} ${surname}`;
  const name = {
    full,
    given,
    middle: '',
    surname,
    maidenName: '',
    prefix: '',
    suffix: '',
    raw: full,
    ...overrides.name,
  };
  const { name: _nameOverride, ...restOverrides } = overrides;
  return {
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test default',
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...restOverrides,
    name,
  };
}

// ---- Edge factory ----

export function makeEdge(overrides: Partial<Edge> & { id: string; parentId: string; childId: string }): Edge {
  return {
    relationshipType: 'biological',
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'test default',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---- Source factory ----

export function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    origin: 'user_added',
    sourceClass: 'secondary',
    sourceType: 'census',
    title: 'Test Source',
    citation: '',
    notes: '',
    url: null,
    repository: null,
    provesWhat: [],
    attachedToPersonIds: [],
    attachedToEdgeIds: [],
    gedcomTag: null,
    sourceHash: '',
    addedAt: new Date('2024-01-01'),
    addedBy: 'test',
    ...overrides,
  };
}

// ---- Flag factory ----

export function makeFlag(overrides: Partial<Flag> & { id: string }): Flag {
  return {
    category: 'chronological',
    severity: 'warning',
    title: 'Test Flag',
    description: 'Test flag description',
    suggestedAction: 'Investigate',
    ruleId: 'test-rule',
    affectedPersonIds: [],
    affectedEdgeIds: [],
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date('2024-01-01'),
    resolvedAt: null,
    ...overrides,
  };
}

// ---- Stats factory ----

export function makeStats(overrides: Partial<ParseStats> = {}): ParseStats {
  return {
    individualCount: 10,
    familyCount: 5,
    sourceCount: 2,
    edgeCount: 15,
    generationCount: 3,
    parseTimeMs: 42,
    gedcomVersion: '5.5.1',
    charset: 'UTF-8',
    software: 'TestApp',
    warningCount: 0,
    errorCount: 0,
    ...overrides,
  };
}

// ---- Graph factory ----

export function makeGraph(persons: Person[] = [], edges: Edge[] = [], sources: Source[] = []): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.addPerson(p);
  for (const e of edges) graph.addEdge(e);
  for (const s of sources) graph.sources.set(s.id, s);
  return graph;
}

// ---- Loaded state factory ----

export function createLoadedState(overrides: Partial<TreeState> = {}): TreeState {
  const graph = overrides.graph ?? new TreeGraph();
  return {
    ...initialTreeState,
    phase: 'loaded',
    graph,
    stats: makeStats({
      individualCount: graph.persons.size,
      edgeCount: graph.edges.size,
      sourceCount: graph.sources.size,
    }),
    ...overrides,
  };
}
