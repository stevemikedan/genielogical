import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Flag } from '@/types/flag.ts';
import type { EraTag, LocationContext } from './era-context.ts';

/**
 * Generate era-specific, context-aware research questions for AI prompts.
 * Returns 3-8 prioritized questions based on what's missing.
 */
export function generateResearchQuestions(
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  edge: Edge | null,
  flags: Flag[],
  era: EraTag,
  location: LocationContext,
): string[] {
  const questions: string[] = [];
  const name = person.name.full;
  const birthYear = person.birth.date?.year;
  const birthPlace = person.birth.place;
  const state = birthPlace?.state ?? location.region ?? 'unknown';
  const county = birthPlace?.parts?.[1] ?? null; // parts: [city, county, state, country]

  // 1. Unsourced birth — era-specific search
  if (person.sourceIds.length === 0 || !personHasBirthSource(person)) {
    addBirthQuestions(questions, name, birthYear, state, county, era);
  }

  // 2. Unsourced parental link
  if (edge && edge.confidenceTier >= 3) {
    const parentName = edge.parentId === parents.father?.id
      ? parents.father?.name.full
      : parents.mother?.name.full;
    if (parentName) {
      questions.push(
        `Is there any record (census, will, deed, church register) that names ${name} as a child of ${parentName}?`
      );
    }
  }

  // 3. Prestige title flag
  const prestigeFlag = flags.find(f => f.ruleId === 'PRESTIGE_TITLE_IN_NAME');
  if (prestigeFlag) {
    const titleMatch = extractTitle(person.name.full);
    if (titleMatch) {
      questions.push(
        `Verify whether ${name} actually held the title "${titleMatch}". Check the relevant peerage, baronetage, or published genealogy.`
      );
    }
  }

  // 4. Chronological flags
  if (flags.some(f => f.category === 'chronological')) {
    questions.push(
      `The GEDCOM dates for ${name} have been flagged as problematic. Search for independent records to establish correct dates.`
    );
  }

  // 5. No death record
  if (person.death.date && !personHasDeathSource(person)) {
    questions.push(
      `Search for a death record, burial record, or gravestone for ${name}${person.death.date.year ? ` (d. ~${person.death.date.year})` : ''}.`
    );
  }

  // 6. Marriage verification (if parents provided)
  if (parents.father && parents.mother && edge) {
    const fName = parents.father.name.full;
    const mName = parents.mother.name.full;
    questions.push(
      `Search for a marriage record for ${fName} and ${mName}${county ? ` in ${county}, ${state}` : ''}.`
    );
  }

  // 7. Source desert (no sources at all)
  if (person.sourceIds.length === 0) {
    questions.push(
      `This person has zero attached sources. Search for any record that confirms their existence: census, church register, vital record, land deed, or military record.`
    );
  }

  // 8. Duplicate suspect
  if (flags.some(f => f.category === 'duplicate_suspect')) {
    questions.push(
      `This person may be a duplicate entry. Search for records to determine if variant spellings refer to the same individual.`
    );
  }

  // Limit to 8 max, prioritized by order above
  return questions.slice(0, 8);
}

function addBirthQuestions(
  questions: string[],
  name: string,
  birthYear: number | null | undefined,
  state: string,
  county: string | null,
  era: EraTag,
): void {
  const yearStr = birthYear ? String(birthYear) : 'estimated';
  const locationStr = county ? `${county}, ${state}` : state;

  switch (era) {
    case 'us_modern':
    case 'us_gilded_reconstruction':
      questions.push(
        `Search for ${name} in the ${yearStr} US Census for ${locationStr}.`
      );
      break;
    case 'us_antebellum':
      questions.push(
        `Search for ${name} in the ${yearStr} US Census for ${locationStr}. Note: pre-1850 census only lists household heads.`
      );
      break;
    case 'us_early_republic':
    case 'us_colonial':
      questions.push(
        `Search for ${name} in colonial or early republic records for ${locationStr}: court records, land grants, church registers.`
      );
      break;
    case 'scotland_modern':
      questions.push(
        `Search for a birth/baptism record for ${name} on ScotlandsPeople (civil registration from 1855).`
      );
      break;
    case 'scotland_opr':
      questions.push(
        `Search for a baptism record for ${name} in the Old Parochial Records for ${locationStr}, Scotland.`
      );
      break;
    case 'scotland_pre_reformation':
      questions.push(
        `Search for ${name} in NRS charter records, the Scots Peerage, or other pre-Reformation Scottish sources.`
      );
      break;
    case 'england_modern':
      questions.push(
        `Search for a birth record for ${name} in GRO civil registration indexes (from 1837).`
      );
      break;
    case 'england_parish':
      questions.push(
        `Search for a baptism record for ${name} in English parish registers for ${locationStr}.`
      );
      break;
    case 'england_medieval':
      questions.push(
        `Search for ${name} in medieval English records: Inquisitions Post Mortem, patent rolls, or the Complete Peerage.`
      );
      break;
    case 'ireland_modern':
      questions.push(
        `Search for a birth record for ${name} in Irish civil registration (from 1864) or church records on IrishGenealogy.ie.`
      );
      break;
    case 'ireland_pre_famine':
      questions.push(
        `Search for ${name} in surviving pre-famine Irish church records or Griffith's Valuation (1847-64).`
      );
      break;
    case 'germany_modern':
    case 'germany_church_books':
      questions.push(
        `Search for a baptism record for ${name} in German church books (Kirchenbücher) via Archion or FamilySearch.`
      );
      break;
    case 'france_modern':
    case 'france_ancien_regime':
      questions.push(
        `Search for a birth/baptism record for ${name} in French civil or parish records.`
      );
      break;
    case 'medieval_europe':
      questions.push(
        `Search for ${name} in published medieval genealogies: The Peerage, Foundation for Medieval Genealogy (Medieval Lands), Complete Peerage.`
      );
      break;
    default:
      questions.push(
        `Search for any birth, baptism, or census record for ${name}.`
      );
  }
}

/**
 * Extract a title/honorific from a person's name for prestige verification.
 */
function extractTitle(fullName: string): string | null {
  const titlePatterns = [
    /\b(King|Queen|Prince|Princess|Duke|Duchess|Earl|Countess|Baron|Baroness)\b/i,
    /\b(Lord|Lady|Sir|Dame|Viscount|Marquess|Marquis)\b/i,
    /\b(Laird|Thane|Jarl|Count|Graf|Herzog|König)\b/i,
  ];
  for (const pattern of titlePatterns) {
    const match = fullName.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Stub helpers — check if person has specific source types.
// In the real data model, we'd look at sources, but we don't have source details
// in the person object. For now, just check if there are any sources at all.
function personHasBirthSource(person: Person): boolean {
  return person.sourceIds.length > 0;
}

function personHasDeathSource(person: Person): boolean {
  return person.sourceIds.length > 0;
}
