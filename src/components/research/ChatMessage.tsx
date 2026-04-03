import { memo } from 'react';
import type { ChatMessage as ChatMessageType } from '@/ai/chat/chat-session.ts';
import { ChatActions } from './ChatActions.tsx';
import { ChatCitations } from './ChatCitations.tsx';
import type { ChatAction } from '@/ai/chat/chat-session.ts';
import { formatCost } from '@/ai/cost-estimator.ts';

interface ChatMessageProps {
  message: ChatMessageType;
  onExecuteAction: (action: ChatAction) => void;
}

export const ChatMessage = memo(function ChatMessage({ message, onExecuteAction }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (message.loading) {
    // Streaming: show partial content with cursor
    if (message.content) {
      return (
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 text-xs text-gold">
            AI
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-surface rounded-lg px-3 py-2 border border-border">
              <div
                className="text-sm text-text-primary whitespace-pre-wrap break-words prose-chat"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) + '<span class="animate-pulse text-gold">|</span>' }}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-2 items-start">
        <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 text-xs text-gold">
          AI
        </div>
        <div className="flex-1 bg-surface rounded-lg px-3 py-2 border border-border">
          <div className="flex items-center gap-2 text-text-dim text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="animate-bounce text-gold">...</span>
          </div>
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex gap-2 items-start">
        <div className="w-6 h-6 rounded-full bg-tier4/20 flex items-center justify-center flex-shrink-0 text-xs text-tier4">
          !
        </div>
        <div className="flex-1 bg-surface rounded-lg px-3 py-2 border border-tier4/30">
          <p className="text-sm text-tier4">{message.error}</p>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-2 items-start justify-end">
        <div className="max-w-[85%] bg-gold/10 rounded-lg px-3 py-2 border border-gold/20">
          <p className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-2 items-start">
      <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 text-xs text-gold">
        AI
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-surface rounded-lg px-3 py-2 border border-border">
          <div
            className="text-sm text-text-primary whitespace-pre-wrap break-words prose-chat"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        </div>
        <ChatActions actions={message.actions} onExecute={onExecuteAction} />
        <ChatCitations citations={message.citations} />
        {message.costUsd !== null && message.costUsd > 0 && (
          <div className="text-xs text-text-dim mt-1 text-right">
            ~{formatCost(message.costUsd)}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Minimal markdown rendering for chat messages.
 * Handles bold, italic, code, and links. Sanitizes HTML.
 */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gold">$1</strong>')
    // Italic *text*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Inline code `text`
    .replace(/`([^`]+)`/g, '<code class="bg-bg px-1 rounded text-xs font-[family-name:var(--font-mono)]">$1</code>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-gold underline hover:text-gold-light">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return html;
}
