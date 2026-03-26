import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Flag } from '@/types/flag.ts';
import type { ResearchStep } from '@/types/research.ts';
import type { Person } from '@/types/person.ts';

interface SourceSuggestion {
  sourceName: string;
  repository: string;
  url: string | null;
  reasoning: string;
}

interface LookupEntry {
  match: (era: string, country: string, state: string | null, flags: Flag[], person: Person) => boolean;
  suggestions: SourceSuggestion[];
}

const LOOKUP_TABLE: LookupEntry[] = [
  // US 1790–present: Census, FindAGrave, Ancestry
  {
    match: (era, country) => country === 'US' && (era === 'modern' || era === 'colonial_late'),
    suggestions: [
      { sourceName: 'US Federal Census', repository: 'FamilySearch', url: 'https://www.familysearch.org', reasoning: 'Census records available every 10 years from 1790; most complete source for US families.' },
      { sourceName: 'FindAGrave Memorial', repository: 'FindAGrave', url: 'https://www.findagrave.com', reasoning: 'Burial records often confirm death dates and family connections via co-located graves.' },
      { sourceName: 'Ancestry Records', repository: 'Ancestry', url: 'https://www.ancestry.com', reasoning: 'Largest collection of US vital records, immigration, and military records.' },
    ],
  },
  // Colonial America 1700–1790
  {
    match: (era, country) => country === 'US' && era === 'colonial',
    suggestions: [
      { sourceName: 'Colonial Court Records', repository: 'State Archives', url: null, reasoning: 'Court records often contain family relationships, land transfers, and probate proceedings.' },
      { sourceName: 'Land Grants', repository: 'State Land Office Records', url: null, reasoning: 'Colonial land grants establish residence, family ties, and approximate dates.' },
      { sourceName: 'Church Registers', repository: 'Local churches / Denominational archives', url: null, reasoning: 'Baptism, marriage, and burial records from colonial-era churches.' },
    ],
  },
  // Scotland pre-1700
  {
    match: (era, country) => country === 'Scotland' && (era === 'early_modern' || era === 'medieval'),
    suggestions: [
      { sourceName: 'National Records of Scotland', repository: 'NRS', url: 'https://www.nrscotland.gov.uk', reasoning: 'Central repository for Scottish statutory records and historical documents.' },
      { sourceName: 'Old Parochial Registers', repository: 'ScotlandsPeople', url: 'https://www.scotlandspeople.gov.uk', reasoning: 'Parish records of baptisms, marriages, and burials from ~1553.' },
      { sourceName: 'Scots Peerage', repository: 'Published reference', url: null, reasoning: 'Standard reference for Scottish noble and landed family lineages.' },
    ],
  },
  // England pre-1700
  {
    match: (era, country) => country === 'England' && (era === 'early_modern' || era === 'medieval'),
    suggestions: [
      { sourceName: 'The National Archives', repository: 'TNA', url: 'https://www.nationalarchives.gov.uk', reasoning: 'Primary repository for English government records, wills, and military records.' },
      { sourceName: 'Parish Registers', repository: 'County Record Offices', url: null, reasoning: 'Church of England parish records from 1538 onward.' },
      { sourceName: 'Complete Peerage', repository: 'Published reference', url: null, reasoning: 'Authoritative reference for English peerage families.' },
    ],
  },
  // Ireland
  {
    match: (_era, country) => country === 'Ireland',
    suggestions: [
      { sourceName: 'IrishGenealogy.ie', repository: 'Irish Government', url: 'https://www.irishgenealogy.ie', reasoning: 'Free access to Irish church records and civil registration.' },
      { sourceName: 'Church Registers', repository: 'National Library of Ireland', url: 'https://registers.nli.ie', reasoning: 'Catholic parish registers, many digitized.' },
      { sourceName: "Griffith's Valuation", repository: 'AskAboutIreland', url: 'https://www.askaboutireland.ie/griffith-valuation', reasoning: 'Mid-19th century property survey; useful for locating Irish families.' },
    ],
  },
  // Germany
  {
    match: (_era, country) => country === 'Germany',
    suggestions: [
      { sourceName: 'Archion', repository: 'Archion', url: 'https://www.archion.de', reasoning: 'German Protestant church books online.' },
      { sourceName: 'Local Church Books', repository: 'Diocesan Archives', url: null, reasoning: 'Catholic Kirchenbücher held by local dioceses.' },
      { sourceName: 'Meyers Gazetteer', repository: 'Meyer Orts', url: 'https://www.meyersgaz.org', reasoning: 'Identifies historical German place names and their jurisdictions.' },
    ],
  },
  // Military (any era)
  {
    match: (_era, _country, _state, flags) => flags.some(f => f.category === 'data_quality' && f.title.toLowerCase().includes('military')),
    suggestions: [
      { sourceName: 'NARA Pension Files', repository: 'National Archives', url: 'https://www.archives.gov', reasoning: 'Military pension files contain extensive family information.' },
      { sourceName: 'Service Records', repository: 'National Archives', url: 'https://www.archives.gov', reasoning: 'Enlistment and service records confirm identity and dates.' },
      { sourceName: 'Muster Rolls', repository: 'State/National Archives', url: null, reasoning: 'Military muster rolls track presence and unit assignments.' },
    ],
  },
  // Medieval Europe (catch-all)
  {
    match: (era) => era === 'medieval',
    suggestions: [
      { sourceName: 'The Peerage', repository: 'thepeerage.com', url: 'https://www.thepeerage.com', reasoning: 'Comprehensive database of European nobility and their connections.' },
      { sourceName: 'WikiTree', repository: 'WikiTree', url: 'https://www.wikitree.com', reasoning: 'Collaborative genealogy with source citations; strong on medieval connections.' },
      { sourceName: 'Complete Peerage / Scots Peerage', repository: 'Published reference', url: null, reasoning: 'Standard scholarly references for medieval noble lineages.' },
    ],
  },
];

