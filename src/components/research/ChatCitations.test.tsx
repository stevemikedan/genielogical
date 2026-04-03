import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatCitations } from './ChatCitations.tsx';
import type { ChatCitation } from '@/ai/chat/chat-session.ts';

const sampleCitations: ChatCitation[] = [
  {
    url: 'https://www.familysearch.org/record/12345',
    title: 'FamilySearch - Smith Family Records',
    citedText: 'John Smith, born 1800 in Edinburgh, Scotland.',
  },
  {
    url: 'https://www.findagrave.com/memorial/67890',
    title: 'Find A Grave - John Smith',
    citedText: 'Burial record at Greyfriars Kirk.',
  },
];

describe('ChatCitations', () => {
  it('renders nothing when citations are empty', () => {
    const { container } = render(<ChatCitations citations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows citation count toggle button', () => {
    render(<ChatCitations citations={sampleCitations} />);
    expect(screen.getByText('2 sources cited')).toBeDefined();
  });

  it('shows singular label for one citation', () => {
    render(<ChatCitations citations={[sampleCitations[0]]} />);
    expect(screen.getByText('1 source cited')).toBeDefined();
  });

  it('does not show links by default (collapsed)', () => {
    render(<ChatCitations citations={sampleCitations} />);
    expect(screen.queryByText('FamilySearch - Smith Family Records')).toBeNull();
  });

  it('shows links after clicking toggle', () => {
    render(<ChatCitations citations={sampleCitations} />);
    fireEvent.click(screen.getByText('2 sources cited'));
    expect(screen.getByText('FamilySearch - Smith Family Records')).toBeDefined();
    expect(screen.getByText('Find A Grave - John Smith')).toBeDefined();
  });

  it('shows cited text excerpts when expanded', () => {
    render(<ChatCitations citations={sampleCitations} />);
    fireEvent.click(screen.getByText('2 sources cited'));
    expect(screen.getByText(/John Smith, born 1800/)).toBeDefined();
  });

  it('links open in new tab', () => {
    render(<ChatCitations citations={sampleCitations} />);
    fireEvent.click(screen.getByText('2 sources cited'));
    const link = screen.getByText('FamilySearch - Smith Family Records');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('collapses on second click', () => {
    render(<ChatCitations citations={sampleCitations} />);
    const toggle = screen.getByText('2 sources cited');
    fireEvent.click(toggle);
    expect(screen.getByText('FamilySearch - Smith Family Records')).toBeDefined();
    fireEvent.click(toggle);
    expect(screen.queryByText('FamilySearch - Smith Family Records')).toBeNull();
  });

  it('uses hostname when title is null', () => {
    const citations: ChatCitation[] = [
      { url: 'https://example.com/page', title: null, citedText: 'Some text' },
    ];
    render(<ChatCitations citations={citations} />);
    fireEvent.click(screen.getByText('1 source cited'));
    expect(screen.getByText('example.com')).toBeDefined();
  });
});
