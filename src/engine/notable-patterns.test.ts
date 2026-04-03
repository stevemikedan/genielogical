import { describe, it, expect } from 'vitest';
import { matchPatterns, KNOWN_FIGURES, TITLE_PATTERNS, ROLE_PATTERNS } from './notable-patterns.ts';

describe('matchPatterns', () => {
  describe('KNOWN_FIGURES', () => {
    it('matches Charlemagne', () => {
      const matches = matchPatterns('Charlemagne');
      expect(matches.some(m => m.category === 'royalty' && m.significance.includes('Carolingian'))).toBe(true);
    });

    it('matches charlemagne case-insensitively', () => {
      const matches = matchPatterns('CHARLEMAGNE the great emperor');
      expect(matches.length).toBeGreaterThan(0);
    });

    it('matches William the Conqueror', () => {
      const matches = matchPatterns('William the Conqueror');
      expect(matches.some(m => m.significance.includes('1066'))).toBe(true);
    });

    it('matches William Conqueror without "the"', () => {
      const matches = matchPatterns('William Conqueror');
      expect(matches.length).toBeGreaterThan(0);
    });

    it('matches Robert the Bruce', () => {
      const matches = matchPatterns('Robert the Bruce');
      expect(matches.some(m => m.category === 'royalty')).toBe(true);
    });

    it('matches Pocahontas', () => {
      const matches = matchPatterns('Pocahontas');
      expect(matches.some(m => m.category === 'indigenous_leader')).toBe(true);
    });

    it('matches Shakespeare', () => {
      const matches = matchPatterns('William Shakespeare');
      expect(matches.some(m => m.category === 'author_theologian')).toBe(true);
    });

    it('matches Mayflower passenger', () => {
      const matches = matchPatterns('John Alden, Mayflower passenger');
      expect(matches.some(m => m.category === 'colonial_gentry')).toBe(true);
    });
  });

  describe('TITLE_PATTERNS', () => {
    it('matches King of England', () => {
      const matches = matchPatterns('King of England');
      expect(matches.some(m => m.category === 'royalty')).toBe(true);
    });

    it('matches King of Scotland', () => {
      const matches = matchPatterns('King of Scotland');
      expect(matches.some(m => m.significance === 'Monarch')).toBe(true);
    });

    it('matches Queen of France', () => {
      const matches = matchPatterns('Queen of France');
      expect(matches.some(m => m.category === 'royalty')).toBe(true);
    });

    it('matches Duke of Norfolk', () => {
      const matches = matchPatterns('Duke of Norfolk');
      expect(matches.some(m => m.significance === 'Duke')).toBe(true);
    });

    it('matches Earl of Richmond', () => {
      const matches = matchPatterns('Earl of Richmond');
      expect(matches.some(m => m.significance === 'Earl')).toBe(true);
    });

    it('matches Knight Templar', () => {
      const matches = matchPatterns('Knight Templar of the Order');
      expect(matches.some(m => m.category === 'military_order')).toBe(true);
    });

    it('matches Prince', () => {
      const matches = matchPatterns('Prince Edward');
      expect(matches.some(m => m.category === 'royalty')).toBe(true);
    });
  });

  describe('ROLE_PATTERNS', () => {
    it('matches Governor', () => {
      const matches = matchPatterns('Governor of Virginia');
      expect(matches.some(m => m.category === 'political')).toBe(true);
    });

    it('matches General', () => {
      const matches = matchPatterns('General Robert E. Lee');
      expect(matches.some(m => m.category === 'military')).toBe(true);
    });

    it('matches Bishop', () => {
      const matches = matchPatterns('Bishop of Canterbury');
      expect(matches.some(m => m.category === 'clergy')).toBe(true);
    });

    it('matches Judge', () => {
      const matches = matchPatterns('Judge John Marshall');
      expect(matches.some(m => m.category === 'legal_scholar')).toBe(true);
    });

    it('matches Physician', () => {
      const matches = matchPatterns('Physician and surgeon');
      expect(matches.some(m => m.category === 'scientist_physician')).toBe(true);
    });

    it('matches Senator', () => {
      const matches = matchPatterns('Senator from Massachusetts');
      expect(matches.some(m => m.category === 'political')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for plain name', () => {
      const matches = matchPatterns('John Smith');
      expect(matches).toHaveLength(0);
    });

    it('returns empty array for empty string', () => {
      const matches = matchPatterns('');
      expect(matches).toHaveLength(0);
    });

    it('can match multiple patterns in one text', () => {
      const matches = matchPatterns('King of England, Knight Templar');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('pattern array integrity', () => {
    it('has 8 known figures', () => {
      expect(KNOWN_FIGURES).toHaveLength(8);
    });

    it('has 11 title patterns', () => {
      expect(TITLE_PATTERNS).toHaveLength(11);
    });

    it('has 8 role patterns', () => {
      expect(ROLE_PATTERNS).toHaveLength(8);
    });
  });
});
