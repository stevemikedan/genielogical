import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';

/**
 * Fan chart layout engine.
 *
 * Computes radial positions for ancestors arranged in concentric rings.
 * Subject sits at center; each generation radiates outward.
 * Wedge angular width = parentAngle / 2 (each generation doubles the slots).
 *
 * Supports semicircle (Math.PI span) and full circle (2*PI span) modes.
 */

export type FanMode = 'semi' | 'full';

export interface FanChartNode {
  personId: string;
  person: Person | null;         // null = empty slot (research gap)
  edge: Edge | null;             // edge connecting this person to their child in the fan
  generation: number;            // 0 = subject, 1 = parents, 2 = grandparents ...
  ahnentafel: number;            // Ahnentafel number (1-based)
  startAngle: number;            // radians
  endAngle: number;              // radians
  innerRadius: number;           // px from center
  outerRadius: number;           // px from center
  confidenceTier: ConfidenceTier;
  isNotable: boolean;
  hasFlags: boolean;
  isEmpty: boolean;              // no person data (gap)
  depthBeyond: number;           // generations available beyond maxGenerations
}

export interface FanChartLayout {
  nodes: FanChartNode[];
  centerX: number;
  centerY: number;
  totalRadius: number;
  mode: FanMode;
  maxGeneration: number;         // actual deepest generation rendered
}

export interface FanLayoutConfig {
  maxGenerations: number;        // how many rings to show (default 8)
  mode: FanMode;                 // 'semi' or 'full'
  baseRadius: number;            // radius of innermost ring inner edge (default 60)
  ringGap: number;               // gap between rings (default 2)
  showEmptySlots: boolean;       // render empty wedges for gaps (default true)
}

const DEFAULT_CONFIG: FanLayoutConfig = {
  maxGenerations: 8,
  mode: 'semi',
  baseRadius: 60,
  ringGap: 2,
  showEmptySlots: true,
};

/**
 * Compute ring inner/outer radius for a generation.
 * Uses a slightly decreasing ring width as generations increase
 * (outer rings are thinner for readability).
 */
function computeRingRadii(
  generation: number,
  config: FanLayoutConfig,
): { inner: number; outer: number } {
  // Generation 0 (subject) is not a ring — it's at center
  // Generation 1 starts at baseRadius
  if (generation <= 0) return { inner: 0, outer: 0 };

  // Ring width decreases logarithmically: wider inner rings, thinner outer ones
  // Base ring width for gen 1
  const baseWidth = 55;
  let currentRadius = config.baseRadius;

  for (let g = 1; g < generation; g++) {
    const width = baseWidth * Math.max(0.5, 1 - 0.05 * (g - 1));
    currentRadius += width + config.ringGap;
  }

  const width = baseWidth * Math.max(0.5, 1 - 0.05 * (generation - 1));
  return {
    inner: currentRadius,
    outer: currentRadius + width,
  };
}

/**
 * Count how many more ancestor generations exist beyond a person.
 */
function countDepthBeyond(personId: string, graph: TreeGraph, maxDepth: number = 50): number {
  let depth = 0;
  const visited = new Set<string>();
  const queue = [personId];

  while (queue.length > 0 && depth < maxDepth) {
    const nextLevel: string[] = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      const parentEdges = graph.parentEdges.get(id) ?? [];
      for (const e of parentEdges) {
        if (e.isPrimary && !visited.has(e.parentId) && graph.persons.has(e.parentId)) {
          nextLevel.push(e.parentId);
        }
      }
    }
    if (nextLevel.length === 0) break;
    depth++;
    queue.length = 0;
    queue.push(...nextLevel);
  }

  return depth;
}

/**
 * Build a fan chart layout from a root person.
 *
 * Uses ahnentafel numbering:
 *   Subject = 1
 *   Father = 2, Mother = 3
 *   Paternal GF = 4, Paternal GM = 5, Maternal GF = 6, Maternal GM = 7
 *   etc.
 *
 * For each ahnentafel slot, we compute the angular position within the fan.
 */
