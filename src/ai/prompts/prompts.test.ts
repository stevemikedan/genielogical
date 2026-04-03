import { describe, it, expect } from 'vitest';
import { buildQuickCheckUserPrompt, QUICK_CHECK_SYSTEM_PROMPT } from './system-quick.ts';
import { buildValidationUserPrompt, VALIDATION_SYSTEM_PROMPT } from './system-validation.ts';
import { buildDeepResearchUserPrompt, buildFollowUpPrompt, DEEP_RESEARCH_SYSTEM_PROMPT } from './system-deep-research.ts';
import { formatPersonBlock, formatSourcesSummary, formatFlagsSummary, formatLocationContext } from './user-templates.ts';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { Edge } from '@/types/edge.ts';
import type { DeepResearchTask } from '@/types/ai.ts';
import type { LocationContext } from '@/ai/era-context.ts';

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
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Person;
}

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 's1',
    origin: 'user_added',
    sourceClass: 'secondary',
    sourceType: 'census',
    title: '1850 Census',
    citation: 'Cabarrus County, NC',
    notes: '',
    url: null,
    repository: 'FamilySearch',
    provesWhat: ['residence'],
    attachedToPersonIds: ['p1'],
    attachedToEdgeIds: [],
    gedcomTag: null,
    sourceHash: '',
    addedAt: new Date(),
    addedBy: 'user',
    ...overrides,
  };
}

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: 'f1',
    category: 'chronological',
    severity: 'warning',
    title: 'Date issue',
    description: 'Birth and death dates too close',
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
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

const defaultLocation: LocationContext = {
  country: 'US',
  region: 'North Carolina',
  availableRepositories: [
    { name: 'FamilySearch', url: 'https://www.familysearch.org', accessLevel: 'free', recordTypes: ['census'], coverage: 'US Census 1790-1950' },
  ],
  knownGaps: [],
};

// ── User Templates ──────────────────────────────────────────────

describe('formatPersonBlock', () => {
  it('formats person with parents and children', () => {
    const person = makePerson();
    const father = makePerson({ id: 'p2', name: { ...person.name, full: 'James Smith', given: 'James' } });
    const child = makePerson({ id: 'p3', name: { ...person.name, full: 'Mary Smith', given: 'Mary' }, birth: { date: { year: 1880, date: null, endDate: null, raw: '1880', qualifier: 'exact' as const }, place: null } });
    const result = formatPersonBlock(person, { father, mother: null }, [child]);

    expect(result).toContain('John Smith');
    expect(result).toContain('Father: James Smith');
    expect(result).toContain('Mother: Unknown');
    expect(result).toContain('Mary Smith');
  });

  it('includes alternate names', () => {
    const person = makePerson({
      alternateNames: [
        { name: { full: 'Jon Smyth', given: 'Jon', middle: '', surname: 'Smyth', maidenName: '', prefix: '', suffix: '', raw: 'Jon /Smyth/' }, type: 'aka', notes: '' },
        { name: { full: 'Johannes Schmidt', given: 'Johannes', middle: '', surname: 'Schmidt', maidenName: '', prefix: '', suffix: '', raw: 'Johannes /Schmidt/' }, type: 'immigrant', notes: '' },
      ],
    });
    const result = formatPersonBlock(person, { father: null, mother: null }, []);
    expect(result).toContain('Jon Smyth');
    expect(result).toContain('Johannes Schmidt');
  });

  it('handles person with no parents or children', () => {
    const result = formatPersonBlock(makePerson(), { father: null, mother: null }, []);
    expect(result).toContain('Father: Unknown');
    expect(result).toContain('Mother: Unknown');
    expect(result).toContain('None recorded');
  });
});

describe('formatSourcesSummary', () => {
  it('returns "No sources" for empty array', () => {
    expect(formatSourcesSummary([])).toBe('No sources attached.');
  });

  it('formats sources with class and type', () => {
    const result = formatSourcesSummary([makeSource()]);
    expect(result).toContain('[secondary/census]');
    expect(result).toContain('1850 Census');
  });
});

describe('formatFlagsSummary', () => {
  it('returns "No flags" for empty array', () => {
    expect(formatFlagsSummary([])).toBe('No flags.');
  });

  it('formats flags with severity and category', () => {
    const result = formatFlagsSummary([makeFlag()]);
    expect(result).toContain('[warning/chronological]');
    expect(result).toContain('Date issue');
  });
});

describe('formatLocationContext', () => {
  it('includes country and repositories', () => {
    const result = formatLocationContext(defaultLocation);
    expect(result).toContain('Country: US');
    expect(result).toContain('Region: North Carolina');
    expect(result).toContain('FamilySearch');
  });

  it('includes known gaps', () => {
    const location: LocationContext = {
      ...defaultLocation,
      knownGaps: ['Some records destroyed in fire'],
    };
    const result = formatLocationContext(location);
    expect(result).toContain('records destroyed');
  });
});

// ── Mode 1: Quick Check ─────────────────────────────────────────

