import type { ConfidenceTier, DateParsed, LifeEvent, NodeStatus, PlaceNormalized } from './common.ts';

export interface PersonName {
  full: string;           // display name
  given: string;
  middle: string;         // middle name(s)
  surname: string;
  maidenName: string;     // birth surname if changed
  prefix: string;         // NPFX: "Dr.", "Rev."
  suffix: string;         // NSFX: "Jr.", "III"
  raw: string;            // original GEDCOM NAME value
}

export interface AlternateName {
  name: PersonName;
  type: 'married' | 'maiden' | 'aka' | 'birth' | 'immigrant' | 'religious' | 'nickname' | 'other';
  notes: string;
}

export interface CustomTag {
  key: string;
  value: string;
}

export interface ExternalIds {
  wikitree?: string;
  familysearch?: string;
  findagrave?: string;
}

export type PrivacyLevel = 'public' | 'anonymized' | 'private';

export interface Person {
  id: string;             // GEDCOM xref e.g. "@I123@" or generated UUID
  name: PersonName;
  alternateNames: AlternateName[];
  sex: "M" | "F" | "U";

  birth: {
    date: DateParsed | null;
    place: PlaceNormalized | null;
  };
  death: {
    date: DateParsed | null;
    place: PlaceNormalized | null;
  };
  burial: {
    date: DateParsed | null;
    place: PlaceNormalized | null;
  } | null;

  events: LifeEvent[];

  // User notes
  notes: string;

  // Custom tags (user-defined key-value pairs)
  customTags: CustomTag[];

  // Confidence & status
  confidenceTier: ConfidenceTier;
  confidenceReason: string;
  status: NodeStatus;

  // Linkage
  sourceIds: string[];
  flagIds: string[];
  researchStepIds: string[];
  conjectureIds: string[];

  // GEDCOM metadata
  gedcomXref: string | null;
  familyIdAsSpouse: string[];  // FAM xrefs where this person is HUSB/WIFE
  familyIdAsChild: string[];   // FAM xrefs where this person is CHIL

  // Identity & sharing (Phase 2 prep)
  identityHash: string;         // Deterministic fingerprint for duplicate detection
  privacyLevel: PrivacyLevel;   // Controls sharing visibility
  externalIds: ExternalIds;     // Links to external genealogy databases

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
