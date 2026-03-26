import { describe, it, expect } from 'vitest';
import { generateSafeToShareText } from './safe-to-share.ts';
import type { BridgeZoneInfo } from './safe-to-share.ts';

describe('generateSafeToShareText', () => {
  const subject = 'Steve Daniel';
  const target = 'Robert the Bruce';

  describe('Tier 1-2: documented chain', () => {
    it('generates documented text for tier 1 with no bridge zones', () => {
      const result = generateSafeToShareText(subject, target, 12, 1, []);
      expect(result).toBe(
        'I descend from Robert the Bruce through a documented chain of 12 generations.',
      );
    });

    it('generates documented text for tier 2 with no bridge zones', () => {
      const result = generateSafeToShareText(subject, target, 8, 2, []);
      expect(result).toBe(
        'I descend from Robert the Bruce through a documented chain of 8 generations.',
      );
    });
  });

  describe('Tier 3: partially documented', () => {
    it('generates partially documented text for tier 3 with no bridge zones', () => {
      const result = generateSafeToShareText(subject, target, 15, 3, []);
      expect(result).toBe(
        'My tree connects to Robert the Bruce through 15 generations. Most links are documented; some links await primary source verification.',
      );
    });
  });

  describe('Tier 4 or bridge zones: weakness described', () => {
    it('generates weakness text for tier 4 with no bridge zones', () => {
      const result = generateSafeToShareText(subject, target, 18, 4, []);
      expect(result).toBe(
        'My tree appears to connect to Robert the Bruce, but some connections have chronological or structural concerns. Further research is needed to confirm this connection.',
      );
    });

    it('generates weakness text when bridge zones are present even at tier 3', () => {
      const zones: BridgeZoneInfo[] = [
        { edgeCount: 3, description: '3 consecutive unsourced links near 1400s' },
      ];
      const result = generateSafeToShareText(subject, target, 15, 3, zones);
      expect(result).toBe(
        'My tree appears to connect to Robert the Bruce, but there are 3 consecutive unsourced links in the chain. Further research is needed to confirm this connection.',
      );
    });

    it('sums edge counts across multiple bridge zones', () => {
      const zones: BridgeZoneInfo[] = [
        { edgeCount: 2, description: 'Gap near 1500s' },
        { edgeCount: 4, description: 'Gap near 1200s' },
      ];
      const result = generateSafeToShareText(subject, target, 20, 4, zones);
      expect(result).toBe(
        'My tree appears to connect to Robert the Bruce, but there are 6 consecutive unsourced links in the chain. Further research is needed to confirm this connection.',
      );
    });

    it('prefers bridge zone description over structural concerns when both present', () => {
      const zones: BridgeZoneInfo[] = [
        { edgeCount: 5, description: 'Long unsourced stretch' },
      ];
      const result = generateSafeToShareText(subject, target, 18, 4, zones);
      expect(result).toContain('5 consecutive unsourced links');
      expect(result).not.toContain('chronological or structural concerns');
    });
  });
});
