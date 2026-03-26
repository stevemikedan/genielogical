import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { NotableAncestor, NotableCategory, StoryPathResult } from '@/types/story-path.ts';
import type { BridgeZone } from '@/types/bridge.ts';
import { matchPatterns } from './notable-patterns.ts';
import { detectBridgeZones } from './bridge-detector.ts';

interface AncestorInfo {
  personId: string;
  generation: number;
  path: string[];
}

/**
 * Find notable ancestors by BFS from the subject, matching each ancestor
 * against the pattern dictionaries.
 */
export function findNotableAncestors(
  graph: TreeGraph,
  subjectId: string,
): StoryPathResult {
  const subject = graph.persons.get(subjectId);
  if (!subject) {
    return { subjectId, notableAncestors: [], byCategory: new Map() };
  }

  // BFS upward through primary parent edges
  const visited = new Set<string>();
  const queue: AncestorInfo[] = [{ personId: subjectId, generation: 0, path: [subjectId] }];
  visited.add(subjectId);

  const notableAncestors: NotableAncestor[] = [];
  const seenNotables = new Set<string>(); // Deduplicate by personId

  while (queue.length > 0) {
    const current = queue.shift()!;
    const person = graph.persons.get(current.personId);
    if (!person) continue;

    // Check for pattern matches on this person
    if (current.generation > 0) {
      const nameToCheck = person.name.full + ' ' + person.name.raw;
      const matches = matchPatterns(nameToCheck);

      if (matches.length > 0 && !seenNotables.has(person.id)) {
        seenNotables.add(person.id);

        // Compute chain confidence (weakest tier in path)
        let chainConfidence: ConfidenceTier = 1;
        for (let i = 0; i < current.path.length - 1; i++) {
          const childId = current.path[i];
          const parentId = current.path[i + 1];
          const edges = graph.parentEdges.get(childId) ?? [];
          const edge = edges.find(e => e.parentId === parentId && e.isPrimary);
          if (edge && edge.confidenceTier > chainConfidence) {
            chainConfidence = edge.confidenceTier as ConfidenceTier;
          }
        }

        // Detect bridge zones in this path
        const bridgeZones = detectBridgeZones(graph, current.path);
        const primaryBridgeZone: BridgeZone | null = bridgeZones.length > 0 ? bridgeZones[0] : null;

        // Use the first match's category and significance
        const firstMatch = matches[0];
        const notable: NotableAncestor = {
          personId: person.id,
          name: person.name.full,
          birthYear: person.birth.date?.year ?? null,
          deathYear: person.death.date?.year ?? null,
          category: firstMatch.category as NotableCategory,
          matchRule: firstMatch.pattern.source,
          significance: firstMatch.significance,
          generationsFromSubject: current.generation,
          pathToSubject: current.path,
          chainConfidence,
          bridgeZone: primaryBridgeZone,
        };

        notableAncestors.push(notable);
      }
    }

    // Enqueue parents
    const parentEdges = graph.parentEdges.get(current.personId) ?? [];
    for (const edge of parentEdges) {
      if (!edge.isPrimary) continue;
      if (visited.has(edge.parentId)) continue;
      visited.add(edge.parentId);

      queue.push({
        personId: edge.parentId,
        generation: current.generation + 1,
        path: [...current.path, edge.parentId],
      });
    }
  }

  // Group by category
  const byCategory = new Map<NotableCategory, NotableAncestor[]>();
  for (const notable of notableAncestors) {
    const existing = byCategory.get(notable.category) ?? [];
    existing.push(notable);
    byCategory.set(notable.category, existing);
  }

  return { subjectId, notableAncestors, byCategory };
}