export function computeFanChartLayout(
  rootPersonId: string,
  graph: TreeGraph,
  config: Partial<FanLayoutConfig> = {},
): FanChartLayout | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rootPerson = graph.persons.get(rootPersonId);
  if (!rootPerson) return null;

  const totalAngle = cfg.mode === 'full' ? Math.PI * 2 : Math.PI;
  // For semicircle: angles from -PI/2 to PI/2 (fan opens upward)
  // For full circle: angles from 0 to 2*PI
  const startOffset = cfg.mode === 'full' ? 0 : -Math.PI / 2;

  const nodes: FanChartNode[] = [];

  // Map ahnentafel -> person ID for traversal
  const ahnentafelMap = new Map<number, { personId: string; edge: Edge | null }>();
  ahnentafelMap.set(1, { personId: rootPersonId, edge: null });

  // BFS through ancestors via ahnentafel numbering
  for (let gen = 0; gen < cfg.maxGenerations; gen++) {
    const genStart = Math.pow(2, gen);     // first ahnentafel in this generation
    const genEnd = Math.pow(2, gen + 1);   // first ahnentafel in NEXT generation
    const slotsInGen = genEnd - genStart;  // 2^gen slots

    for (let slot = 0; slot < slotsInGen; slot++) {
      const ahn = genStart + slot;
      const entry = ahnentafelMap.get(ahn);

      // Compute angular position
      const slotFraction = slot / slotsInGen;
      const wedgeWidth = totalAngle / slotsInGen;
      const slotStartAngle = startOffset + slotFraction * totalAngle;
      const slotEndAngle = slotStartAngle + wedgeWidth;

      // Compute radial position
      const { inner, outer } = computeRingRadii(gen, cfg);

      if (gen === 0) {
        // Subject node — not rendered as a wedge, rendered as center circle
        // Still include in layout for data purposes
        if (entry) {
          const person = graph.persons.get(entry.personId);
          if (person) {
            nodes.push({
              personId: person.id,
              person,
              edge: null,
              generation: 0,
              ahnentafel: 1,
              startAngle: 0,
              endAngle: totalAngle,
              innerRadius: 0,
              outerRadius: cfg.baseRadius - 5,
              confidenceTier: person.confidenceTier,
              isNotable: false,
              hasFlags: person.flagIds.length > 0,
              isEmpty: false,
              depthBeyond: 0,
            });
          }
        }

        // Populate parents for next generation
        if (entry) {
          const parentEdges = graph.parentEdges.get(entry.personId) ?? [];
          for (const e of parentEdges) {
            if (!e.isPrimary) continue;
            const parent = graph.persons.get(e.parentId);
            if (!parent) continue;

            // Father = ahn*2, Mother = ahn*2+1
            const parentAhn = parent.sex === 'F' ? ahn * 2 + 1 : ahn * 2;
            ahnentafelMap.set(parentAhn, { personId: parent.id, edge: e });

            // Also set the other slot if not taken
            const otherAhn = parent.sex === 'F' ? ahn * 2 : ahn * 2 + 1;
            if (!ahnentafelMap.has(otherAhn)) {
              // Check if there's another parent
              const otherEdge = parentEdges.find(oe => oe.isPrimary && oe.parentId !== parent.id);
              if (otherEdge) {
                const otherParent = graph.persons.get(otherEdge.parentId);
                if (otherParent) {
                  ahnentafelMap.set(otherAhn, { personId: otherParent.id, edge: otherEdge });
                }
              }
            }
          }
        }

        continue;
      }

      // Generations 1+: render as wedges
      if (entry) {
        const person = graph.persons.get(entry.personId);
        if (person) {
          const atLimit = gen === cfg.maxGenerations - 1;
          const depthBeyond = atLimit ? countDepthBeyond(person.id, graph) : 0;

          nodes.push({
            personId: person.id,
            person,
            edge: entry.edge,
            generation: gen,
            ahnentafel: ahn,
            startAngle: slotStartAngle,
            endAngle: slotEndAngle,
            innerRadius: inner,
            outerRadius: outer,
            confidenceTier: entry.edge?.confidenceTier ?? person.confidenceTier,
            isNotable: false,
            hasFlags: person.flagIds.length > 0,
            isEmpty: false,
            depthBeyond,
          });

          // Populate this person's parents for next generation
          const parentEdges = graph.parentEdges.get(person.id) ?? [];
          const primaryParentEdges = parentEdges.filter(e => e.isPrimary);

          // Father goes to ahn*2, Mother to ahn*2+1
          for (const pe of primaryParentEdges) {
            const parentPerson = graph.persons.get(pe.parentId);
            if (!parentPerson) continue;

            const parentAhn = parentPerson.sex === 'F' ? ahn * 2 + 1 : ahn * 2;
            if (!ahnentafelMap.has(parentAhn)) {
              ahnentafelMap.set(parentAhn, { personId: parentPerson.id, edge: pe });
            } else {
              // Slot taken, try the other
              const otherAhn = parentPerson.sex === 'F' ? ahn * 2 : ahn * 2 + 1;
              if (!ahnentafelMap.has(otherAhn)) {
                ahnentafelMap.set(otherAhn, { personId: parentPerson.id, edge: pe });
              }
            }
          }
        }
      } else if (cfg.showEmptySlots && gen > 0) {
        // Empty slot — research gap
        nodes.push({
          personId: `empty-${ahn}`,
          person: null,
          edge: null,
          generation: gen,
          ahnentafel: ahn,
          startAngle: slotStartAngle,
          endAngle: slotEndAngle,
          innerRadius: inner,
          outerRadius: outer,
          confidenceTier: 4,
          isNotable: false,
          hasFlags: false,
          isEmpty: true,
          depthBeyond: 0,
        });
      }
    }
  }

  // Compute total radius
  const { outer: maxOuter } = computeRingRadii(cfg.maxGenerations - 1, cfg);

  return {
    nodes,
    centerX: 0,
    centerY: cfg.mode === 'semi' ? maxOuter + 20 : 0,
    totalRadius: maxOuter,
    mode: cfg.mode,
    maxGeneration: cfg.maxGenerations - 1,
  };
}
