import { describe, it, expect } from 'vitest';
import { parseEnrichResponse, buildEnrichPrompt } from './enrich-prompts.ts';
import type { Person } from '@/types/person.ts';

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test',
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
  };
}

describe('parseEnrichResponse', () => {
  it('parses a complete response with source metadata', () => {
    const json = JSON.stringify({
      identifiedAs: 'Robert Burns (1759-1796), Scottish poet',
      summary: 'Well-known Scottish poet, highly confident identification.',
      sourcesSearched: ['FamilySearch', 'ScotlandsPeople', 'FindAGrave'],
      suggestions: [
        {
          field: 'birthDate',
          label: 'Birth Date',
          value: '25 January 1759',
          reasoning: 'Old Parish Register, Alloway, Ayrshire confirms birth date',
          confidence: 'high',
          sourceHint: 'Old Parish Register, Alloway, Ayrshire',
          searchUrl: 'https://www.scotlandspeople.gov.uk/search?surname=Burns&forename=Robert',
          sourceDatabase: 'ScotlandsPeople',
        },
        {
          field: 'birthPlace',
          label: 'Birth Place',
          value: 'Alloway, Ayrshire, Scotland',
          reasoning: 'Born in a cottage in Alloway',
          confidence: 'high',
          sourceHint: null,
          searchUrl: null,
          sourceDatabase: 'FamilySearch',
        },
        {
          field: 'deathDate',
          label: 'Death Date',
          value: '21 July 1796',
          reasoning: 'Died in Dumfries',
          confidence: 'high',
          sourceHint: 'Dumfries parish records',
          searchUrl: null,
          sourceDatabase: null,
        },
        {
          field: 'sex',
          label: 'Sex',
          value: 'Male',
          reasoning: 'Robert Burns was male',
          confidence: 'high',
          sourceHint: null,
          searchUrl: null,
          sourceDatabase: null,
        },
        {
          field: 'spouse',
          label: 'Spouse',
          value: 'Jean Armour',
          reasoning: 'Married Jean Armour in 1788',
          confidence: 'high',
          sourceHint: 'Mauchline parish register',
          searchUrl: null,
          sourceDatabase: 'ScotlandsPeople',
        },
        {
          field: 'occupation',
          label: 'Occupation',
          value: 'Poet, farmer',
          reasoning: 'Known as the national poet of Scotland',
          confidence: 'high',
          sourceHint: null,
          searchUrl: null,
          sourceDatabase: null,
        },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result).not.toBeNull();
    expect(result!.personId).toBe('p1');
    expect(result!.identifiedAs).toBe('Robert Burns (1759-1796), Scottish poet');
    expect(result!.suggestions).toHaveLength(6);
    expect(result!.suggestions[0].field).toBe('birthDate');
    expect(result!.suggestions[0].value).toBe('25 January 1759');
    expect(result!.suggestions[0].confidence).toBe('high');
    expect(result!.suggestions[0].sourceHint).toBe('Old Parish Register, Alloway, Ayrshire');
    expect(result!.suggestions[0].searchUrl).toBe('https://www.scotlandspeople.gov.uk/search?surname=Burns&forename=Robert');
    expect(result!.suggestions[0].recordUrl).toBeNull(); // defaults to null when not in response
    expect(result!.suggestions[0].sourceDatabase).toBe('ScotlandsPeople');
    expect(result!.sourcesSearched).toEqual(['FamilySearch', 'ScotlandsPeople', 'FindAGrave']);
  });

  it('returns null for non-JSON response', () => {
    expect(parseEnrichResponse('p1', 'I cannot help with that.')).toBeNull();
  });

  it('handles response with no suggestions', () => {
    const json = JSON.stringify({
      identifiedAs: null,
      summary: 'Name is too common to identify.',
      suggestions: [],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result).not.toBeNull();
    expect(result!.suggestions).toHaveLength(0);
    expect(result!.identifiedAs).toBeNull();
    expect(result!.sourcesSearched).toEqual([]);
  });

  it('filters out invalid field names', () => {
    const json = JSON.stringify({
      summary: 'Test',
      suggestions: [
        { field: 'birthDate', value: '1800', label: 'Birth', reasoning: '', confidence: 'low', sourceHint: null },
        { field: 'invalidField', value: 'foo', label: 'Bad', reasoning: '', confidence: 'low', sourceHint: null },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result!.suggestions).toHaveLength(1);
    expect(result!.suggestions[0].field).toBe('birthDate');
  });

  it('accepts sibling field', () => {
    const json = JSON.stringify({
      summary: 'Test',
      suggestions: [
        { field: 'sibling', value: 'Gilbert Burns', label: 'Sibling', reasoning: 'Listed in household in 1770 census', confidence: 'medium', sourceHint: null },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result!.suggestions).toHaveLength(1);
    expect(result!.suggestions[0].field).toBe('sibling');
    expect(result!.suggestions[0].value).toBe('Gilbert Burns');
  });

  it('defaults confidence to low for invalid values', () => {
    const json = JSON.stringify({
      summary: 'Test',
      suggestions: [
        { field: 'birthDate', value: '1800', label: 'Birth', reasoning: '', confidence: 'super_high', sourceHint: null },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result!.suggestions[0].confidence).toBe('low');
  });

  it('defaults searchUrl, recordUrl, and sourceDatabase to null when missing', () => {
    const json = JSON.stringify({
      summary: 'Test',
      suggestions: [
        { field: 'birthDate', value: '1800', label: 'Birth', reasoning: '', confidence: 'low', sourceHint: null },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result!.suggestions[0].searchUrl).toBeNull();
    expect(result!.suggestions[0].recordUrl).toBeNull();
    expect(result!.suggestions[0].sourceDatabase).toBeNull();
  });

  it('parses recordUrl when present', () => {
    const json = JSON.stringify({
      summary: 'Test',
      suggestions: [
        {
          field: 'deathPlace',
          value: 'Dumfries, Scotland',
          label: 'Death Place',
          reasoning: 'Found on FindAGrave memorial page',
          confidence: 'high',
          sourceHint: 'FindAGrave memorial',
          searchUrl: 'https://www.findagrave.com/memorial/search?firstname=Robert&lastname=Burns',
          recordUrl: 'https://www.findagrave.com/memorial/3562/robert-burns',
          sourceDatabase: 'FindAGrave',
        },
      ],
    });

    const result = parseEnrichResponse('p1', json);
    expect(result!.suggestions[0].recordUrl).toBe('https://www.findagrave.com/memorial/3562/robert-burns');
    expect(result!.suggestions[0].searchUrl).toBe('https://www.findagrave.com/memorial/search?firstname=Robert&lastname=Burns');
  });

  it('handles JSON embedded in text', () => {
    const response = `Here is my analysis:\n\n${JSON.stringify({
      identifiedAs: 'Test Person',
      summary: 'Found a match.',
      sourcesSearched: ['FamilySearch'],
      suggestions: [{ field: 'sex', value: 'Male', label: 'Sex', reasoning: 'test', confidence: 'medium', sourceHint: null }],
    })}\n\nI hope that helps.`;

    const result = parseEnrichResponse('p1', response);
    expect(result).not.toBeNull();
    expect(result!.suggestions).toHaveLength(1);
    expect(result!.sourcesSearched).toEqual(['FamilySearch']);
  });
});

describe('buildEnrichPrompt', () => {
  it('includes person name in prompt', () => {
    const person = makePerson('p1', 'Robert Burns');
    const { user } = buildEnrichPrompt(person, [], [], []);
    expect(user).toContain('Robert Burns');
  });

  it('lists missing fields', () => {
    const person = makePerson('p1', 'John Smith');
    const { user } = buildEnrichPrompt(person, [], [], []);
    expect(user).toContain('birthDate');
    expect(user).toContain('deathDate');
  });

  it('includes family context when provided', () => {
    const person = makePerson('p1', 'John Smith');
    const parent = makePerson('p2', 'James Smith');
    const { user } = buildEnrichPrompt(person, [parent], [], []);
    expect(user).toContain('James Smith');
    expect(user).toContain('Known Parents');
  });

  it('includes sibling context when provided', () => {
    const person = makePerson('p1', 'John Smith');
    const sibling = makePerson('p3', 'William Smith');
    const { user } = buildEnrichPrompt(person, [], [], [], [sibling]);
    expect(user).toContain('William Smith');
    expect(user).toContain('Known Siblings');
  });

  it('includes source database references', () => {
    const person = makePerson('p1', 'John Smith');
    const { user } = buildEnrichPrompt(person, [], [], []);
    expect(user).toContain('FamilySearch');
    expect(user).toContain('searchUrl');
    expect(user).toContain('sourceDatabase');
  });

  it('mentions sibling as valid field type', () => {
    const person = makePerson('p1', 'John Smith');
    const { user } = buildEnrichPrompt(person, [], [], []);
    expect(user).toContain('"sibling"');
  });

  it('system prompt instructs record-based suggestions', () => {
    const person = makePerson('p1', 'John Smith');
    const { system } = buildEnrichPrompt(person, [], [], []);
    expect(system).toContain('genealogical databases');
    expect(system).toContain('census');
    expect(system).toContain('vital records');
  });

  it('system prompt mentions web_fetch for record verification', () => {
    const person = makePerson('p1', 'John Smith');
    const { system } = buildEnrichPrompt(person, [], [], []);
    expect(system).toContain('web_fetch');
    expect(system).toContain('recordUrl');
    expect(system).toContain('RECORD VERIFICATION');
  });

  it('includes reference URLs in user prompt when provided', () => {
    const person = makePerson('p1', 'Robert Burns');
    const urls = [
      'https://www.findagrave.com/memorial/3562/robert-burns',
      'https://www.familysearch.org/tree/person/details/LHZD-H15',
    ];
    const { user } = buildEnrichPrompt(person, [], [], [], [], urls);
    expect(user).toContain('Reference Links Provided');
    expect(user).toContain('https://www.findagrave.com/memorial/3562/robert-burns');
    expect(user).toContain('https://www.familysearch.org/tree/person/details/LHZD-H15');
    expect(user).toContain('web_fetch');
  });

  it('does not include reference section when no URLs provided', () => {
    const person = makePerson('p1', 'John Smith');
    const { user } = buildEnrichPrompt(person, [], [], [], [], []);
    expect(user).not.toContain('Reference Links Provided');
  });

  it('user prompt includes recordUrl in the JSON schema', () => {
    const person = makePerson('p1', 'John Smith');
    const { user } = buildEnrichPrompt(person, [], [], []);
    expect(user).toContain('"recordUrl"');
  });
});
