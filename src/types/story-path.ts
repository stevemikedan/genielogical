import type { BridgeZone } from './bridge.ts';

export type NotableCategory =
  | 'royalty'
  | 'military_order'
  | 'political'
  | 'indigenous_leader'
  | 'author_theologian'
  | 'scientist_physician'
  | 'artist_musician'
  | 'legal_scholar'
  | 'clergy'
  | 'colonial_gentry'
  | 'military'
  | 'other';

export interface NotableAncestor {
  personId: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  category: NotableCategory;
  matchRule: string;
  significance: string;
  generationsFromSubject: number;
  pathToSubject: string[];
  chainConfidence: number;
  bridgeZone: BridgeZone | null;
}

export interface StoryPathResult {
  subjectId: string;
  notableAncestors: NotableAncestor[];
  byCategory: Map<NotableCategory, NotableAncestor[]>;
}
