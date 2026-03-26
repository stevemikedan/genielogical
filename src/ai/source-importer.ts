import type { Source, SourceType, ProvesWhat } from '@/types/source.ts';
import type { DiscoveredSourceImport, FoundRecord } from '@/types/ai.ts';
import { generateSourceId } from '@/utils/id-generator.ts';

// ── SourceType mapping ──────────────────────────────────────────────

const SOURCE_TYPE_MAP: Record<string, SourceType> = {
  census: 'census',
  vital: 'vital_record',
  church: 'church_register',
  military: 'military_record',
  land: 'land_grant',
  probate: 'probate',
  published_genealogy: 'published_genealogy',
  peerage: 'published_genealogy',
  other: 'other',
};

function mapSourceType(raw: string): SourceType {
  return SOURCE_TYPE_MAP[raw] ?? 'other';
}

// ── ProvesWhat mapping ──────────────────────────────────────────────

const VALID_PROVES: Set<string> = new Set([
  'identity', 'birth', 'death', 'marriage', 'parentage', 'residence', 'occupation',
]);

function mapProvesWhat(raw: string[]): ProvesWhat[] {
  return raw.filter(p => VALID_PROVES.has(p)) as ProvesWhat[];
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Convert an AI-discovered source import into a full Source record
 * ready for dispatch via ADD_SOURCE.
 */
export function convertToSource(
  discovered: DiscoveredSourceImport,
  attachedToPersonIds: string[],
  attachedToEdgeIds: string[] = [],
): Source {
  return {
    id: generateSourceId(),
    origin: 'user_added',
    sourceClass: discovered.sourceClass,
    sourceType: mapSourceType(discovered.sourceType),
    title: discovered.title,
    citation: discovered.title,
    notes: `Discovered via AI research. Repository: ${discovered.repository}`,
    url: discovered.url,
    repository: discovered.repository,
    provesWhat: mapProvesWhat(discovered.provesWhat),
    attachedToPersonIds,
    attachedToEdgeIds,
    gedcomTag: null,
    addedAt: new Date(),
    addedBy: 'ai',
  };
}

/**
 * Transform a FoundRecord (from ValidationReport) into a DiscoveredSourceImport
 * so it can be passed to convertToSource.
 */
export function foundRecordToImport(record: FoundRecord): DiscoveredSourceImport {
  return {
    title: record.title,
    url: record.url,
    repository: record.repository,
    sourceClass: record.sourceClass,
    sourceType: record.type,
    provesWhat: record.confirms,
  };
}
