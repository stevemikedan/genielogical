import { useRef, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { ChatInput } from './ChatInput.tsx';
import { ChatCostTracker } from './ChatCostTracker.tsx';

interface ChatPanelProps {
  activeView: string;
  onClose: () => void;
}

export function ChatPanel({ activeView, onClose }: ChatPanelProps) {
  const {
    session,
    hasApiKey,
    showBudgetWarning,
    sendMessage,
    cancelMessage,
    clearSession,
    dismissBudgetWarning,
    executeAction,
  } = useChat(activeView);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages.length]);

  const assistantMessages = session.messages.filter(m => m.role === 'assistant' && !m.loading && !m.error);

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-bg border-l border-border z-40
                    flex flex-col shadow-xl animate-[slideIn_300ms_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gold text-sm font-medium">Research Assistant</span>
          <ChatCostTracker
            totalCostUsd={session.totalCostUsd}
            messageCount={assistantMessages.length}
          />
        </div>
        <div className="flex items-center gap-1">
          {session.messages.length > 0 && (
            <button
              type="button"
              onClick={clearSession}
              className="text-xs text-text-dim hover:text-text-secondary px-2 py-1 rounded
                         hover:bg-surface transition-colors"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-text-dim
                       hover:text-text-primary hover:bg-surface transition-colors text-lg"
            title="Close chat"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Budget warning */}
      {showBudgetWarning && (
        <div className="px-4 py-2 bg-tier3/10 border-b border-tier3/30 flex items-center justify-between">
          <span className="text-xs text-tier3">
            You've spent ~${session.totalCostUsd.toFixed(2)} in this session.
          </span>
          <button
            type="button"
            onClick={dismissBudgetWarning}
            className="text-xs text-tier3 hover:text-text-primary px-2 py-0.5 rounded
                       hover:bg-tier3/10 transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {session.messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-text-dim text-sm mb-4">
              Ask me about your tree, research ancestors, or describe sources you've found.
            </p>
            <div className="space-y-2">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={!hasApiKey}
                  className="block w-full text-left px-3 py-2 rounded-lg border border-border
                             text-sm text-text-secondary hover:text-text-primary hover:border-gold/30
                             hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {session.messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onExecuteAction={executeAction}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3 flex-shrink-0">
        {!hasApiKey ? (
          <div className="text-center text-sm text-text-dim py-2">
            Set up your Anthropic API key to use the research assistant.
          </div>
        ) : session.isLoading ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-dim animate-pulse">Researching...</span>
            <button
              type="button"
              onClick={cancelMessage}
              className="text-xs text-tier4 hover:text-text-primary px-2 py-1 rounded
                         hover:bg-tier4/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <ChatInput onSend={sendMessage} />
        )}
      </div>
    </div>
  );
}

const SUGGESTED_PROMPTS = [
  "What's interesting about my tree?",
  "Which ancestors need the most research?",
  "Are there any potential duplicates?",
  "What notable ancestors do I have?",
];
