/**
 * Types for ancestry conflict detection and resolution.
 */

export type ConflictType =
  | 'different_parents'       // Completely different parent pairs
  | 'different_father'        // Same mother, different father
  | 'different_mother'        // Same father, different mother
  | 'additional_parents'      // One has parents, the other doesn't
  | 'upstream_divergence';    // Same parents but THEIR parents differ

export interface AncestryConflict {
  personIdA: string;
  personIdB: string;

  pathA: {
    fatherId: string | null;
    fatherName: string | null;
    motherId: string | null;
    motherName: string | null;
    grandparentCount: number;
  };
  pathB: {
    fatherId: string | null;
    fatherName: string | null;
    motherId: string | null;
    motherName: string | null;
    grandparentCount: number;
  };

  conflictType: ConflictType;

  descendantsAffectedA: number;
  descendantsAffectedB: number;
  sharedDescendants: string[];

  sourceCountA: number;
  sourceCountB: number;
  confidenceTierA: number;
  confidenceTierB: number;
}

export interface ConvergencePoint {
  ancestorId: string;
  ancestorName: string;
  paths: {
    pathIds: string[];
    parentIds: [string | null, string | null];
    confidence: number;
  }[];
  conflictDetected: boolean;
  divergenceGeneration: number;
}

export interface EchoDuplicate {
  normalizedKey: string;
  entries: {
    personId: string;
    generation: number;
    name: string;
    fatherName: string | null;
    motherName: string | null;
  }[];
  generationSpread: number;
}

export interface MergeDecision {
  winnerPersonId: string;
  loserPersonId: string;
  action: 'merge_keep_winner' | 'convert_to_parallel';
  preserveLoserSources: boolean;
  preserveLoserNotes: boolean;
  reparentDescendants: boolean;
  orphanUpstream: boolean;
}
