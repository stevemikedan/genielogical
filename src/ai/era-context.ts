import type { Person } from '@/types/person.ts';

/**
 * Era classification for genealogical research context.
 * 19 tags covering major eras by region, matching record availability periods.
 */
export type EraTag =
  | 'us_modern'
  | 'us_gilded_reconstruction'
  | 'us_antebellum'
  | 'us_early_republic'
  | 'us_colonial'
  | 'scotland_modern'
  | 'scotland_opr'
  | 'scotland_pre_reformation'
  | 'england_modern'
  | 'england_parish'
  | 'england_medieval'
  | 'ireland_modern'
  | 'ireland_pre_famine'
  | 'germany_modern'
  | 'germany_church_books'
  | 'france_modern'
  | 'france_ancien_regime'
  | 'medieval_europe'
  | 'unknown';

export interface RepositoryInfo {
  name: string;
  url: string | null;
  accessLevel: 'free' | 'subscription' | 'in_person_only';
  recordTypes: string[];
  coverage: string;
}

export interface LocationContext {
  country: string;
  region: string | null;
  availableRepositories: RepositoryInfo[];
  knownGaps: string[];
}

/**
 * Normalize country string to a canonical form.
 * Consolidates logic from research-recommender and genealogy-source-registry.
 */
export function normalizeCountry(country: string | null): string {
  if (!country) return 'unknown';
  const lower = country.toLowerCase().trim();

  if (lower.includes('scotland')) return 'Scotland';
  if (lower.includes('england') || lower.includes('wales')) return 'England';
  if (lower.includes('ireland')) return 'Ireland';
  if (lower.includes('germany') || lower.includes('prussia') || lower.includes('bavaria') || lower.includes('saxony')) return 'Germany';
  if (lower.includes('france')) return 'France';
  if (lower.includes('netherlands') || lower.includes('holland') || lower.includes('dutch')) return 'Netherlands';
  if (lower.includes('united states') || lower.includes('usa') || lower.includes('u.s.')) return 'US';

  // US state-level detection
  const usStates = [
    'virginia', 'massachusetts', 'pennsylvania', 'maryland', 'new york', 'connecticut',
    'carolina', 'georgia', 'new jersey', 'delaware', 'rhode island', 'new hampshire', 'vermont',
    'kentucky', 'tennessee', 'ohio', 'indiana', 'illinois', 'alabama', 'mississippi', 'louisiana',
    'missouri', 'arkansas', 'michigan', 'florida', 'texas', 'iowa', 'wisconsin', 'california',
    'minnesota', 'oregon', 'kansas', 'nebraska', 'colorado', 'washington', 'montana', 'idaho',
  ];
  if (usStates.some(s => lower.includes(s))) return 'US';

  return country;
}

/**
 * Compute an era tag for a person based on birth/death year and place.
 */
export function computeEraTag(person: Person): EraTag {
  const year = person.birth.date?.year ?? person.death.date?.year ?? null;
  const rawCountry = person.birth.place?.country ?? person.death.place?.country ?? null;
  const country = normalizeCountry(rawCountry);

  if (!year) return 'unknown';

  // Medieval catch-all (before 1500)
  if (year < 1500) return 'medieval_europe';

  if (country === 'US') {
    if (year >= 1900) return 'us_modern';
    if (year >= 1865) return 'us_gilded_reconstruction';
    if (year >= 1800) return 'us_antebellum';
    if (year >= 1790) return 'us_early_republic';
    return 'us_colonial';
  }

  if (country === 'Scotland') {
    if (year >= 1855) return 'scotland_modern';
    if (year >= 1553) return 'scotland_opr';
    return 'scotland_pre_reformation';
  }

  if (country === 'England') {
    if (year >= 1837) return 'england_modern';
    if (year >= 1538) return 'england_parish';
    return 'england_medieval';
  }

  if (country === 'Ireland') {
    if (year >= 1864) return 'ireland_modern';
    return 'ireland_pre_famine';
  }

  if (country === 'Germany') {
    if (year >= 1876) return 'germany_modern';
    return 'germany_church_books';
  }

  if (country === 'France') {
    if (year >= 1792) return 'france_modern';
    return 'france_ancien_regime';
  }

  return 'unknown';
}

/**
 * Repository lookup table keyed by era tags.
 */
