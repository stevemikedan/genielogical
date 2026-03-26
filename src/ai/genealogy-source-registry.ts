/**
 * Genealogy Source Registry — prioritized list of genealogical databases
 * with search URL builders for automated record lookups.
 *
 * Each source knows what eras and locations it covers, what record types
 * it holds, and how to build a search URL for a given person.
 */

import type { Person } from '@/types/person.ts';

// ── Types ─────────────────────────────────────────────────────────

export interface GenealogySource {
  id: string;
  name: string;
  shortName: string;
  url: string;
  /** What it contains, shown to user */
  description: string;
  /** Record types available */
  recordTypes: string[];
  /** Whether free to search (results may require subscription) */
  freeToSearch: boolean;
  /** Coverage constraints */
  coverage: {
    /** Earliest year of useful records */
    yearMin: number;
    /** Latest year of useful records */
    yearMax: number;
    /** Countries/regions covered (empty = worldwide) */
    regions: string[];
  };
  /** Priority (lower = higher priority, checked first) */
  priority: number;
  /** Build a search URL for this person. Returns null if insufficient data. */
  buildSearchUrl: (person: Person) => string | null;
}

export interface SourceSearchPlan {
  person: Person;
  era: string;
  region: string;
  /** Sources sorted by priority, filtered for relevance */
  sources: Array<{
    source: GenealogySource;
    searchUrl: string | null;
    relevanceReason: string;
  }>;
}

// ── URL Builders ──────────────────────────────────────────────────

function familySearchUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!given && !surname) return null;

  const params = new URLSearchParams();
  if (given) params.set('q.givenName', given);
  if (surname) params.set('q.surname', surname);
  if (person.birth.date?.year) params.set('q.birthLikeDate.from', String(person.birth.date.year - 2));
  if (person.birth.date?.year) params.set('q.birthLikeDate.to', String(person.birth.date.year + 2));
  if (person.birth.place?.raw) params.set('q.birthLikePlace', person.birth.place.raw);
  if (person.death.date?.year) params.set('q.deathLikeDate.from', String(person.death.date.year - 2));
  if (person.death.date?.year) params.set('q.deathLikeDate.to', String(person.death.date.year + 2));

  return `https://www.familysearch.org/search/record/results?${params.toString()}`;
}

function familySearchTreeUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!given && !surname) return null;

  const params = new URLSearchParams();
  if (given) params.set('q.givenName', given);
  if (surname) params.set('q.surname', surname);
  if (person.birth.date?.year) params.set('q.birthLikeDate.from', String(person.birth.date.year - 5));
  if (person.birth.date?.year) params.set('q.birthLikeDate.to', String(person.birth.date.year + 5));

  return `https://www.familysearch.org/tree/find/name?${params.toString()}`;
}

function findAGraveUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!surname) return null;

  const params = new URLSearchParams();
  if (given) params.set('firstname', given);
  params.set('lastname', surname);
  if (person.birth.date?.year) params.set('birthyear', String(person.birth.date.year));
  if (person.death.date?.year) params.set('deathyear', String(person.death.date.year));
  params.set('orderby', 'r');

  return `https://www.findagrave.com/memorial/search?${params.toString()}`;
}

function wikiTreeUrl(person: Person): string | null {
  const name = person.name.full?.trim();
  if (!name) return null;
  return `https://www.wikitree.com/wiki/Special:SearchPerson?LastName=${encodeURIComponent(person.name.surname || '')}&FirstName=${encodeURIComponent(person.name.given || '')}&BirthDate=${person.birth.date?.year ?? ''}&DeathDate=${person.death.date?.year ?? ''}`;
}

function billionGravesUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!surname) return null;

  return `https://billiongraves.com/search?given_names=${encodeURIComponent(given || '')}&family_names=${encodeURIComponent(surname)}&year_range_birth=${person.birth.date?.year ?? ''}&year_range_death=${person.death.date?.year ?? ''}`;
}

function geniUrl(person: Person): string | null {
  const name = person.name.full?.trim();
  if (!name) return null;
  return `https://www.geni.com/search?search_type=people&names=${encodeURIComponent(name)}`;
}

function ancestryUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!surname) return null;

  const params = new URLSearchParams();
  if (given) params.set('name', `${given}_${surname}`);
  else params.set('name', `_${surname}`);
  if (person.birth.date?.year) params.set('birth', String(person.birth.date.year));
  if (person.birth.place?.raw) params.set('birth_x', person.birth.place.raw);

  return `https://www.ancestry.com/search/?${params.toString()}`;
}

