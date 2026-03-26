export type ConfidenceTier = 1 | 2 | 3 | 4;

export type NodeStatus =
  | "tentative"
  | "under_review"
  | "validated"
  | "disputed"
  | "rejected";

export type DateQualifier =
  | "exact"
  | "about"
  | "before"
  | "after"
  | "between"
  | "calculated"
  | "estimated"
  | "unknown";

export interface DateParsed {
  date: Date | null;
  endDate: Date | null; // for "between X and Y"
  qualifier: DateQualifier;
  raw: string;
  year: number | null;
}

export interface PlaceNormalized {
  raw: string;
  city: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  parts: string[];
}

export interface LifeEvent {
  type: "birth" | "death" | "burial" | "baptism" | "marriage" | "divorce" | "census" | "immigration" | "emigration" | "naturalization" | "occupation" | "residence" | "military" | "other";
  date: DateParsed | null;
  place: PlaceNormalized | null;
  notes: string;
  sourceIds: string[];
}
