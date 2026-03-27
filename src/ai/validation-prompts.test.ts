import { describe, it, expect } from 'vitest';
import {
  buildNotableContextPrompt,
  parseNotableContext,
} from './validation-prompts.ts';
import type { Person } from '@/types/person.ts';


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