function myHeritageUrl(person: Person): string | null {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (!surname) return null;

  return `https://www.myheritage.com/research?action=query&qname=Name+fnmo.1+fnm.${encodeURIComponent(given || '')}+lnmo.1+lnm.${encodeURIComponent(surname)}`;
}

function scotlandsPeopleUrl(person: Person): string | null {
  const surname = person.name.surname?.trim();
  if (!surname) return null;
  return `https://www.scotlandspeople.gov.uk/record-results?search_type=people&surname=${encodeURIComponent(surname)}&forename=${encodeURIComponent(person.name.given || '')}`;
}

function thePeerageUrl(person: Person): string | null {
  const name = person.name.full?.trim();
  if (!name) return null;
  return `https://www.thepeerage.com/search.php?search=${encodeURIComponent(name)}`;
}

function openArchivesUrl(person: Person): string | null {
  const name = person.name.full?.trim();
  if (!name) return null;
  return `https://www.openarch.nl/search.php?name=${encodeURIComponent(name)}&lang=en`;
}

function irishGenealogyUrl(person: Person): string | null {
  const surname = person.name.surname?.trim();
  if (!surname) return null;
  return `https://www.irishgenealogy.ie/en/civil-records/search-civil-records?surname=${encodeURIComponent(surname)}&firstname=${encodeURIComponent(person.name.given || '')}`;
}

function archionUrl(person: Person): string | null {
  const name = person.name.full?.trim();
  if (!name) return null;
  return `https://www.archion.de/en/browse/?search=${encodeURIComponent(name)}`;
}

// ── Source Registry ───────────────────────────────────────────────

