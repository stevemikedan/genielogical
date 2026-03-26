/**
 * Main GEDCOM parser orchestrator.
 *
 * Combines tokenizer, record builder, format detector, and all extractors
 * to produce a complete ParseResult from raw GEDCOM text.
 */

import type { ParseResult, ParseWarning } from '@/types/parse-result.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ParsedFamily } from '@/types/family.ts';
import { tokenize } from './tokenizer.ts';
import { buildRecords } from './record-builder.ts';
import type { GedcomNode } from './record-builder.ts';
import { detectFormat } from './format-detector.ts';
import { extractPerson } from './person-extractor.ts';
import { extractFamily } from './family-extractor.ts';
import { extractSource } from './source-extractor.ts';
import { buildEdges } from './edge-builder.ts';

/** Custom/vendor tags that we recognize but don't process */
const KNOWN_CUSTOM_TAGS = new Set([
  '_APID', '_PRIM', '_TREE', '_ENV', '_UID', '_MEDI',
  '_FREL', '_MREL', '_STAT', '_DATE', '_PLAC', '_TYPE',
  '_SSHOW', '_PHOTO', '_LINK', '_EMAIL', '_TODO', '_ATTR',
  '_MASTER', '_MARNM', '_AKA', '_ADPF', '_ADPM', '_SCBK',
  '_PERI', '_TMPLT', '_RIN', '_SUBQ', '_BIBL', '_FSFTID',
]);

/**
 * Collect warnings for custom/vendor tags encountered in records.
 */
function collectCustomTagWarnings(records: GedcomNode[]): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const seen = new Set<string>();

  function walk(node: GedcomNode): void {
    if (node.tag.startsWith('_')) {
      // Only warn once per unique custom tag
      if (!seen.has(node.tag)) {
        seen.add(node.tag);
        const message = KNOWN_CUSTOM_TAGS.has(node.tag)
          ? `Custom tag ${node.tag} recognized but not processed`
          : `Unknown custom tag ${node.tag} ignored`;
        warnings.push({
          line: node.lineNumber,
          message,
          tag: node.tag,
        });
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const record of records) {
    walk(record);
  }

  return warnings;
}

/**
 * Estimate the number of generations in the tree by finding the
 * longest parent-to-child chain using BFS from root ancestors.
 */
function estimateGenerations(
  persons: Map<string, Person>,
  edges: Edge[]
): number {
  if (edges.length === 0 || persons.size === 0) return 0;

  // Build a parent -> children adjacency list (only using primary edges)
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    if (!edge.isPrimary) continue;
    const children = childrenOf.get(edge.parentId);
    if (children) {
      children.push(edge.childId);
    } else {
      childrenOf.set(edge.parentId, [edge.childId]);
    }
    hasParent.add(edge.childId);
  }

  // Find roots: persons who are parents but have no parents themselves
  const roots: string[] = [];
  for (const personId of persons.keys()) {
    if (!hasParent.has(personId) && childrenOf.has(personId)) {
      roots.push(personId);
    }
  }

  // If no clear roots found, use all persons without parents
  if (roots.length === 0) {
    for (const personId of persons.keys()) {
      if (!hasParent.has(personId)) {
        roots.push(personId);
      }
    }
  }

  // BFS to find maximum depth
  let maxDepth = 0;
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const root of roots) {
    if (visited.has(root)) continue;
    queue.push({ id: root, depth: 1 });
    visited.add(root);
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > maxDepth) {
      maxDepth = item.depth;
    }

    const children = childrenOf.get(item.id);
    if (children) {
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ id: childId, depth: item.depth + 1 });
        }
      }
    }
  }

  return maxDepth;
}

/**
 * Link inline source references on persons to actual Source objects.
 * Mutates source.attachedToPersonIds and verifies person.sourceIds
 * reference real sources.
 */
function linkSources(
  persons: Map<string, Person>,
  sources: Map<string, Source>
): void {
  for (const [personId, person] of persons) {
    const validSourceIds: string[] = [];
    for (const srcId of person.sourceIds) {
      const source = sources.get(srcId);
      if (source) {
        if (!source.attachedToPersonIds.includes(personId)) {
          source.attachedToPersonIds.push(personId);
        }
        validSourceIds.push(srcId);
      }
    }
    person.sourceIds = validSourceIds;
  }
}

/**
 * Parse a GEDCOM text string and return a complete ParseResult.
 *
 * This is the main entry point for the parser module.
 */
export function parseGedcom(text: string): ParseResult {
  const startTime = performance.now();

  // Step 1: Tokenize
  const tokens = tokenize(text);

  // Step 2: Build hierarchical records
  const records = buildRecords(tokens);

  // Step 3: Detect format from HEAD
  const format = detectFormat(records);

  // Step 4: Collect custom tag warnings
  const warnings = collectCustomTagWarnings(records);

  // Step 5: Extract persons from INDI records
  const persons = new Map<string, Person>();
  const indiRecords: GedcomNode[] = [];
  for (const record of records) {
    if (record.tag === 'INDI') {
      indiRecords.push(record);
      try {
        const person = extractPerson(record);
        persons.set(person.id, person);
      } catch {
        // Collect error but continue parsing
        warnings.push({
          line: record.lineNumber,
          message: `Failed to extract person from INDI record ${record.xref ?? ''}`,
          tag: 'INDI',
        });
      }
    }
  }

  // Step 6: Extract families from FAM records
  const families: ParsedFamily[] = [];
  for (const record of records) {
    if (record.tag === 'FAM') {
      try {
        families.push(extractFamily(record));
      } catch {
        warnings.push({
          line: record.lineNumber,
          message: `Failed to extract family from FAM record ${record.xref ?? ''}`,
          tag: 'FAM',
        });
      }
    }
  }

  // Step 7: Extract sources from SOUR records
  const sources = new Map<string, Source>();
  for (const record of records) {
    if (record.tag === 'SOUR' && record.xref) {
      try {
        const source = extractSource(record);
        sources.set(source.id, source);
      } catch {
        warnings.push({
          line: record.lineNumber,
          message: `Failed to extract source from SOUR record ${record.xref ?? ''}`,
          tag: 'SOUR',
        });
      }
    }
  }

  // Step 8: Build edges from families
  let edges: Edge[] = [];
  try {
    edges = buildEdges(families, indiRecords);
  } catch {
    warnings.push({
      line: 0,
      message: 'Failed to build edges from family records',
      tag: 'EDGE',
    });
  }

  // Step 9: Link inline source references
  linkSources(persons, sources);

  // Step 10: Calculate stats
  const generationCount = estimateGenerations(persons, edges);
  const parseTimeMs = Math.round(performance.now() - startTime);

  return {
    persons,
    edges,
    sources,
    families,
    stats: {
      individualCount: persons.size,
      familyCount: families.length,
      sourceCount: sources.size,
      edgeCount: edges.length,
      generationCount,
      parseTimeMs,
      gedcomVersion: format.version,
      charset: format.charset,
      software: format.software,
      warningCount: warnings.length,
      errorCount: 0,
    },
    errors: [],
    warnings,
  };
}
