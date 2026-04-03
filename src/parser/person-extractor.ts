/**
 * Converts INDI (individual) GEDCOM record nodes into Person objects.
 */

import type { Person, PersonName } from '@/types/person.ts';
import type { LifeEvent } from '@/types/common.ts';
import type { GedcomNode } from './record-builder.ts';
import { parseGedcomDate } from './date-normalizer.ts';
import { normalizePlace } from './place-normalizer.ts';
import { computeIdentityHash, inferPrivacyLevel } from '@/utils/identity-hash.ts';

/** Map GEDCOM event tags to LifeEvent type values */
const EVENT_TAG_MAP: Record<string, LifeEvent['type']> = {
  BIRT: 'birth',
  DEAT: 'death',
  BURI: 'burial',
  BAPM: 'baptism',
  CHR: 'baptism',
  MARR: 'marriage',
  DIV: 'divorce',
  CENS: 'census',
  IMMI: 'immigration',
  EMIG: 'emigration',
  NATU: 'naturalization',
  OCCU: 'occupation',
  RESI: 'residence',
  MILI: 'military',
  EVEN: 'other',
  GRAD: 'other',
  RETI: 'other',
  PROB: 'other',
  WILL: 'other',
};

/** Tags that are recognized as embedded titles / genealogical annotations, not true suffixes */
const TITLE_PATTERNS = [
  /^\d+(?:st|nd|rd|th)\s+ggf$/i,
  /^\d+(?:st|nd|rd|th)\s+ggm$/i,
  /^pvt\b/i,
  /^rev\s+war/i,
  /^(?:sir|dame|lord|lady|king|queen|prince|princess|duke|earl|count|baron)\b/i,
];

/**
 * Find a direct child node by tag.
 */
function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/**
 * Find all direct child nodes with a given tag.
 */
function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/**
 * Collect inline SOUR references from a node and its children.
 * Returns xref strings like "@S123@".
 */
function collectSourceRefs(node: GedcomNode): string[] {
  const refs: string[] = [];
  for (const child of node.children) {
    if (child.tag === 'SOUR' && child.value) {
      refs.push(child.value);
    }
    // Also check sub-children for nested SOUR refs
    for (const grandchild of child.children) {
      if (grandchild.tag === 'SOUR' && grandchild.value) {
        refs.push(grandchild.value);
      }
    }
  }
  return refs;
}

/**
 * Parse a NAME value from GEDCOM.
 * GEDCOM format: "Given /Surname/ Suffix"
 * The surname is delimited by slashes.
 */
function parseName(node: GedcomNode): PersonName {
  const raw = node.value || '';

  // Extract surname from /.../ pattern
  const surnameMatch = /\/([^/]*)\//.exec(raw);
  let surname = surnameMatch ? surnameMatch[1].trim() : '';
  let given = '';

  if (surnameMatch) {
    // Given name is everything before the first /
    given = raw.slice(0, surnameMatch.index).trim();
  } else {
    // No /.../ pattern — treat entire value as given name
    given = raw.trim();
  }

  // Check for GIVN sub-tag (overrides parsed given name if present)
  const givnNode = findChild(node, 'GIVN');
  if (givnNode && givnNode.value) {
    given = givnNode.value.trim();
  }

  // Check for SURN sub-tag (overrides parsed surname if present)
  const surnNode = findChild(node, 'SURN');
  if (surnNode && surnNode.value) {
    surname = surnNode.value.trim();
  }

  // Prefix (NPFX)
  const npfxNode = findChild(node, 'NPFX');
  const prefix = npfxNode?.value?.trim() ?? '';

  // Suffix (NSFX)
  const nsfxNode = findChild(node, 'NSFX');
  let suffix = nsfxNode?.value?.trim() ?? '';

  // Also check for suffix after the closing slash in the raw value
  if (surnameMatch) {
    const afterSurname = raw.slice(surnameMatch.index + surnameMatch[0].length).trim();
    if (afterSurname && !suffix) {
      suffix = afterSurname;
    }
  }

  // Check if suffix contains embedded titles / genealogical annotations
  // Preserve in raw but strip from display suffix
  let displaySuffix = suffix;
  for (const pattern of TITLE_PATTERNS) {
    if (pattern.test(suffix)) {
      displaySuffix = '';
      break;
    }
  }

  // Build full display name
  const nameParts = [prefix, given, surname, displaySuffix].filter(Boolean);
  const full = nameParts.join(' ');

  return {
    full: full || raw || 'Unknown',
    given,
    middle: '',
    surname,
    maidenName: '',
    prefix,
    suffix: displaySuffix,
    raw,
  };
}