export const GENEALOGY_SOURCES: GenealogySource[] = [
  // ── Global / Multi-region ──
  {
    id: 'familysearch-records',
    name: 'FamilySearch Historical Records',
    shortName: 'FamilySearch',
    url: 'https://www.familysearch.org',
    description: 'Largest free genealogical records collection. Billions of birth, marriage, death, census, and immigration records worldwide.',
    recordTypes: ['vital records', 'census', 'immigration', 'military', 'church records', 'probate', 'land records'],
    freeToSearch: true,
    coverage: { yearMin: 1200, yearMax: 2020, regions: [] },
    priority: 1,
    buildSearchUrl: familySearchUrl,
  },
  {
    id: 'familysearch-tree',
    name: 'FamilySearch Family Tree',
    shortName: 'FS Tree',
    url: 'https://www.familysearch.org/tree',
    description: 'Collaborative worldwide family tree with over 1.4 billion persons. Check if this person already exists with linked sources.',
    recordTypes: ['collaborative tree', 'linked sources', 'photos', 'stories'],
    freeToSearch: true,
    coverage: { yearMin: 500, yearMax: 2020, regions: [] },
    priority: 2,
    buildSearchUrl: familySearchTreeUrl,
  },
  {
    id: 'findagrave',
    name: 'Find a Grave',
    shortName: 'FindAGrave',
    url: 'https://www.findagrave.com',
    description: 'Burial records with headstone photos. Confirms death dates, family connections via co-located graves, and maiden names.',
    recordTypes: ['burial records', 'headstone photos', 'obituaries'],
    freeToSearch: true,
    coverage: { yearMin: 1600, yearMax: 2025, regions: [] },
    priority: 3,
    buildSearchUrl: findAGraveUrl,
  },
  {
    id: 'wikitree',
    name: 'WikiTree',
    shortName: 'WikiTree',
    url: 'https://www.wikitree.com',
    description: 'Free collaborative genealogy with strong source citations. Good for pre-1700 European lineages and DNA connections.',
    recordTypes: ['collaborative tree', 'source citations', 'DNA connections'],
    freeToSearch: true,
    coverage: { yearMin: 500, yearMax: 2020, regions: [] },
    priority: 4,
    buildSearchUrl: wikiTreeUrl,
  },
  {
    id: 'ancestry',
    name: 'Ancestry',
    shortName: 'Ancestry',
    url: 'https://www.ancestry.com',
    description: 'Largest subscription genealogy service. Census, vital records, immigration, military, and user-submitted trees.',
    recordTypes: ['vital records', 'census', 'immigration', 'military', 'probate', 'newspapers', 'user trees'],
    freeToSearch: false,
    coverage: { yearMin: 1200, yearMax: 2020, regions: [] },
    priority: 5,
    buildSearchUrl: ancestryUrl,
  },
  {
    id: 'myheritage',
    name: 'MyHeritage',
    shortName: 'MyHeritage',
    url: 'https://www.myheritage.com',
    description: 'Global genealogy platform with strong European records. SuperSearch covers billions of historical records.',
    recordTypes: ['vital records', 'census', 'immigration', 'newspapers', 'user trees'],
    freeToSearch: false,
    coverage: { yearMin: 1300, yearMax: 2020, regions: [] },
    priority: 6,
    buildSearchUrl: myHeritageUrl,
  },
  {
    id: 'billiongraves',
    name: 'BillionGraves',
    shortName: 'BillionGraves',
    url: 'https://billiongraves.com',
    description: 'GPS-tagged headstone photos. Complements FindAGrave with different coverage.',
    recordTypes: ['burial records', 'headstone photos'],
    freeToSearch: true,
    coverage: { yearMin: 1700, yearMax: 2025, regions: [] },
    priority: 8,
    buildSearchUrl: billionGravesUrl,
  },
  {
    id: 'geni',
    name: 'Geni World Family Tree',
    shortName: 'Geni',
    url: 'https://www.geni.com',
    description: 'Collaborative world family tree. Good for finding distant relatives and shared ancestors.',
    recordTypes: ['collaborative tree', 'DNA matches'],
    freeToSearch: true,
    coverage: { yearMin: 500, yearMax: 2020, regions: [] },
    priority: 9,
    buildSearchUrl: geniUrl,
  },

  // ── Region-specific ──
  {
    id: 'scotlandspeople',
    name: 'ScotlandsPeople',
    shortName: 'ScotlandsPeople',
    url: 'https://www.scotlandspeople.gov.uk',
    description: 'Official Scottish government genealogy service. Old Parochial Registers from ~1553, statutory records from 1855, census, wills.',
    recordTypes: ['vital records', 'parish records', 'census', 'wills', 'valuation rolls'],
    freeToSearch: false,
    coverage: { yearMin: 1553, yearMax: 2020, regions: ['Scotland'] },
    priority: 3,
    buildSearchUrl: scotlandsPeopleUrl,
  },
  {
    id: 'irishgenealogy',
    name: 'IrishGenealogy.ie',
    shortName: 'Irish Records',
    url: 'https://www.irishgenealogy.ie',
    description: 'Free Irish civil registration records and church records. Births, marriages, deaths from 1845+.',
    recordTypes: ['vital records', 'church records'],
    freeToSearch: true,
    coverage: { yearMin: 1845, yearMax: 2020, regions: ['Ireland'] },
    priority: 3,
    buildSearchUrl: irishGenealogyUrl,
  },
  {
    id: 'archion',
    name: 'Archion',
    shortName: 'Archion',
    url: 'https://www.archion.de',
    description: 'German Protestant church books online. Baptisms, marriages, burials from German-speaking regions.',
    recordTypes: ['church records', 'baptisms', 'marriages', 'burials'],
    freeToSearch: false,
    coverage: { yearMin: 1500, yearMax: 1900, regions: ['Germany', 'Prussia', 'Bavaria', 'Saxony'] },
    priority: 3,
    buildSearchUrl: archionUrl,
  },
  {
    id: 'thepeerage',
    name: 'The Peerage',
    shortName: 'Peerage',
    url: 'https://www.thepeerage.com',
    description: 'Comprehensive database of European nobility, gentry, and their connections. Essential for medieval and early modern lineages.',
    recordTypes: ['peerage records', 'noble lineages'],
    freeToSearch: true,
    coverage: { yearMin: 500, yearMax: 1950, regions: ['England', 'Scotland', 'Ireland', 'France', 'Germany'] },
    priority: 5,
    buildSearchUrl: thePeerageUrl,
  },
  {
    id: 'openarchives',
    name: 'Open Archives (Netherlands)',
    shortName: 'Open Archives',
    url: 'https://www.openarch.nl',
    description: 'Dutch and Flemish civil and church records. Births, marriages, deaths across the Low Countries.',
    recordTypes: ['vital records', 'church records'],
    freeToSearch: true,
    coverage: { yearMin: 1600, yearMax: 1950, regions: ['Netherlands', 'Belgium', 'Flanders'] },
    priority: 4,
    buildSearchUrl: openArchivesUrl,
  },
];

// ── Source Plan Builder ───────────────────────────────────────────

function classifyEra(year: number | null): string {
  if (!year) return 'unknown';
  if (year < 800) return 'ancient';
  if (year < 1500) return 'medieval';
  if (year < 1700) return 'early_modern';
  if (year < 1800) return 'colonial';
  return 'modern';
}

