import { useState, memo } from 'react';
import type { ChatCitation } from '@/ai/chat/chat-session.ts';

interface ChatCitationsProps {
  citations: ChatCitation[];
}

export const ChatCitations = memo(function ChatCitations({ citations }: ChatCitationsProps) {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-dim hover:text-gold transition-colors flex items-center gap-1"
      >
        <span className="text-[10px]">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span>{citations.length} source{citations.length !== 1 ? 's' : ''} cited</span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1.5 border-l border-border pl-2.5">
          {citations.map((cite, i) => (
            <div key={`${cite.url}-${i}`} className="text-xs">
              <a
                href={cite.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold hover:text-gold-light underline break-all"
              >
                {cite.title ?? new URL(cite.url).hostname}
              </a>
              {cite.citedText && (
                <p className="text-text-dim mt-0.5 line-clamp-2 italic">
                  {cite.citedText}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
