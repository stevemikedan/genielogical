export type SourceClass = "primary" | "secondary" | "tertiary" | "derivative";

export type SourceType =
  | "vital_record"
  | "census"
  | "church_register"
  | "court_record"
  | "military_record"
  | "pension_file"
  | "land_grant"
  | "probate"
  | "published_genealogy"
  | "compiled_tree"
  | "dna"
  | "family_bible"
  | "newspaper"
  | "monument_inscription"
  | "personal_knowledge"
  | "ancestry_hint"
  | "photograph"
  | "document_scan"
  | "other";

export type ProvesWhat =
  | "identity"
  | "birth"
  | "death"
  | "marriage"
  | "parentage"
  | "residence"
  | "occupation";

export interface Source {
  id: string;
  origin: "gedcom_import" | "user_added";

  sourceClass: SourceClass;
  sourceType: SourceType;

  title: string;
  citation: string;
  notes: string;
  url: string | null;
  repository: string | null;

  provesWhat: ProvesWhat[];

  attachedToPersonIds: string[];
  attachedToEdgeIds: string[];

  gedcomTag: string | null;

  // Deduplication (Phase 2 prep)
  sourceHash: string;     // Deterministic fingerprint of citation + URL

  addedAt: Date;
  addedBy: string;
}
