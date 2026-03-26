export type FlagCategory =
  | "chronological"
  | "prestige_inflation"
  | "duplicate_suspect"
  | "place_normalization"
  | "source_desert"
  | "structural"
  | "unresolved_parentage"
  | "data_quality"
  | "ancestry_conflict";

export type FlagSeverity = "critical" | "warning" | "info";

export interface Flag {
  id: string;
  category: FlagCategory;
  severity: FlagSeverity;

  title: string;
  description: string;
  suggestedAction: string;

  ruleId: string;
  affectedPersonIds: string[];
  affectedEdgeIds: string[];

  userStatus: "new" | "acknowledged" | "investigating" | "dismissed" | "resolved";
  userNote: string | null;

  detectedAt: Date;
  resolvedAt: Date | null;
}
