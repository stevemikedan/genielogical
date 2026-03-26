/**
 * CrossTreeLink — a connection between a person in one tree and a person in another.
 * Used for cross-tree matching and eventual merge.
 */

export interface CrossTreeLink {
  id: string;
  personIdA: string;
  treeIdA: string;
  personIdB: string;
  treeIdB: string;
  confidence: 'confirmed' | 'probable' | 'possible';
  notes: string;
  createdAt: Date;
}
