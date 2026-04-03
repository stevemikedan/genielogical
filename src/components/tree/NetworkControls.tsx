import { memo } from 'react';

interface NetworkControlsProps {
  generationRadius: number;
  onRadiusChange: (radius: number) => void;
  showParentChild: boolean;
  onShowParentChildChange: (show: boolean) => void;
  showSpouse: boolean;
  onShowSpouseChange: (show: boolean) => void;
  showSibling: boolean;
  onShowSiblingChange: (show: boolean) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  nodeCount: number;
  linkCount: number;
}

export const NetworkControls = memo(function NetworkControls({
  generationRadius,
  onRadiusChange,
  showParentChild,
  onShowParentChildChange,
  showSpouse,
  onShowSpouseChange,
  showSibling,
  onShowSiblingChange,
  isPaused,
  onTogglePause,
  nodeCount,
  linkCount,
}: NetworkControlsProps) {
  return (
    <div className="absolute bottom-4 left-4 bg-surface border border-border rounded-lg p-3 text-xs shadow-lg z-10 select-none">
      {/* Generation radius */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-secondary w-16">Radius</span>
        <button
          className="w-6 h-6 rounded bg-surface-raised border border-border text-text-primary hover:bg-surface-hover flex items-center justify-center"
          onClick={() => onRadiusChange(Math.max(1, generationRadius - 1))}
          disabled={generationRadius <= 1}
        >
          -
        </button>
        <span className="text-text-primary w-6 text-center font-mono">{generationRadius}</span>
        <button
          className="w-6 h-6 rounded bg-surface-raised border border-border text-text-primary hover:bg-surface-hover flex items-center justify-center"
          onClick={() => onRadiusChange(Math.min(20, generationRadius + 1))}
          disabled={generationRadius >= 20}
        >
          +
        </button>
      </div>

      {/* Link type toggles */}
      <div className="flex flex-col gap-1 mb-2">
        <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showParentChild}
            onChange={(e) => onShowParentChildChange(e.target.checked)}
            className="accent-gold"
          />
          Parent-child
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showSpouse}
            onChange={(e) => onShowSpouseChange(e.target.checked)}
            className="accent-gold"
          />
          Spouse
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showSibling}
            onChange={(e) => onShowSiblingChange(e.target.checked)}
            className="accent-gold"
          />
          Sibling
        </label>
      </div>

      {/* Pause/Resume */}
      <button
        className="w-full px-2 py-1 rounded bg-surface-raised border border-border text-text-primary hover:bg-surface-hover mb-2"
        onClick={onTogglePause}
      >
        {isPaused ? '\u25B6 Resume' : '\u23F8 Pause'}
      </button>

      {/* Stats */}
      <div className="text-text-muted">
        {nodeCount} nodes &middot; {linkCount} links
      </div>
      {nodeCount > 500 && (
        <div className="text-amber-400 mt-1">Large network — simulation may be slow</div>
      )}
    </div>
  );
});
