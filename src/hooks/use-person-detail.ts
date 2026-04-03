import { useMemo } from 'react';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { Conjecture } from '@/types/conjecture.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { buildProofLadder } from '@/graph/proof-ladder.ts';
import type { ProofLadder } from '@/graph/proof-ladder.ts';
import type { NotableAncestor } from '@/types/story-path.ts';

export interface ParentWithEdge {
  person: Person;
  edge: Edge;
}

export interface PersonDetail {
  person: Person;
  parents: ParentWithEdge[];
  children: Person[];
  siblings: Person[];
  spouses: Person[];
  parentEdges: Edge[];
  parallelEdges: Edge[];
  sources: Source[];
  flags: Flag[];
  conjectures: Conjecture[];
  proofLadder: ProofLadder | null;
}

export function usePersonDetail(
  personId: string | null,
  graph: TreeGraph | null,
  flags: Flag[],
  conjectures: Map<string, Conjecture>,
  notableAncestors?: NotableAncestor[],
): PersonDetail | null {
  return useMemo(() => {
    if (!personId || !graph) return null;
    const person = graph.persons.get(personId);
    if (!person) return null;

    // Parents with their edges
    const pEdges = graph.parentEdges.get(personId) ?? [];
    const parents: ParentWithEdge[] = [];
    for (const edge of pEdges) {
      const parent = graph.persons.get(edge.parentId);
      if (parent) parents.push({ person: parent, edge });
    }

    // Children, siblings, spouses
    const children = graph.getChildren(personId);
    const siblings = graph.getSiblings(personId);
    const spouses = graph.getSpouses(personId);

    // Parallel edges (all edges in any parallel group this person is part of)
    const parallelEdges: Edge[] = [];
    const seenGroups = new Set<string>();
    for (const edge of pEdges) {
      if (edge.parallelGroupId && !seenGroups.has(edge.parallelGroupId)) {
        seenGroups.add(edge.parallelGroupId);
        for (const e of graph.edges.values()) {
          if (e.parallelGroupId === edge.parallelGroupId) {
            parallelEdges.push(e);
          }
        }
      }
    }

    // Sources
    const sources: Source[] = [];
    for (const sid of person.sourceIds) {
      const source = graph.sources.get(sid);
      if (source) sources.push(source);
    }

    // Flags for this person
    const personFlags = flags.filter(f => f.affectedPersonIds.includes(personId));

    // Conjectures
    const personConjectures: Conjecture[] = [];
    for (const cid of person.conjectureIds) {
      const c = conjectures.get(cid);
      if (c) personConjectures.push(c);
    }

    // Proof ladder (with notable ancestor path cross-references)
    const proofLadder = buildProofLadder(personId, graph, notableAncestors);

    return {
      person,
      parents,
      children,
      siblings,
      spouses,
      parentEdges: pEdges,
      parallelEdges,
      sources,
      flags: personFlags,
      conjectures: personConjectures,
      proofLadder,
    };
  }, [personId, graph, flags, conjectures, notableAncestors]);
}
