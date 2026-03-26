/**
 * TreeMetadata — persistence-only metadata for a tree workspace.
 * NOT added to in-memory Person/Edge types. treeId lives at the storage boundary.
 */

export interface TreeMetadata {
  id: string;
  name: string;
  description: string;
  gedcomFileName: string | null;
  personCount: number;
  edgeCount: number;
  generationCount: number;
  createdAt: Date;
  lastModifiedAt: Date;
  lastOpenedAt: Date;
}
