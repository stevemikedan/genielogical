export interface Conjecture {
  id: string;
  personId: string;

  hypothesis: string;
  confidencePercent: number; // 0-100
  supportingEvidence: string;
  contradictingEvidence: string;
  sourceIds: string[];

  status: "open" | "confirmed" | "disproven";
  createdAt: Date;
  updatedAt: Date;
}
