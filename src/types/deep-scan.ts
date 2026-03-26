import type { NotableAncestor } from './story-path.ts';

export interface BranchAnalysis {
  branchLabel: string;
  greatGrandparentId: string;
  greatGrandparentName: string;
  viaGrandparentName: string;
  ancestorCount: number;
  maxDepth: number;
  deepestAncestorId: string;
  deepestAncestorName: string;
  deepestAncestorBirthYear: number | null;
  notableFigures: NotableAncestor[];
  richnessScore: number;
}

export interface DeepScanResult {
  subjectId: string;
  totalUniqueAncestors: number;
  maxGenerationReached: number;
  branches: BranchAnalysis[];
  generationDistribution: Map<number, number>;
  allNotableFigures: NotableAncestor[];
}
