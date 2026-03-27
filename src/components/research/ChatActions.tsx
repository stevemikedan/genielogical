import type { ChatAction } from '@/ai/chat/chat-session.ts';

interface ChatActionsProps {
  actions: ChatAction[];
  onExecute: (action: ChatAction) => void;
}

const ACTION_ICONS: Record<string, string> = {
  import_source: '\u2713',     // ✓
  open_person: '\u2197',       // ↗
  mark_duplicate: '\u29C9',    // ⧉
  create_flag: '\u26A0',       // ⚠
  create_conjecture: '\u2753', // ❓
  add_research_step: '+',
  run_deep_research: '\u2026', // …
};

export function ChatActions({ actions, onExecute }: ChatActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((action, i) => (
        <button
          key={`${action.type}-${i}`}
          type="button"
          onClick={() => onExecute(action)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
                     bg-gold/10 text-gold border border-gold/20
                     hover:bg-gold/20 hover:border-gold/40 transition-colors"
        >
          <span>{ACTION_ICONS[action.type] ?? '\u2022'}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
