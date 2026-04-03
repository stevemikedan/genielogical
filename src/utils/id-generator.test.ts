import { describe, it, expect } from 'vitest';
import {
  generateId,
  generatePersonId,
  generateEdgeId,
  generateSourceId,
  generateTreeId,
  generateCrossTreeLinkId,
} from './id-generator.ts';

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns non-empty string', () => {
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('prefixes with given prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test-/);
  });

  it('returns unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('generatePersonId', () => {
  it('starts with P-', () => {
    expect(generatePersonId()).toMatch(/^P-/);
  });

  it('generates unique ids', () => {
    const a = generatePersonId();
    const b = generatePersonId();
    expect(a).not.toBe(b);
  });
});

describe('generateEdgeId', () => {
  it('starts with E-', () => {
    expect(generateEdgeId()).toMatch(/^E-/);
  });
});

describe('generateSourceId', () => {
  it('starts with src-', () => {
    expect(generateSourceId()).toMatch(/^src-/);
  });
});

describe('generateTreeId', () => {
  it('starts with tree-', () => {
    expect(generateTreeId()).toMatch(/^tree-/);
  });
});

describe('generateCrossTreeLinkId', () => {
  it('starts with xtl-', () => {
    expect(generateCrossTreeLinkId()).toMatch(/^xtl-/);
  });
});
