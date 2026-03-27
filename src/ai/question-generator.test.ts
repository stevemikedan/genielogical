import { describe, it, expect } from 'vitest';
import { generateResearchQuestions } from './question-generator.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Flag } from '@/types/flag.ts';
import type { LocationContext } from './era-context.ts';

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
    alternateNames: [],
    sex: 'M',
    birth: {
      date: { year: 1850, date: null, endDate: null, raw: '1850', qualifier: 'exact' as const },
      place: { raw: 'Cabarrus County, North Carolina', country: 'United States', state: 'North Carolina', county: 'Cabarrus', city: null, parts: ['', 'Cabarrus', 'North Carolina', 'United States'] },
    },
    death: {
      date: { year: 1920, date: null, endDate: null, raw: '1920', qualifier: 'exact' as const },
      place: null,
    },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'Test',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Person;
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    parentId: 'p2',
    childId: 'p1',
    relationshipType: 'biological',
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'No sources',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: 'f1',
    category: 'chronological',
    severity: 'warning',
    title: 'Date issue',
    description: 'Date seems wrong',
    suggestedAction: 'Check dates',
    ruleId: 'CHRONO_IMPOSSIBLE',
    affectedPersonIds: ['p1'],
    affectedEdgeIds: [],
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

const defaultLocation: LocationContext = {
  country: 'US',
  region: 'North Carolina',
  availableRepositories: [],
  knownGaps: [],
};

describe('generateResearchQuestions', () => {
  it('generates census question for US modern era with no sources', () => {
    const person = makePerson();
    const questions = generateResearchQuestions(
      person,
      { father: null, mother: null },
      null,
      [],
      'us_modern',
      defaultLocation,
    );
    expect(questions.some(q => q.includes('Census'))).toBe(true);
    expect(questions.some(q => q.includes('John Smith'))).toBe(true);
  });

  it('generates parental link question for unsourced edge', () => {
    const person = makePerson();
    const father = makePerson({ id: 'p2', name: { ...person.name, full: 'James Smith', given: 'James' } });
    const edge = makeEdge({ confidenceTier: 4 });
    const questions = generateResearchQuestions(
      person,
      { father, mother: null },
      edge,
      [],
      'us_antebellum',
      defaultLocation,
    );
    expect(questions.some(q => q.includes('child of James Smith'))).toBe(true);
  });

  it('generates title verification question for prestige flag', () => {
    const person = makePerson({
      name: { full: 'King Robert Stewart', given: 'Robert', middle: '', surname: 'Stewart', maidenName: '', prefix: '', suffix: '', raw: 'King Robert /Stewart/' },
    });
    const flag = makeFlag({ ruleId: 'PRESTIGE_TITLE_IN_NAME', category: 'prestige_inflation' });
    const questions = generateResearchQuestions(
      person,
      { father: null, mother: null },
      null,
      [flag],
      'scotland_opr',
      defaultLocation,
    );
    expect(questions.some(q => q.includes('title') && q.includes('King'))).toBe(true);
  });

  it('generates chronological flag question', () => {
    const flag = makeFlag({ category: 'chronological' });
    const questions = generateResearchQuestions(
      makePerson(),
      { father: null, mother: null },
      null,
      [flag],
      'us_antebellum',
      defaultLocation,
    );
    expect(questions.some(q => q.includes('flagged as problematic'))).toBe(true);
  });

  it('generates Scotland OPR question for Scottish era', () => {
    const person = makePerson({
      birth: {
        date: { year: 1700, date: null, endDate: null, raw: '1700', qualifier: 'exact' as const },
        place: { raw: 'Edinburgh, Scotland', country: 'Scotland', state: null, county: null, city: 'Edinburgh', parts: ['Edinburgh', '', '', 'Scotland'] },
      },
    });
    const questions = generateResearchQuestions(
      person,
      { father: null, mother: null },
      null,
      [],
      'scotland_opr',
      { country: 'Scotland', region: null, availableRepositories: [], knownGaps: [] },
    );
    expect(questions.some(q => q.includes('Old Parochial Records'))).toBe(true);
  });

  it('generates source desert question when zero sources', () => {
    const questions = generateResearchQuestions(
      makePerson({ sourceIds: [] }),
      { father: null, mother: null },
      null,
      [],
      'us_modern',
      defaultLocation,
    );
    expect(questions.some(q => q.includes('zero attached sources'))).toBe(true);
  });

  it('limits to max 8 questions', () => {
    const flags = [
      makeFlag({ category: 'chronological' }),
      makeFlag({ ruleId: 'PRESTIGE_TITLE_IN_NAME', category: 'prestige_inflation' }),
      makeFlag({ category: 'duplicate_suspect' }),
    ];
    const person = makePerson({
      name: { full: 'King John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'King John /Smith/' },
    });
    const father = makePerson({ id: 'p2', name: { ...person.name, full: 'James Smith' } });
    const mother = makePerson({ id: 'p3', name: { ...person.name, full: 'Mary Jones' } });
    const edge = makeEdge({ confidenceTier: 4 });
    const questions = generateResearchQuestions(
      person,
      { father, mother },
      edge,
      flags,
      'us_modern',
      defaultLocation,
    );
    expect(questions.length).toBeLessThanOrEqual(8);
    expect(questions.length).toBeGreaterThan(0);
  });
});