/**
 * Parse an event node (BIRT, DEAT, etc.) into a partial with date and place.
 */
function parseEventDatePlace(eventNode: GedcomNode): {
  date: ReturnType<typeof parseGedcomDate> | null;
  place: ReturnType<typeof normalizePlace> | null;
} {
  const dateNode = findChild(eventNode, 'DATE');
  const placeNode = findChild(eventNode, 'PLAC');

  const date = dateNode ? parseGedcomDate(dateNode.value) : null;
  const place = placeNode ? normalizePlace(placeNode.value) : null;

  return { date, place };
}

/**
 * Parse a life event from an event tag node.
 */
function parseLifeEvent(eventNode: GedcomNode): LifeEvent {
  const type = EVENT_TAG_MAP[eventNode.tag] ?? 'other';
  const { date, place } = parseEventDatePlace(eventNode);

  // Notes from NOTE sub-tag
  const noteNode = findChild(eventNode, 'NOTE');
  const notes = noteNode?.value ?? '';

  // Collect source refs within this event
  const sourceIds = findChildren(eventNode, 'SOUR')
    .map((s) => s.value)
    .filter(Boolean);

  return {
    type,
    date,
    place,
    notes,
    sourceIds,
  };
}

/**
 * Convert an INDI GEDCOM record node into a Person object.
 */
export function extractPerson(node: GedcomNode): Person {
  const xref = node.xref || node.value || '';
  const now = new Date();

  // Parse NAME
  const nameNode = findChild(node, 'NAME');
  const name = nameNode ? parseName(nameNode) : {
    full: 'Unknown',
    given: '',
    middle: '',
    surname: '',
    maidenName: '',
    prefix: '',
    suffix: '',
    raw: '',
  };

  // Parse SEX
  const sexNode = findChild(node, 'SEX');
  let sex: Person['sex'] = 'U';
  if (sexNode) {
    const val = sexNode.value.toUpperCase().trim();
    if (val === 'M') sex = 'M';
    else if (val === 'F') sex = 'F';
  }

  // Parse BIRT
  const birtNode = findChild(node, 'BIRT');
  const birth = birtNode
    ? parseEventDatePlace(birtNode)
    : { date: null, place: null };

  // Parse DEAT
  const deatNode = findChild(node, 'DEAT');
  const death = deatNode
    ? parseEventDatePlace(deatNode)
    : { date: null, place: null };

  // Parse BURI
  const buriNode = findChild(node, 'BURI');
  const burial = buriNode
    ? parseEventDatePlace(buriNode)
    : null;

  // Parse other events
  const eventTags = Object.keys(EVENT_TAG_MAP);
  const skipTags = new Set(['BIRT', 'DEAT', 'BURI']);
  const events: LifeEvent[] = [];

  for (const child of node.children) {
    if (eventTags.includes(child.tag) && !skipTags.has(child.tag)) {
      events.push(parseLifeEvent(child));
    }
  }

  // Collect source references
  const sourceIds = collectSourceRefs(node);

  // Family linkage (FAMS and FAMC)
  const familyIdAsSpouse = findChildren(node, 'FAMS').map((n) => n.value).filter(Boolean);
  const familyIdAsChild = findChildren(node, 'FAMC').map((n) => n.value).filter(Boolean);

  const hasDeath = death.date !== null;
  const birthYear = birth.date?.year ?? null;
  const birthCountry = birth.place?.country ?? null;
  const deathYear = death.date?.year ?? null;

  return {
    id: xref,
    name,
    alternateNames: [],
    sex,
    birth: {
      date: birth.date,
      place: birth.place,
    },
    death: {
      date: death.date,
      place: death.place,
    },
    burial,
    events,
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: 'GEDCOM import — no sources evaluated',
    status: 'tentative',
    sourceIds,
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: xref || null,
    familyIdAsSpouse,
    familyIdAsChild,
    identityHash: computeIdentityHash(name.surname, name.given, birthYear, birthCountry, deathYear),
    privacyLevel: inferPrivacyLevel(hasDeath, birthYear),
    externalIds: {},
    createdAt: now,
    updatedAt: now,
  };
}