function classifyEra(year: number | null): string {
  if (!year) return 'unknown';
  if (year < 800) return 'ancient';
  if (year < 1500) return 'medieval';
  if (year < 1700) return 'early_modern';
  if (year < 1790) return 'colonial';
  if (year < 1800) return 'colonial_late';
  return 'modern';
}

function normalizeCountry(country: string | null): string {
  if (!country) return 'unknown';
  const lower = country.toLowerCase().trim();
  if (lower.includes('scotland')) return 'Scotland';
  if (lower.includes('england') || lower.includes('wales')) return 'England';
  if (lower.includes('ireland')) return 'Ireland';
  if (lower.includes('germany') || lower.includes('prussia') || lower.includes('bavaria') || lower.includes('saxony')) return 'Germany';
  if (lower.includes('united states') || lower.includes('usa') || lower.includes('u.s.')) return 'US';
  // State-level check for US
  const usStates = ['virginia', 'massachusetts', 'pennsylvania', 'maryland', 'new york', 'connecticut',
    'carolina', 'georgia', 'new jersey', 'delaware', 'rhode island', 'new hampshire', 'vermont',
    'kentucky', 'tennessee', 'ohio', 'indiana', 'illinois', 'alabama', 'mississippi', 'louisiana',
    'missouri', 'arkansas', 'michigan', 'florida', 'texas', 'iowa', 'wisconsin', 'california',
    'minnesota', 'oregon', 'kansas', 'nebraska', 'colorado', 'washington', 'montana', 'idaho'];
  if (usStates.some(s => lower.includes(s))) return 'US';
  return country;
}

function countDescendants(personId: string, graph: TreeGraph): number {
  const visited = new Set<string>();
  const queue = [personId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const childEdges = graph.childEdges.get(current) ?? [];
    for (const edge of childEdges) {
      if (!visited.has(edge.childId)) queue.push(edge.childId);
    }
  }
  return visited.size - 1; // exclude self
}

export function generateResearchSteps(graph: TreeGraph, flags: Flag[]): ResearchStep[] {
  const steps: ResearchStep[] = [];
  let stepCounter = 0;

  for (const person of graph.persons.values()) {
    // Only target persons with tier >= 3 or unsourced
    if (person.confidenceTier < 3 && person.sourceIds.length > 0) continue;

    const birthYear = person.birth.date?.year ?? null;
    const deathYear = person.death.date?.year ?? null;
    const era = classifyEra(birthYear ?? deathYear);
    if (era === 'unknown' || era === 'ancient') continue;

    const birthCountry = normalizeCountry(person.birth.place?.country ?? null);
    const deathCountry = normalizeCountry(person.death.place?.country ?? null);
    const country = birthCountry !== 'unknown' ? birthCountry : deathCountry;
    const state = person.birth.place?.state ?? person.death.place?.state ?? null;

    const personFlags = flags.filter(f => f.affectedPersonIds.includes(person.id));
    const descendantCount = countDescendants(person.id, graph);
    const impact: ResearchStep['impact'] = descendantCount > 50 ? 'high' : descendantCount > 10 ? 'medium' : 'low';

    for (const entry of LOOKUP_TABLE) {
      if (entry.match(era, country, state, personFlags, person)) {
        for (const suggestion of entry.suggestions) {
          stepCounter++;
          steps.push({
            id: `rs-${stepCounter}`,
            personId: person.id,
            edgeId: null,
            origin: 'rule_based',
            description: `Search ${suggestion.sourceName} for records of ${person.name.full}.`,
            suggestedSource: suggestion.sourceName,
            suggestedUrl: suggestion.url,
            reasoning: suggestion.reasoning,
            impact,
            status: 'not_started',
            completedAt: null,
            resultNote: null,
            generatedAt: new Date(),
          });
        }
        break; // Use first matching entry
      }
    }
  }

  return steps;
}
