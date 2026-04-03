/**
 * Builds Edge objects from ParsedFamily arrays.
 * Creates parent-to-child edges, handles parallel paths
 * for children appearing in multiple families, and detects
 * relationship type from PEDI sub-tags.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Edge, RelationshipType } from '@/types/edge.ts';
import type { ParsedFamily } from '@/types/family.ts';
import type { GedcomNode } from './record-builder.ts';

/** Map GEDCOM PEDI values to our RelationshipType */
const PEDI_MAP: Record<string, RelationshipType> = {
  birth: 'biological',
  adopted: 'adoptive',
  foster: 'foster',
  sealing: 'sealing',
  step: 'step',
};

/**
 * Extract PEDI (pedigree) sub-tag information from INDI records.
 * Returns a map of childXref -> familyXref -> RelationshipType.
 */
export function extractPediInfo(
  indiRecords: GedcomNode[]
): Map<string, Map<string, RelationshipType>> {
  const pediMap = new Map<string, Map<string, RelationshipType>>();

  for (const indi of indiRecords) {
    const xref = indi.xref || '';
    if (!xref) continue;

    for (const child of indi.children) {
      if (child.tag === 'FAMC' && child.value) {
        const famXref = child.value.trim();
        // Look for PEDI sub-tag
        const pediNode = child.children.find((c) => c.tag === 'PEDI');
        if (pediNode && pediNode.value) {
          const pediVal = pediNode.value.toLowerCase().trim();
          const relType = PEDI_MAP[pediVal] ?? 'unknown';
          let childMap = pediMap.get(xref);
          if (!childMap) {
            childMap = new Map();
            pediMap.set(xref, childMap);
          }
          childMap.set(famXref, relType);
        }
      }
    }
  }

  return pediMap;
}

/**
 * Build edges from parsed families.
 *
 * For each family, creates edges from each parent to each child.
 * If a child appears as CHIL in multiple families, creates a
 * parallel group with the first family's edges as primary.
 */
export function buildEdges(
  families: ParsedFamily[],
  indiRecords: GedcomNode[]
): Edge[] {
  const edges: Edge[] = [];
  const now = new Date();

  // Build PEDI info from INDI records
  const pediInfo = extractPediInfo(indiRecords);

  // Track which families each child belongs to, for parallel path detection
  const childToFamilies = new Map<string, string[]>();
  for (const fam of families) {
    for (const childId of fam.childIds) {
      const existing = childToFamilies.get(childId);
      if (existing) {
        existing.push(fam.id);
      } else {
        childToFamilies.set(childId, [fam.id]);
      }
    }
  }

  // Generate parallel group IDs for children in multiple families
  const childParallelGroup = new Map<string, string>();
  for (const [childId, famIds] of childToFamilies) {
    if (famIds.length > 1) {
      childParallelGroup.set(childId, uuidv4());
    }
  }

  for (const fam of families) {
    const parentIds: string[] = [];
    if (fam.husbandId) parentIds.push(fam.husbandId);
    if (fam.wifeId) parentIds.push(fam.wifeId);

    for (const childId of fam.childIds) {
      // Determine relationship type from PEDI sub-tag
      const childPediMap = pediInfo.get(childId);
      const pediRelType = childPediMap?.get(fam.id);
      const relationshipType: RelationshipType = pediRelType ?? 'biological';

      // Determine if this is a parallel path edge
      const parallelGroupId = childParallelGroup.get(childId) ?? null;
      const childFamilies = childToFamilies.get(childId);
      const isPrimary = parallelGroupId === null || (childFamilies !== undefined && childFamilies[0] === fam.id);

      for (const parentId of parentIds) {
        edges.push({
          id: uuidv4(),
          parentId,
          childId,
          relationshipType,
          legitimacy: 'unknown',
          marriage: null,
          confidenceTier: 3,
          confidenceReason: 'GEDCOM import — no sources evaluated',
          parallelGroupId,
          isPrimary,
          pathLabel: null,
          sourceIds: [...fam.sourceIds],
          flagIds: [],
          familyGedcomXref: fam.id || null,
          assertedBy: 'gedcom_import',
          assertedAt: now,
          createdAt: now,
        });
      }
    }
  }

  return edges;
}
