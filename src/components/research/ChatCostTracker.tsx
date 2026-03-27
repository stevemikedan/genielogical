import { formatCost } from '@/ai/cost-estimator.ts';

interface ChatCostTrackerProps {
  totalCostUsd: number;
  messageCount: number;
}

export function ChatCostTracker({ totalCostUsd, messageCount }: ChatCostTrackerProps) {
  if (messageCount === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-text-dim">
      <span>Session: {formatCost(totalCostUsd)}</span>
      <span className="w-px h-3 bg-border" />
      <span>{messageCount} messages</span>
    </div>
  );
}
