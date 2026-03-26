import { describe, it, expect } from 'vitest';
import {
  buildPersonValidationPrompt,
  parsePersonValidation,
  buildEdgeValidationPrompt,
  parseEdgeValidation,
  buildNotableContextPrompt,
  parseNotableContext,
} from './validation-prompts.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';


function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: { date: null, endDate: null, qualifier: 'about', raw: 'ABT 1750', year: 1750 }, place: { raw: 'Virginia, USA', city: null, county: null, state: 'Virginia', country: 'USA', parts: ['Virginia', 'USA'] } },
    death: { date: { date: null, endDate: null, qualifier: 'about', raw: 'ABT 1820', year: 1820 }, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: 'Unsourced',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: '@I1@',
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    parentId: 'p1',
    childId: 'p2',
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 3,
    confidenceReason: 'Unsourced',
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

describe('buildPersonValidationPrompt', () => {
  it('includes person name and dates in prompt', () => {
    const person = makePerson();
    const { system, user } = buildPersonValidationPrompt(person, [], [], [], []);

    expect(system).toContain('genealogist');
    expect(user).toContain('John Smith');
    expect(user).toContain('ABT 1750');
    expect(user).toContain('suggestedTier');
  });

  it('includes parent and child info', () => {
    const person = makePerson();
    const parent = makePerson({ id: 'p0', name: { full: 'Robert Smith', given: 'Robert', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Smith/' } });
    const child = makePerson({ id: 'p2', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });

    const { user } = buildPersonValidationPrompt(person, [parent], [child], [], []);
    expect(user).toContain('Robert Smith');
    expect(user).toContain('James Smith');
  });

  it('includes source info', () => {
    const person = makePerson();
    const source: Source = {
      id: 's1', origin: 'user_added', sourceClass: 'primary', sourceType: 'vital_record',
      title: 'Birth Certificate', citation: 'VA Vital Records', notes: '', url: null, repository: null,
      provesWhat: ['birth'], attachedToPersonIds: ['p1'], attachedToEdgeIds: [],
      gedcomTag: null, addedAt: new Date(), addedBy: 'user',
    };

    const { user } = buildPersonValidationPrompt(person, [], [], [source], []);
    expect(user).toContain('Birth Certificate');
    expect(user).toContain('primary');
  });
});

describe('parsePersonValidation', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      summary: 'Plausible person',
      suggestedTier: 3,
      historicalNotes: ['Dates align with colonial Virginia'],
      sourceSuggestions: [
        { sourceName: 'VA Records', repository: 'State Archives', url: null, reasoning: 'Check birth records' },
      ],
    });

    const result = parsePersonValidation('p1', response);
    expect(result).not.toBeNull();
    expect(result!.personId).toBe('p1');
    expect(result!.summary).toBe('Plausible person');
    expect(result!.suggestedTier).toBe(3);
    expect(result!.historicalNotes).toHaveLength(1);
    expect(result!.sourceSuggestions).toHaveLength(1);
    expect(result!.modelId).toBe('claude-sonnet-4-20250514');
  });

  it('handles JSON embedded in markdown', () => {
    const response = 'Here is my analysis:\n```json\n{"summary":"Test","suggestedTier":2,"historicalNotes":[],"sourceSuggestions":[]}\n```';
    const result = parsePersonValidation('p1', response);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe(2);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePersonValidation('p1', 'not json')).toBeNull();
  });

  it('clamps invalid tier to 4', () => {
    const response = JSON.stringify({ summary: 'Test', suggestedTier: 9, historicalNotes: [], sourceSuggestions: [] });
    const result = parsePersonValidation('p1', response);
    expect(result!.suggestedTier).toBe(4);
  });
});

describe('buildEdgeValidationPrompt', () => {
  it('includes parent and child info', () => {
    const parent = makePerson({ id: 'p1' });
    const child = makePerson({ id: 'p2', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const edge = makeEdge();

    const { user } = buildEdgeValidationPrompt(parent, child, edge, []);
    expect(user).toContain('John Smith');
    expect(user).toContain('James Smith');
    expect(user).toContain('biological');
  });
});

describe('parseEdgeValidation', () => {
  it('parses valid response', () => {
    const response = JSON.stringify({
      plausibility: 'plausible',
      reasoning: 'Dates are consistent',
      suggestedSources: ['Church records'],
    });

    const result = parseEdgeValidation('e1', 'p1', 'p2', response);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBe('plausible');
    expect(result!.suggestedSources).toContain('Church records');
  });

  it('defaults invalid plausibility to plausible', () => {
    const response = JSON.stringify({ plausibility: 'banana', reasoning: 'Test', suggestedSources: [] });
    const result = parseEdgeValidation('e1', 'p1', 'p2', response);
    expect(result!.plausibility).toBe('plausible');
  });
});

describe('buildNotableContextPrompt', () => {
  it('includes person name and generation count', () => {
    const person = makePerson({ name: { full: 'Robert the Bruce', given: 'Robert', middle: '', surname: 'Bruce', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Bruce/' } });
    const { user } = buildNotableContextPrompt(person, 15);
    expect(user).toContain('Robert the Bruce');
    expect(user).toContain('15');
  });
});

describe('parseNotableContext', () => {
  it('parses valid response', () => {
    const response = JSON.stringify({
      historicalContext: 'King of Scotland 1306-1329',
      connectionPlausibility: 'Many legitimate lines descend from the Bruce',
      suggestedReadings: ['The Bruce by John Barbour'],
    });

    const result = parseNotableContext('p1', response);
    expect(result).not.toBeNull();
    expect(result!.historicalContext).toContain('King of Scotland');
    expect(result!.suggestedReadings).toHaveLength(1);
  });
});
