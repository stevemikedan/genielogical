import { describe, it, expect } from 'vitest';
import { findCrossTreeMatches, findMatchesForPerson } from './cross-tree-matcher.ts';
import { makePerson, makeGraph } from '@/test/test-utils.ts';
import type { DateParsed, PlaceNormalized } from '@/types/common.ts';

function withBirth(year: number, place?: string) {
  const date: DateParsed = { date: new Date(year, 0, 1), endDate: null, qualifier: 'exact', raw: `${year}`, year };
  const placeObj: PlaceNormalized | null = place ? { raw: place, country: null, state: null, county: null, city: place, parts: [place] } : null;
  return { date, place: placeObj };
}

function withDeath(year: number) {
  const date: DateParsed = { date: new Date(year, 0, 1), endDate: null, qualifier: 'exact', raw: `${year}`, year };
  return { date, place: null };
}

describe('findCrossTreeMatches', () => {
  it('finds exact name match', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].score).toBeGreaterThan(0.4);
  });

  it('rejects completely different names', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', name: { full: 'Alice Williams', given: 'Alice', middle: '', surname: 'Williams', maidenName: '', prefix: '', suffix: '', raw: 'Alice Williams' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', name: { full: 'Bob Johnson', given: 'Bob', middle: '', surname: 'Johnson', maidenName: '', prefix: '', suffix: '', raw: 'Bob Johnson' } })]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches).toHaveLength(0);
  });

  it('rejects sex mismatch', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', sex: 'M', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', sex: 'F', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches).toHaveLength(0);
  });

  it('allows sex=U to match anything', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', sex: 'U', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', sex: 'M', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects birth year diff > 10', () => {
    const personA = makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personA.birth = withBirth(1800);
    const personB = makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personB.birth = withBirth(1850);
    const graphA = makeGraph([personA]);
    const graphB = makeGraph([personB]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches).toHaveLength(0);
  });

  it('boosts score for same birth year', () => {
    const personA = makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personA.birth = withBirth(1850);
    const personB = makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personB.birth = withBirth(1850);
    const graphA = makeGraph([personA]);
    const graphB = makeGraph([personB]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].reasons).toContain('Same birth year');
  });

  it('handles place overlap', () => {
    const personA = makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personA.birth = withBirth(1850, 'Edinburgh, Scotland');
    const personB = makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personB.birth = withBirth(1850, 'Edinburgh, Scotland');
    const graphA = makeGraph([personA]);
    const graphB = makeGraph([personB]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].reasons).toContain('Birth places overlap');
  });

  it('sorts matches by score descending', () => {
    const personA1 = makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    const personA2 = makePerson({ id: 'a2', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane Doe' } });
    personA1.birth = withBirth(1850);
    const graphA = makeGraph([personA1, personA2]);

    const personB1 = makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personB1.birth = withBirth(1850);
    const personB2 = makePerson({ id: 'b2', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane Doe' } });
    const graphB = makeGraph([personB1, personB2]);

    const matches = findCrossTreeMatches(graphA, graphB);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score);
    }
  });

  it('assigns confidence levels based on score', () => {
    // Exact name + exact birth + exact death = high score → confirmed
    const personA = makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personA.birth = withBirth(1850, 'London, England');
    personA.death = withDeath(1920);
    const personB = makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } });
    personB.birth = withBirth(1850, 'London, England');
    personB.death = withDeath(1920);

    const graphA = makeGraph([personA]);
    const graphB = makeGraph([personB]);
    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].confidence).toBe('confirmed');
  });

  it('handles empty graphs', () => {
    const graphA = makeGraph();
    const graphB = makeGraph([makePerson({ id: 'b1' })]);
    expect(findCrossTreeMatches(graphA, graphB)).toHaveLength(0);
  });

  it('normalizes titles in names', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', name: { full: 'Dr. John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: 'Dr.', suffix: '', raw: 'Dr. John Smith' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);

    const matches = findCrossTreeMatches(graphA, graphB);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('respects minScore parameter', () => {
    const graphA = makeGraph([makePerson({ id: 'a1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);
    const graphB = makeGraph([makePerson({ id: 'b1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);

    const strict = findCrossTreeMatches(graphA, graphB, 0.9);
    const lenient = findCrossTreeMatches(graphA, graphB, 0.1);
    expect(lenient.length).toBeGreaterThanOrEqual(strict.length);
  });
});

describe('findMatchesForPerson', () => {
  it('finds matches for a single person in another graph', () => {
    const person = makePerson({ id: 'a1', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane Doe' } });
    const graphB = makeGraph([
      makePerson({ id: 'b1', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane Doe' } }),
      makePerson({ id: 'b2', name: { full: 'Bob Jones', given: 'Bob', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Bob Jones' } }),
    ]);

    const matches = findMatchesForPerson(person, graphB);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].personB.id).toBe('b1');
  });

  it('returns empty when no match found', () => {
    const person = makePerson({ id: 'a1', name: { full: 'Unique Person XYZ', given: 'Unique', middle: '', surname: 'XYZ', maidenName: '', prefix: '', suffix: '', raw: 'Unique Person XYZ' } });
    const graphB = makeGraph([
      makePerson({ id: 'b1', name: { full: 'Alice Williams', given: 'Alice', middle: '', surname: 'Williams', maidenName: '', prefix: '', suffix: '', raw: 'Alice Williams' } }),
    ]);

    const matches = findMatchesForPerson(person, graphB);
    expect(matches).toHaveLength(0);
  });
});
