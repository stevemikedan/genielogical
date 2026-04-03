import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SiblingNode } from './SiblingNode.tsx';
import type { SiblingGridNode } from './pedigree-grid-layout.ts';
import type { Person } from '@/types/person.ts';

function makeSiblingPerson(id: string, name: string): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'M',
    birth: { date: { date: new Date('1950-01-01'), endDate: null, qualifier: 'exact', raw: '1950', year: 1950 }, place: null },
    death: { date: { date: new Date('2020-01-01'), endDate: null, qualifier: 'exact', raw: '2020', year: 2020 }, place: null },
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

function makeSiblingNode(overrides?: Partial<SiblingGridNode>): SiblingGridNode {
  return {
    person: makeSiblingPerson('S1', 'John Uncle'),
    directLineAncestorId: 'P2',
    anchorAhnentafel: 2,
    generation: 1,
    x: 220,
    y: 100,
    nodeWidth: 130,
    nodeHeight: 38,
    hasFlags: false,
    confidenceTier: 3 as const,
    ...overrides,
  };
}

describe('SiblingNode', () => {
  it('renders name and years', () => {
    const node = makeSiblingNode();
    const { container } = render(
      <svg>
        <SiblingNode node={node} isSelected={false} onClick={() => {}} />
      </svg>,
    );

    const texts = container.querySelectorAll('text');
    const textContents = Array.from(texts).map(t => t.textContent);

    expect(textContents.some(t => t?.includes('John'))).toBe(true);
    expect(textContents.some(t => t?.includes('1950'))).toBe(true);
  });

  it('click calls onSelectPerson', () => {
    const handleClick = vi.fn();
    const node = makeSiblingNode();
    const { container } = render(
      <svg>
        <SiblingNode node={node} isSelected={false} onClick={handleClick} />
      </svg>,
    );

    const group = container.querySelector('g[style]');
    group?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handleClick).toHaveBeenCalledWith('S1');
  });

  it('selected state shows gold border', () => {
    const node = makeSiblingNode();
    const { container } = render(
      <svg>
        <SiblingNode node={node} isSelected={true} onClick={() => {}} />
      </svg>,
    );

    const rects = container.querySelectorAll('rect');
    const goldRect = Array.from(rects).find(r => r.getAttribute('stroke') === '#c9a55a');
    expect(goldRect).toBeTruthy();
  });

  it('flag indicator shown when hasFlags', () => {
    const node = makeSiblingNode({ hasFlags: true });
    const { container } = render(
      <svg>
        <SiblingNode node={node} isSelected={false} onClick={() => {}} />
      </svg>,
    );

    const texts = container.querySelectorAll('text');
    const warningText = Array.from(texts).find(t => t.textContent === '\u26A0');
    expect(warningText).toBeTruthy();
  });
});
