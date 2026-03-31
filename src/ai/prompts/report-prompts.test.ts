import { describe, it, expect } from 'vitest';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import {
  buildReportNarrativePrompt,
  parseReportNarrativeResult,
  REPORT_NARRATIVE_SYSTEM_PROMPT,
} from './report-prompts.ts';

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: { full: 'Queen Margaret', given: 'Margaret', middle: '', surname: '', maidenName: '', prefix: 'Queen', suffix: '', raw: 'Queen Margaret' },
    alternateNames: [],
    sex: 'F',
    birth: { date: { date: new Date(1045, 0, 1), endDate: null, qualifier: 'about', raw: 'abt 1045', year: 1045 }, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: '',
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

describe('buildReportNarrativePrompt', () => {
  it('includes report type context', () => {
    const { user } = buildReportNarrativePrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      'notable_women',
      ['Queen consort or regnant'],
      0.36,
      'medieval_europe',
    );

    expect(user).toContain('Notable Women');
  });

  it('includes match reasons and ancestral confidence', () => {
    const { user } = buildReportNarrativePrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      'notable_women',
      ['Monarch', 'Royalty'],
      0.42,
      'medieval_europe',
    );

    expect(user).toContain('Monarch');
    expect(user).toContain('Royalty');
    expect(user).toContain('42%');
  });

  it('includes era tag', () => {
    const { user } = buildReportNarrativePrompt(
      makePerson(),
      { father: null, mother: null },
      [],
      'notable_men',
      ['Military officer'],
      0.5,
      'us_colonial',
    );

    expect(user).toContain('us_colonial');
  });

  it('includes sources when available', () => {
    const source: Source = {
      id: 's1',
      origin: 'user_added',
      sourceClass: 'primary',
      sourceType: 'vital_record',
      title: 'Birth Certificate',
      citation: 'City Hall Records',
      notes: '',
      url: null,
      repository: null,
      provesWhat: ['birth'],
      attachedToPersonIds: [],
      attachedToEdgeIds: [],
      gedcomTag: null,
      addedAt: new Date(),
      addedBy: 'test',
    };

    const { user } = buildReportNarrativePrompt(
      makePerson(),
      { father: null, mother: null },
      [source],
      'notable_women',
      ['Queen'],
      0.5,
      'medieval_europe',
    );

    expect(user).toContain('Birth Certificate');
  });

  it('system prompt requests JSON format', () => {
    expect(REPORT_NARRATIVE_SYSTEM_PROMPT).toContain('JSON');
    expect(REPORT_NARRATIVE_SYSTEM_PROMPT).toContain('narrative');
    expect(REPORT_NARRATIVE_SYSTEM_PROMPT).toContain('plausibility');
  });
});

describe('parseReportNarrativeResult', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      plausibility: 'plausible',
      narrative: 'Queen Margaret was a notable figure.',
      issues: [{ type: 'date', description: 'Birth year uncertain' }],
      suggestedTier: 2,
    });

    const result = parseReportNarrativeResult(json);
    expect(result).not.toBeNull();
    expect(result!.narrative).toContain('Queen Margaret');
    expect(result!.plausibility).toBe('plausible');
    expect(result!.issues).toHaveLength(1);
    expect(result!.suggestedTier).toBe(2);
  });

  it('parses JSON in code fence', () => {
    const text = '```json\n{"plausibility":"confirmed","narrative":"Test.","issues":[],"suggestedTier":1}\n```';
    const result = parseReportNarrativeResult(text);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBe('confirmed');
  });

  it('returns null for garbage input', () => {
    expect(parseReportNarrativeResult('not json at all')).toBeNull();
  });
});