describe('buildQuickCheckUserPrompt', () => {
  it('builds a prompt with person data', () => {
    const prompt = buildQuickCheckUserPrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      [],
      [],
      'us_antebellum',
    );
    expect(prompt).toContain('John Smith');
    expect(prompt).toContain('us_antebellum');
    expect(prompt).toContain('plausibility');
    expect(prompt).toContain('JSON');
  });

  it('includes flags in prompt', () => {
    const prompt = buildQuickCheckUserPrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      [],
      [makeFlag()],
      'us_antebellum',
    );
    expect(prompt).toContain('Date issue');
  });
});

describe('QUICK_CHECK_SYSTEM_PROMPT', () => {
  it('instructs direct non-hedging response', () => {
    expect(QUICK_CHECK_SYSTEM_PROMPT).toContain('NOT to be polite or hedging');
    expect(QUICK_CHECK_SYSTEM_PROMPT).toContain('JSON format');
  });
});

// ── Mode 2: Validation ──────────────────────────────────────────

describe('buildValidationUserPrompt', () => {
  it('builds prompt with person, edge, and questions', () => {
    const person = makePerson();
    const edge = makeEdge();
    const prompt = buildValidationUserPrompt(
      person,
      { father: null, mother: null },
      [],
      [makeSource()],
      [makeFlag()],
      'us_antebellum',
      defaultLocation,
      ['Search for census record', 'Check marriage bonds'],
      edge,
    );
    expect(prompt).toContain('John Smith');
    expect(prompt).toContain('us_antebellum');
    expect(prompt).toContain('Search for census record');
    expect(prompt).toContain('Check marriage bonds');
    expect(prompt).toContain('PARENTAL EDGE');
    expect(prompt).toContain('biological');
    expect(prompt).toContain('FamilySearch');
  });

  it('omits edge block when no edge', () => {
    const prompt = buildValidationUserPrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      [],
      [],
      'us_modern',
      defaultLocation,
      [],
      null,
    );
    expect(prompt).not.toContain('PARENTAL EDGE');
  });
});

describe('VALIDATION_SYSTEM_PROMPT', () => {
  it('includes search strategy guidance', () => {
    expect(VALIDATION_SYSTEM_PROMPT).toContain('SEARCH STRATEGY');
    expect(VALIDATION_SYSTEM_PROMPT).toContain('FamilySearch');
    expect(VALIDATION_SYSTEM_PROMPT).toContain('Scotland');
  });
});

// ── Mode 3: Deep Research ───────────────────────────────────────

describe('buildDeepResearchUserPrompt', () => {
  it('builds prompt with task description', () => {
    const task: DeepResearchTask = {
      type: 'verify_person',
      primaryPersonId: 'p1',
      secondaryPersonId: null,
      edgeIds: [],
      eraTag: 'us_antebellum',
      locationContext: defaultLocation,
      existingSources: [],
      activeFlags: [],
      researchQuestions: ['Search for census record'],
      pathPersonIds: null,
      notableAncestorName: null,
    };
    const prompt = buildDeepResearchUserPrompt(
      task,
      makePerson(),
      { father: null, mother: null },
      [],
      [],
      [],
      defaultLocation,
    );
    expect(prompt).toContain('RESEARCH TASK');
    expect(prompt).toContain('Verify this person');
    expect(prompt).toContain('Search for census record');
    expect(prompt).toContain('Begin Round 1');
  });

  it('includes notable ancestor name for path verification', () => {
    const task: DeepResearchTask = {
      type: 'verify_notable_path',
      primaryPersonId: 'p1',
      secondaryPersonId: null,
      edgeIds: [],
      eraTag: 'medieval_europe',
      locationContext: { country: 'Scotland', region: null, availableRepositories: [], knownGaps: [] },
      existingSources: [],
      activeFlags: [],
      researchQuestions: [],
      pathPersonIds: ['p1', 'p2', 'p3'],
      notableAncestorName: 'Robert the Bruce',
    };
    const prompt = buildDeepResearchUserPrompt(
      task,
      makePerson(),
      { father: null, mother: null },
      [],
      [],
      [],
      task.locationContext,
    );
    expect(prompt).toContain('Robert the Bruce');
  });
});

describe('buildFollowUpPrompt', () => {
  it('includes previous findings and status', () => {
    const prompt = buildFollowUpPrompt('Found census record', 'CONTINUE');
    expect(prompt).toContain('Found census record');
    expect(prompt).toContain('CONTINUE');
    expect(prompt).toContain('next round');
  });
});

describe('DEEP_RESEARCH_SYSTEM_PROMPT', () => {
  it('includes methodology rounds', () => {
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('ROUND 1: ORIENTATION');
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('ROUND 2: TARGETED SEARCH');
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('ROUND 3: CROSS-REFERENCE');
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('ROUND 4: SYNTHESIS');
  });

  it('includes STATUS protocol', () => {
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('STATUS: CONTINUE');
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('STATUS: COMPLETE');
    expect(DEEP_RESEARCH_SYSTEM_PROMPT).toContain('STATUS: DEAD_END');
  });
});