const REPOSITORY_REGISTRY: Record<string, RepositoryInfo[]> = {
  us_modern: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census', 'vital_records', 'military_record'], coverage: 'US Census 1790-1950 fully indexed. Vital records coverage varies by state.' },
    { name: 'Find A Grave', url: 'https://www.findagrave.com', accessLevel: 'free', recordTypes: ['monument_inscription'], coverage: 'Burial records and headstone photos.' },
    { name: 'Ancestry', url: 'https://www.ancestry.com', accessLevel: 'subscription', recordTypes: ['census', 'vital_records', 'immigration', 'military_record'], coverage: 'Largest collection of US records.' },
  ],
  us_gilded_reconstruction: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census', 'vital_records', 'military_record'], coverage: 'Census 1870-1900. Civil War pension files.' },
    { name: 'Fold3', url: 'https://www.fold3.com', accessLevel: 'subscription', recordTypes: ['military_record', 'pension_file'], coverage: 'Civil War and later military records.' },
    { name: 'Find A Grave', url: 'https://www.findagrave.com', accessLevel: 'free', recordTypes: ['monument_inscription'], coverage: 'Post-Civil War burial records.' },
  ],
  us_antebellum: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census', 'church_register', 'probate'], coverage: 'Pre-1850 census only lists household head. Church records patchy.' },
    { name: 'Ancestry', url: 'https://www.ancestry.com', accessLevel: 'subscription', recordTypes: ['census', 'land_grant', 'probate'], coverage: 'County-level records.' },
    { name: 'NARA', url: 'https://www.archives.gov', accessLevel: 'free', recordTypes: ['military_record', 'pension_file', 'land_grant'], coverage: 'War of 1812 pensions. Land grants.' },
  ],
  us_early_republic: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census', 'church_register'], coverage: 'Census 1790-1800 (heads of household only).' },
    { name: 'NARA', url: 'https://www.archives.gov', accessLevel: 'free', recordTypes: ['military_record', 'pension_file', 'land_grant'], coverage: 'Revolutionary War pension files (M804/M805).' },
  ],
  us_colonial: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register', 'probate'], coverage: 'Colonial era records vary by colony.' },
    { name: 'WikiTree', url: 'https://www.wikitree.com', accessLevel: 'free', recordTypes: ['compiled_tree'], coverage: 'Collaborative genealogy. Gateway Ancestor and Magna Carta projects.' },
    { name: 'State Archives', url: null, accessLevel: 'in_person_only', recordTypes: ['court_record', 'land_grant', 'probate'], coverage: 'Court records, vestry books, land patents.' },
  ],
  scotland_modern: [
    { name: 'ScotlandsPeople', url: 'https://www.scotlandspeople.gov.uk', accessLevel: 'subscription', recordTypes: ['vital_records', 'census'], coverage: 'Civil registration from 1855. Census 1841-1911.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census'], coverage: 'Scottish census indexes.' },
  ],
  scotland_opr: [
    { name: 'ScotlandsPeople', url: 'https://www.scotlandspeople.gov.uk', accessLevel: 'subscription', recordTypes: ['church_register'], coverage: 'Old Parochial Records from ~1553.' },
    { name: 'NRS', url: 'https://www.nrscotland.gov.uk', accessLevel: 'subscription', recordTypes: ['church_register', 'court_record', 'testament'], coverage: 'Testaments, deeds, sasines.' },
    { name: 'Scots Peerage', url: null, accessLevel: 'free', recordTypes: ['published_genealogy'], coverage: '9 volumes covering Scottish peerage families. Available on Internet Archive.' },
  ],
  scotland_pre_reformation: [
    { name: 'NRS', url: 'https://www.nrscotland.gov.uk', accessLevel: 'subscription', recordTypes: ['court_record', 'charter'], coverage: 'Charter records, register of the great seal.' },
    { name: 'Scots Peerage', url: null, accessLevel: 'free', recordTypes: ['published_genealogy'], coverage: 'Standard reference for Scottish noble genealogies.' },
    { name: 'Complete Peerage', url: null, accessLevel: 'subscription', recordTypes: ['published_genealogy'], coverage: 'Standard reference for English, Scottish, and Irish peerages.' },
  ],
  england_modern: [
    { name: 'GRO', url: 'https://www.gro.gov.uk', accessLevel: 'subscription', recordTypes: ['vital_records'], coverage: 'Civil registration from 1837.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census'], coverage: 'English census 1841-1911.' },
    { name: 'TNA', url: 'https://www.nationalarchives.gov.uk', accessLevel: 'free', recordTypes: ['military_record', 'probate'], coverage: 'Wills, military records.' },
  ],
  england_parish: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Parish register indexes from 1538.' },
    { name: 'TNA', url: 'https://www.nationalarchives.gov.uk', accessLevel: 'free', recordTypes: ['probate', 'court_record'], coverage: 'Wills, government records.' },
    { name: 'County Record Offices', url: null, accessLevel: 'in_person_only', recordTypes: ['church_register', 'quarter_sessions'], coverage: 'Original parish registers and local court records.' },
  ],
  england_medieval: [
    { name: 'TNA', url: 'https://www.nationalarchives.gov.uk', accessLevel: 'free', recordTypes: ['court_record', 'charter'], coverage: 'Medieval government records, Inquisitions Post Mortem.' },
    { name: 'Complete Peerage', url: null, accessLevel: 'subscription', recordTypes: ['published_genealogy'], coverage: '13 volumes. Standard reference for peerages.' },
    { name: 'The Peerage', url: 'https://www.thepeerage.com', accessLevel: 'free', recordTypes: ['compiled_tree'], coverage: 'Comprehensive database of European nobility.' },
  ],
  ireland_modern: [
    { name: 'IrishGenealogy.ie', url: 'https://www.irishgenealogy.ie', accessLevel: 'free', recordTypes: ['vital_records', 'church_register'], coverage: 'Civil registration from 1864 and church records.' },
    { name: 'National Library of Ireland', url: 'https://registers.nli.ie', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Catholic parish registers, many digitized.' },
  ],
  ireland_pre_famine: [
    { name: 'National Library of Ireland', url: 'https://registers.nli.ie', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Catholic parish registers where they survive.' },
    { name: "Griffith's Valuation", url: 'https://www.askaboutireland.ie/griffith-valuation', accessLevel: 'free', recordTypes: ['land_survey'], coverage: '1847-64 property survey.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Irish records collection, limited pre-famine.' },
  ],
  germany_modern: [
    { name: 'Archion', url: 'https://www.archion.de', accessLevel: 'subscription', recordTypes: ['church_register'], coverage: 'German Protestant church books online.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register', 'vital_records'], coverage: 'Some German civil and church records.' },
    { name: 'Meyers Gazetteer', url: 'https://www.meyersgaz.org', accessLevel: 'free', recordTypes: ['gazetteer'], coverage: 'Historical German place names and jurisdictions.' },
  ],
  germany_church_books: [
    { name: 'Archion', url: 'https://www.archion.de', accessLevel: 'subscription', recordTypes: ['church_register'], coverage: 'Protestant Kirchenbücher.' },
    { name: 'Diocesan Archives', url: null, accessLevel: 'in_person_only', recordTypes: ['church_register'], coverage: 'Catholic Kirchenbücher held locally.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Some German church records digitized.' },
  ],
  france_modern: [
    { name: 'French Archives', url: 'https://francearchives.gouv.fr', accessLevel: 'free', recordTypes: ['vital_records'], coverage: 'Civil registration from 1792.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['vital_records', 'church_register'], coverage: 'French civil and parish records.' },
  ],
  france_ancien_regime: [
    { name: 'French Archives', url: 'https://francearchives.gouv.fr', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Parish registers where they survive.' },
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['church_register'], coverage: 'Some French parish records digitized.' },
  ],
  medieval_europe: [
    { name: 'The Peerage', url: 'https://www.thepeerage.com', accessLevel: 'free', recordTypes: ['compiled_tree'], coverage: 'European nobility database.' },
    { name: 'WikiTree', url: 'https://www.wikitree.com', accessLevel: 'free', recordTypes: ['compiled_tree'], coverage: 'Collaborative genealogy with Magna Carta projects.' },
    { name: 'Foundation for Medieval Genealogy', url: 'https://fmg.ac', accessLevel: 'free', recordTypes: ['published_genealogy'], coverage: 'Medieval Lands — scholarly European medieval genealogies.' },
    { name: 'Complete Peerage', url: null, accessLevel: 'subscription', recordTypes: ['published_genealogy'], coverage: 'Standard scholarly reference.' },
  ],
};

/**
 * Compute location context with available repositories for a person's era+location.
 */
export function computeLocationContext(person: Person, era: EraTag): LocationContext {
  const rawCountry = person.birth.place?.country ?? person.death.place?.country ?? null;
  const country = normalizeCountry(rawCountry);
  const region = person.birth.place?.state ?? person.death.place?.state ?? null;

  const repos = REPOSITORY_REGISTRY[era] ?? [];

  // Compute known gaps based on era+location
  const gaps: string[] = [];
  if (era === 'ireland_pre_famine') {
    gaps.push('Irish church records before 1820 are sparse for Catholic parishes.');
    gaps.push('Many records destroyed in the 1922 Four Courts fire.');
  }
  if (era === 'us_antebellum' || era === 'us_colonial') {
    if (region) {
      const lower = region.toLowerCase();
      if (lower.includes('carolina') || lower.includes('virginia') || lower.includes('georgia')) {
        gaps.push('Some southern courthouse records destroyed during the Civil War.');
      }
    }
  }
  if (era === 'scotland_pre_reformation') {
    gaps.push('Pre-Reformation Scottish records are extremely sparse outside noble families.');
  }
  if (era === 'medieval_europe') {
    gaps.push('Medieval records are limited to nobility, clergy, and significant landholders.');
  }

  return { country, region, availableRepositories: repos, knownGaps: gaps };
}
