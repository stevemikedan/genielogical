import { describe, it, expect } from 'vitest';
import { generateFollowUpSuggestions } from './follow-up-generator.ts';
import type { ChatContext } from './chat-context.ts';

const baseContext: ChatContext = {
  selectedPersonId: 'p1',
  activeView: 'tree',
  treeSummary: {
    totalPeople: 100,
    totalGenerations: 5,
    subjectName: 'Steve Daniel',
    branchCount: 8,
    topNotableAncestors: [],
    topFlags: [],
    overallHealthScore: 80,
    generationalDistribution: [],
    deepestAncestors: [],
    tierDistribution: [],
  },
  selectedPersonContext: {
    name: 'John Smith',
    dates: 'b. 1800',
    places: 'Edinburgh',
    tier: 3,
    parents: [],
    children: [],
    flags: [],
    sources: [],
    onNotablePaths: [],
    ancestorChainDepth: 0,
    deepestAncestorName: null,
  },
};

describe('generateFollowUpSuggestions', () => {
  it('returns empty array for irrelevant response', () => {
    const suggestions = generateFollowUpSuggestions(
      'Hello, how can I help you today?',
      baseContext,
    );
    expect(suggestions).toHaveLength(0);
  });

  it('suggests more records when sources mentioned', () => {
    const suggestions = generateFollowUpSuggestions(
      'I found a census record from 1851 that lists the family at 14 High Street.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('more records'))).toBe(true);
  });

  it('suggests date confirmation for date issues', () => {
    const suggestions = generateFollowUpSuggestions(
      'The birth date of 1750 is wrong — there is a discrepancy with the marriage record.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('correct date'))).toBe(true);
  });

  it('suggests tier improvement for low confidence', () => {
    const suggestions = generateFollowUpSuggestions(
      'This person is currently at tier 3 (provisional) due to limited sourcing.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('confidence tier'))).toBe(true);
  });

  it('suggests research follow-up for recommendations', () => {
    const suggestions = generateFollowUpSuggestions(
      'I recommend checking the parish registers for further research.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('research approach'))).toBe(true);
  });

  it('suggests reliability check for notable connections', () => {
    const suggestions = generateFollowUpSuggestions(
      'Your tree connects to the royal house through this notable ancestor.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('reliable'))).toBe(true);
  });

  it('suggests evidence for duplicates', () => {
    const suggestions = generateFollowUpSuggestions(
      'These two entries appear to be the same person based on identical names.',
      baseContext,
    );
    expect(suggestions.some(s => s.includes('confirm they are the same'))).toBe(true);
  });

  it('limits to 3 suggestions max', () => {
    const suggestions = generateFollowUpSuggestions(
      'I found a census record and the birth date is wrong. This notable ancestor needs further research and there may be a duplicate entry in your missing documentation.',
      baseContext,
    );
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('personalizes tier suggestion with person name', () => {
    const suggestions = generateFollowUpSuggestions(
      'Currently at tier 4 (unverified), this person has no sources.',
      baseContext,
    );
    const tierSuggestion = suggestions.find(s => s.includes('confidence tier'));
    if (tierSuggestion) {
      expect(tierSuggestion).toContain('John Smith');
    }
  });

  it('handles null context gracefully', () => {
    const suggestions = generateFollowUpSuggestions(
      'The low confidence tier 3 status needs improvement.',
      null,
    );
    // Should still produce suggestions, just not personalized
    expect(suggestions.some(s => s.includes('confidence tier'))).toBe(true);
  });
});
