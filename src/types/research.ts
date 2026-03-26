export interface ResearchStep {
  id: string;
  personId: string;
  edgeId: string | null;

  origin: "rule_based" | "ai_generated";

  description: string;
  suggestedSource: string | null;
  suggestedUrl: string | null;
  reasoning: string;
  impact: "high" | "medium" | "low";

  status: "not_started" | "complete";
  completedAt: Date | null;
  resultNote: string | null;

  generatedAt: Date;
}

export interface ResearchPriority {
  edgeId: string;
  parentId: string;
  childId: string;
  currentTier: number;
  impactScore: number;
  affectedNotablePaths: string[];
  affectedPathCount: number;
  description: string;
}
