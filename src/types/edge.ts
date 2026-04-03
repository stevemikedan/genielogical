import type { ConfidenceTier, DateParsed, PlaceNormalized } from './common.ts';

export type RelationshipType =
  | "biological"
  | "adoptive"
  | "step"
  | "foster"
  | "sealing"  // LDS
  | "unknown";

export type Legitimacy =
  | "legitimate"
  | "illegitimate"
  | "unknown";

/** Marriage/union data associated with a family unit. */
export interface MarriageData {
  marriageDate: DateParsed | null;
  marriagePlace: PlaceNormalized | null;
  divorceDate: DateParsed | null;
  divorcePlace: PlaceNormalized | null;
  marriageOrder: number | null;     // 1st, 2nd, 3rd marriage etc.
  notes: string;
}

export interface Edge {
  id: string;
  parentId: string;
  childId: string;

  relationshipType: RelationshipType;
  legitimacy: Legitimacy;

  // Marriage/union context (shared across edges in the same family)
  marriage: MarriageData | null;

  // Confidence
  confidenceTier: ConfidenceTier;
  confidenceReason: string;

  // Parallel path support
  parallelGroupId: string | null;
  isPrimary: boolean;
  pathLabel: string | null;  // "biological father", "step-father", etc.

  // Linkage
  sourceIds: string[];
  flagIds: string[];

  // GEDCOM metadata
  familyGedcomXref: string | null;

  // Provenance (Phase 2 prep)
  assertedBy: string;    // 'gedcom_import' | 'local_user' | 'ai'
  assertedAt: Date;

  createdAt: Date;
}
