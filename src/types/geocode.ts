import type { ConfidenceTier, DateParsed, NodeStatus } from './common.ts';

export interface GeocodedPlace {
  lat: number;
  lng: number;
  displayName: string;
  confidence: 'exact' | 'interpolated' | 'approximate';
  queryString: string;
  geocodedAt: Date;
}

export interface GeocodeBatchProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
}

export interface PersonLocation {
  personId: string;
  personName: string;
  confidenceTier: ConfidenceTier;
  status: NodeStatus;
  locationType: 'birth' | 'death' | 'burial' | 'residence' | 'census' | 'immigration' | 'other';
  lat: number;
  lng: number;
  date: DateParsed | null;
  placeRaw: string;
}
