import type { DateParsed, LifeEvent, PlaceNormalized } from './common.ts';

/**
 * Intermediate type used during GEDCOM parsing.
 * Represents a FAM record before edges are built.
 */
export interface ParsedFamily {
  id: string;              // FAM xref e.g. "@F123@"
  husbandId: string | null;
  wifeId: string | null;
  childIds: string[];

  marriageDate: DateParsed | null;
  marriagePlace: PlaceNormalized | null;
  divorceDate: DateParsed | null;

  events: LifeEvent[];

  sourceIds: string[];
}
