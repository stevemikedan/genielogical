/**
 * Converts SOUR (source) GEDCOM record nodes into Source objects.
 */

import type { Source } from '@/types/source.ts';
import type { GedcomNode } from './record-builder.ts';

/**
 * Find a direct child node by tag.
 */
function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/**
 * Convert a SOUR GEDCOM record node into a Source object.
 *
 * GEDCOM-imported sources default to sourceClass "tertiary" and
 * sourceType "other" — the user must upgrade classification manually.
 */
export function extractSource(node: GedcomNode): Source {
  const xref = node.xref || node.value || '';

  // Title (TITL)
  const titlNode = findChild(node, 'TITL');
  const title = titlNode?.value?.trim() || 'Untitled Source';

  // Author (AUTH)
  const authNode = findChild(node, 'AUTH');
  const author = authNode?.value?.trim() || '';

  // Publication (PUBL)
  const publNode = findChild(node, 'PUBL');
  const publication = publNode?.value?.trim() || '';

  // Text (TEXT)
  const textNode = findChild(node, 'TEXT');
  const text = textNode?.value?.trim() || '';

  // Repository (REPO)
  const repoNode = findChild(node, 'REPO');
  const repository = repoNode?.value?.trim() || null;

  // Build citation from available parts
  const citationParts = [author, title, publication].filter(Boolean);
  const citation = citationParts.join('. ');

  return {
    id: xref,
    origin: 'gedcom_import',
    sourceClass: 'tertiary',
    sourceType: 'other',
    title,
    citation,
    notes: text,
    url: null,
    repository,
    provesWhat: [],
    attachedToPersonIds: [],
    attachedToEdgeIds: [],
    gedcomTag: xref || null,
    addedAt: new Date(),
    addedBy: 'gedcom_import',
  };
}
