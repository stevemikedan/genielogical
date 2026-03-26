/**
 * Extracts metadata from the HEAD record of a GEDCOM file:
 * - GEDCOM version
 * - Character set
 * - Source software
 */

import type { GedcomNode } from './record-builder.ts';

export interface GedcomFormat {
  version: string | null;
  charset: string | null;
  software: string | null;
}

/**
 * Find a direct child node by tag.
 */
function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/**
 * Extract format metadata from the HEAD record.
 */
export function detectFormat(records: GedcomNode[]): GedcomFormat {
  const head = records.find((r) => r.tag === 'HEAD');
  if (!head) {
    return { version: null, charset: null, software: null };
  }

  // GEDCOM version: HEAD > GEDC > VERS
  let version: string | null = null;
  const gedc = findChild(head, 'GEDC');
  if (gedc) {
    const vers = findChild(gedc, 'VERS');
    if (vers) {
      version = vers.value || null;
    }
  }

  // Character set: HEAD > CHAR
  let charset: string | null = null;
  const charNode = findChild(head, 'CHAR');
  if (charNode) {
    charset = charNode.value || null;
  }

  // Software: HEAD > SOUR > NAME, or HEAD > SOUR value
  let software: string | null = null;
  const sour = findChild(head, 'SOUR');
  if (sour) {
    const nameNode = findChild(sour, 'NAME');
    if (nameNode && nameNode.value) {
      software = nameNode.value;
    } else if (sour.value) {
      software = sour.value;
    }
  }

  return { version, charset, software };
}
