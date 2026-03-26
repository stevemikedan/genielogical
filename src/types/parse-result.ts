import type { Person } from './person.ts';
import type { Edge } from './edge.ts';
import type { Source } from './source.ts';
import type { ParsedFamily } from './family.ts';

export interface ParseStats {
  individualCount: number;
  familyCount: number;
  sourceCount: number;
  edgeCount: number;
  generationCount: number;
  parseTimeMs: number;
  gedcomVersion: string | null;
  charset: string | null;
  software: string | null;
  warningCount: number;
  errorCount: number;
}

export interface ParseError {
  line: number;
  message: string;
  raw: string;
}

export interface ParseWarning {
  line: number;
  message: string;
  tag: string;
}

export interface ParseResult {
  persons: Map<string, Person>;
  edges: Edge[];
  sources: Map<string, Source>;
  families: ParsedFamily[];
  stats: ParseStats;
  errors: ParseError[];
  warnings: ParseWarning[];
}