function normalizeRegion(country: string | null): string {
  if (!country) return 'unknown';
  const lower = country.toLowerCase().trim();
  if (lower.includes('scotland')) return 'Scotland';
  if (lower.includes('england') || lower.includes('wales')) return 'England';
  if (lower.includes('ireland')) return 'Ireland';
  if (lower.includes('germany') || lower.includes('prussia') || lower.includes('bavaria') || lower.includes('saxony')) return 'Germany';
  if (lower.includes('netherlands') || lower.includes('holland') || lower.includes('dutch')) return 'Netherlands';
  if (lower.includes('france')) return 'France';
  if (lower.includes('united states') || lower.includes('usa') || lower.includes('u.s.')) return 'US';
  // US state-level detection
  const usStates = ['virginia', 'massachusetts', 'pennsylvania', 'maryland', 'new york', 'connecticut',
    'carolina', 'georgia', 'new jersey', 'delaware', 'rhode island', 'new hampshire', 'vermont',
    'kentucky', 'tennessee', 'ohio', 'indiana', 'illinois', 'alabama', 'mississippi', 'louisiana',
    'missouri', 'arkansas', 'michigan', 'florida', 'texas', 'iowa', 'wisconsin', 'california',
    'minnesota', 'oregon', 'kansas', 'nebraska', 'colorado', 'washington', 'montana', 'idaho'];
  if (usStates.some(s => lower.includes(s))) return 'US';
  return country;
}

function isSourceRelevant(source: GenealogySource, _era: string, region: string, birthYear: number | null): boolean {
  // Check year coverage
  if (birthYear !== null) {
    if (birthYear < source.coverage.yearMin || birthYear > source.coverage.yearMax) return false;
  }

  // Check region coverage (empty = worldwide)
  if (source.coverage.regions.length > 0 && region !== 'unknown') {
    if (!source.coverage.regions.some(r => r.toLowerCase() === region.toLowerCase())) return false;
  }

  // Region-specific sources shouldn't show for unknown regions
  if (source.coverage.regions.length > 0 && region === 'unknown') return false;

  return true;
}

function getRelevanceReason(source: GenealogySource, era: string, _region: string): string {
  const parts: string[] = [];
  if (source.coverage.regions.length > 0) {
    parts.push(`Covers ${source.coverage.regions.join(', ')}`);
  }
  if (era === 'medieval' && source.coverage.yearMin <= 1500) {
    parts.push('Has medieval records');
  }
  if (source.freeToSearch) {
    parts.push('Free to search');
  }
  parts.push(source.recordTypes.slice(0, 3).join(', '));
  return parts.join('. ') + '.';
}

/**
 * Build a prioritized list of genealogical sources to search for a person.
 * Sources are filtered by era/region relevance and sorted by priority.
 */
export function buildSourceSearchPlan(person: Person): SourceSearchPlan {
  const birthYear = person.birth.date?.year ?? null;
  const deathYear = person.death.date?.year ?? null;
  const yearForEra = birthYear ?? deathYear;
  const era = classifyEra(yearForEra);

  const birthCountry = normalizeRegion(person.birth.place?.country ?? null);
  const deathCountry = normalizeRegion(person.death.place?.country ?? null);
  const region = birthCountry !== 'unknown' ? birthCountry : deathCountry;

  const sources = GENEALOGY_SOURCES
    .filter(s => isSourceRelevant(s, era, region, yearForEra))
    .sort((a, b) => {
      // Region-specific sources get boosted priority for matching regions
      const aRegional = a.coverage.regions.length > 0;
      const bRegional = b.coverage.regions.length > 0;
      if (aRegional && !bRegional) return -1;
      if (!aRegional && bRegional) return 1;
      return a.priority - b.priority;
    })
    .map(source => ({
      source,
      searchUrl: source.buildSearchUrl(person),
      relevanceReason: getRelevanceReason(source, era, region),
    }));

  return { person, era, region, sources };
}

/**
 * Format the source search plan as context for the AI prompt.
 * This tells the AI what specific databases and record collections
 * to reference when making suggestions.
 */
export function formatSourceContext(plan: SourceSearchPlan): string {
  if (plan.sources.length === 0) {
    return 'No specific genealogical databases identified for this person\'s era/location.';
  }

  const lines: string[] = [
    `**Prioritized Genealogical Sources for ${plan.era} era, ${plan.region} region:**`,
    '',
  ];

  for (const { source, searchUrl, relevanceReason } of plan.sources.slice(0, 8)) {
    lines.push(`${source.priority}. **${source.name}** (${source.url})`);
    lines.push(`   Records: ${source.recordTypes.join(', ')}`);
    lines.push(`   Coverage: ${source.coverage.yearMin}–${source.coverage.yearMax}`);
    lines.push(`   Relevance: ${relevanceReason}`);
    if (searchUrl) {
      lines.push(`   Search URL: ${searchUrl}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
