import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SiblingConnector } from './SiblingConnector.tsx';
import type { SiblingConnector as SiblingConnectorType, SiblingGridNode } from './pedigree-grid-layout.ts';
import type { Person } from '@/types/person.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';

function makePerson(id: string): Person {
  return {
    id,
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test Person' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3 as const,
    confidenceReason: '',
    status: 'tentative' as const,
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
  };
}

function makeConnector(tier: ConfidenceTier): SiblingConnectorType {
  const sibNode: SiblingGridNode = {
    person: makePerson('S1'),
    directLineAncestorId: 'P2',
    anchorAhnentafel: 2,
    generation: 1,
    x: 245,
    y: 80,
    nodeWidth: 130,
    nodeHeight: 38,
    hasFlags: false,
    confidenceTier: tier,
  };

  return {
    siblingNode: sibNode,
    trunkX: 200,
    trunkTopY: 60,
    trunkBottomY: 100,
    tier,
  };
}

describe('SiblingConnector', () => {
  it('renders path from sibling to trunk', () => {
    const connector = makeConnector(3);
    const { container } = render(
      <svg>
        <SiblingConnector connector={connector} />
      </svg>,
    );

    const path = container.querySelector('path');
    expect(path).toBeTruthy();

    const d = path!.getAttribute('d')!;
    // Should go from sibling left X (245) to trunk X (200)
    expect(d).toContain('245');
    expect(d).toContain('200');
    expect(d).toContain('80'); // siblingY
  });

  it('uses tier color and dash pattern', () => {
    const connector = makeConnector(3);
    const { container } = render(
      <svg>
        <SiblingConnector connector={connector} />
      </svg>,
    );

    const path = container.querySelector('path');
    expect(path!.getAttribute('stroke')).toBe(TIER_COLORS[3]);
    expect(path!.getAttribute('stroke-dasharray')).toBe(TIER_DASH[3]);
  });
});
