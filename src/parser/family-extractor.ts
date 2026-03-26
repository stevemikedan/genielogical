/**
 * Converts FAM (family) GEDCOM record nodes into ParsedFamily objects.
 */

import type { ParsedFamily } from '@/types/family.ts';
import type { LifeEvent } from '@/types/common.ts';
import type { GedcomNode } from './record-builder.ts';
import { parseGedcomDate } from './date-normalizer.ts';
import { normalizePlace } from './place-normalizer.ts';

/** Map of family-level event tags to LifeEvent type values */
const FAMILY_EVENT_TAGS: Record<string, LifeEvent['type']> = {
  MARR: 'marriage',
  DIV: 'divorce',
  ANUL: 'divorce',
  EVEN: 'other',
  CENS: 'census',
};

/**
 * Find a direct child node by tag.
 */
function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/**
 * Find all direct child nodes with a given tag.
 */
function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/**
 * Convert a FAM GEDCOM record node into a ParsedFamily object.
 */
export function extractFamily(node: GedcomNode): ParsedFamily {
  const xref = node.xref || node.value || '';

  // HUSB and WIFE xrefs
  const husbNode = findChild(node, 'HUSB');
  const wifeNode = findChild(node, 'WIFE');
  const husbandId = husbNode?.value?.trim() || null;
  const wifeId = wifeNode?.value?.trim() || null;

  // CHIL xrefs
  const childIds = findChildren(node, 'CHIL')
    .map((c) => c.value.trim())
    .filter(Boolean);

  // Marriage event (MARR)
  const marrNode = findChild(node, 'MARR');
  let marriageDate = null;
  let marriagePlace = null;
  if (marrNode) {
    const dateNode = findChild(marrNode, 'DATE');
    const placeNode = findChild(marrNode, 'PLAC');
    marriageDate = dateNode ? parseGedcomDate(dateNode.value) : null;
    marriagePlace = placeNode ? normalizePlace(placeNode.value) : null;
  }

  // Divorce event (DIV)
  const divNode = findChild(node, 'DIV');
  let divorceDate = null;
  if (divNode) {
    const dateNode = findChild(divNode, 'DATE');
    divorceDate = dateNode ? parseGedcomDate(dateNode.value) : null;
  }

  // All family-level events
  const events: LifeEvent[] = [];
  for (const child of node.children) {
    if (child.tag in FAMILY_EVENT_TAGS) {
      const type = FAMILY_EVENT_TAGS[child.tag];
      const dateNode = findChild(child, 'DATE');
      const placeNode = findChild(child, 'PLAC');
      const noteNode = findChild(child, 'NOTE');

      const sourceIds = findChildren(child, 'SOUR')
        .map((s) => s.value)
        .filter(Boolean);

      events.push({
        type,
        date: dateNode ? parseGedcomDate(dateNode.value) : null,
        place: placeNode ? normalizePlace(placeNode.value) : null,
        notes: noteNode?.value ?? '',
        sourceIds,
      });
    }
  }

  // Collect source references on the family itself
  const sourceIds = findChildren(node, 'SOUR')
    .map((s) => s.value)
    .filter(Boolean);

  return {
    id: xref,
    husbandId,
    wifeId,
    childIds,
    marriageDate,
    marriagePlace,
    divorceDate,
    events,
    sourceIds,
  };
}
