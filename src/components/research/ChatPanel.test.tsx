import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel.tsx';
import type { ChatSession } from '@/ai/chat/chat-session.ts';

// Mock scrollIntoView which isn't available in jsdom
Element.prototype.scrollIntoView = vi.fn();

// Mock cost-estimator used by ChatCostTracker and ChatMessage
vi.mock('@/ai/cost-estimator.ts', () => ({
  formatCost: vi.fn((v: number) => `$${v.toFixed(3)}`),
}));

const mockSession: ChatSession = {
  messages: [],
  totalCostUsd: 0,
  isLoading: false,
};

const mockUseChat = {
  session: mockSession,
  hasApiKey: true,
  showBudgetWarning: false,
  suggestedPrompts: [
    { text: "What's interesting about my tree?" },
    { text: 'Which ancestors need the most research?' },
  ],
  followUpSuggestions: [],
  sendMessage: vi.fn(),
  cancelMessage: vi.fn(),
  clearSession: vi.fn(),
  dismissBudgetWarning: vi.fn(),
  executeAction: vi.fn(),
};

vi.mock('@/hooks/use-chat.ts', () => ({
  useChat: () => mockUseChat,
}));

describe('ChatPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat.session = { ...mockSession, messages: [] };
    mockUseChat.hasApiKey = true;
    mockUseChat.showBudgetWarning = false;
  });

  it('renders "Research Assistant" heading', () => {
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText('Research Assistant')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    // The close button has title "Close chat"
    expect(screen.getByTitle('Close chat')).toBeInTheDocument();
  });

  it('shows suggested prompts when no messages', () => {
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText("What's interesting about my tree?")).toBeInTheDocument();
    expect(screen.getByText('Which ancestors need the most research?')).toBeInTheDocument();
  });

  it('shows API key prompt when no key', () => {
    mockUseChat.hasApiKey = false;
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText(/Set up your Anthropic API key/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseChat.session = { ...mockSession, isLoading: true, messages: [
      { id: 'm1', role: 'user', content: 'Hello', actions: [], citations: [], costUsd: null, timestamp: new Date() },
      { id: 'm2', role: 'assistant', content: '', loading: true, actions: [], citations: [], costUsd: null, timestamp: new Date() },
    ] };
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText('Researching...')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows budget warning when showBudgetWarning is true', () => {
    mockUseChat.showBudgetWarning = true;
    mockUseChat.session = { ...mockSession, totalCostUsd: 0.15 };
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText(/You've spent/)).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('shows Clear button when messages exist', () => {
    mockUseChat.session = { ...mockSession, messages: [
      { id: 'm1', role: 'user', content: 'Hello', actions: [], citations: [], costUsd: null, timestamp: new Date() },
    ] };
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('hides Clear button when no messages', () => {
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('renders messages', () => {
    mockUseChat.session = { ...mockSession, messages: [
      { id: 'm1', role: 'user', content: 'Tell me about ancestors', actions: [], citations: [], costUsd: null, timestamp: new Date() },
      { id: 'm2', role: 'assistant', content: 'Here is what I found...', actions: [], citations: [], costUsd: 0.002, timestamp: new Date() },
    ] };
    render(<ChatPanel activeView="tree" onClose={onClose} />);
    expect(screen.getByText('Tell me about ancestors')).toBeInTheDocument();
    expect(screen.getByText('Here is what I found...')).toBeInTheDocument();
  });
});
