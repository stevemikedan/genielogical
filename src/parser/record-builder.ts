/**
 * Groups tokenized GEDCOM lines into hierarchical records.
 * A level-0 line starts a new top-level record.
 * Sub-lines (level 1, 2, etc.) nest under their parent.
 */

import type { GedcomToken } from './tokenizer.ts';

export interface GedcomNode {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  lineNumber: number;
  children: GedcomNode[];
}

/**
 * Convert a flat array of tokens into a tree of GedcomNode records.
 * Each level-0 token becomes a root node, with higher-level tokens
 * nested as children based on their level.
 */
export function buildRecords(tokens: GedcomToken[]): GedcomNode[] {
  const roots: GedcomNode[] = [];

  // Stack tracks the current ancestry chain.
  // stack[i] is the most recent node at level i.
  const stack: GedcomNode[] = [];

  for (const token of tokens) {
    const node: GedcomNode = {
      level: token.level,
      xref: token.xref,
      tag: token.tag,
      value: token.value,
      lineNumber: token.lineNumber,
      children: [],
    };

    if (token.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack[0] = node;
    } else {
      // Find the parent: the most recent node at (level - 1)
      const parentLevel = token.level - 1;
      const parent = stack[parentLevel];
      if (parent) {
        parent.children.push(node);
      }
      // Trim stack to this level and set the node
      stack.length = token.level + 1;
      stack[token.level] = node;
    }
  }

  return roots;
}
