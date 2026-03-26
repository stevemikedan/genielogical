import { useState, useMemo } from 'react';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { TIER_LABELS, TIER_COLORS } from '@/types/tier-labels.ts';
import type { FanMode } from './fan-chart-layout.ts';

export type ViewMode = 'pedigree' | 'descendant' | 'directLine' | 'pedigreeGrid' | 'fan' | 'lineagePath';
export type TreeOrientation = 'horizontal' | 'vertical-down' | 'vertical-up';
export type TreeDensity = 'compact' | 'comfortable' | 'spacious';

export interface DensityPreset {
  vSpacing: number;
  hSpacing: number;
  nodeW: number;
  nodeH: number;
  fontSize: number;
}

export const DENSITY_PRESETS: Record<TreeDensity, DensityPreset> = {
  compact: { vSpacing: 80, hSpacing: 250, nodeW: 200, nodeH: 60, fontSize: 13 },
  comfortable: { vSpacing: 110, hSpacing: 320, nodeW: 240, nodeH: 72, fontSize: 15 },
  spacious: { vSpacing: 140, hSpacing: 400, nodeW: 280, nodeH: 84, fontSize: 17 },
};

interface TreeControlsProps {
  graph: TreeGraph;
  rootPersonId: string;
  onRootChange: (personId: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  maxGenerations: number;
  onMaxGenerationsChange: (n: number) => void;
  visibleTiers: Set<ConfidenceTier>;
  onVisibleTiersChange: (tiers: Set<ConfidenceTier>) => void;
  showRejected: boolean;
  onShowRejectedChange: (show: boolean) => void;
  density: TreeDensity;
  onDensityChange: (density: TreeDensity) => void;
  orientation: TreeOrientation;
  onOrientationChange: (orientation: TreeOrientation) => void;
  fanMode: FanMode;
  onFanModeChange: (mode: FanMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  onCenterOnSelected?: () => void;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  pedigree: 'Ancestors',
  descendant: 'Descendants',
  directLine: 'Direct Line',
  pedigreeGrid: 'Grid',
  fan: 'Fan',
  lineagePath: 'Path',
};

const DENSITY_LABELS: Record<TreeDensity, string> = {
  compact: 'S',
  comfortable: 'M',
  spacious: 'L',
};

export function TreeControls({
  graph,
  rootPersonId,
  onRootChange,
  viewMode,
  onViewModeChange,
  maxGenerations,
  onMaxGenerationsChange,
  visibleTiers,
  onVisibleTiersChange,
  showRejected,
  onShowRejectedChange,
  density,
  onDensityChange,
  orientation,
  onOrientationChange,
  fanMode,
  onFanModeChange,
  onZoomIn,
  onZoomOut,
  onFitToView,
  onCenterOnSelected,
}: TreeControlsProps) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchText.trim()) return [];
    const query = searchText.toLowerCase();
    const results: Array<{ id: string; name: string }> = [];
    for (const person of graph.persons.values()) {
      if (person.name.full.toLowerCase().includes(query)) {
        results.push({ id: person.id, name: person.name.full });
        if (results.length >= 10) break;
      }
    }
    return results;
  }, [searchText, graph]);

  const currentPerson = graph.persons.get(rootPersonId);

  function toggleTier(tier: ConfidenceTier) {
    const next = new Set(visibleTiers);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    onVisibleTiersChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-lg px-4 py-2">
      {/* Root selector */}
      <div className="relative">
        <input
          type="text"
          value={searchText}
          onChange={e => { setSearchText(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={currentPerson?.name.full ?? 'Select root person...'}
          className="bg-bg border border-border rounded px-2 py-1 text-sm text-text-primary w-52 placeholder:text-text-dim focus:border-gold outline-none"
        />
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
            {searchResults.map(r => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => {
                  onRootChange(r.id);
                  setSearchText('');
                  setShowDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover cursor-pointer"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* View mode */}
      <div className="flex rounded overflow-hidden border border-border">
        {(['pedigree', 'descendant', 'directLine', 'pedigreeGrid', 'fan', 'lineagePath'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === mode
                ? 'bg-gold text-bg'
                : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            {VIEW_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Generation limit */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMaxGenerationsChange(Math.max(1, maxGenerations - 1))}
          className="w-6 h-6 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-sm"
        >
          -
        </button>
        <span className="font-[family-name:var(--font-mono)] text-xs text-gold w-8 text-center">
          {maxGenerations}
        </span>
        <button
          type="button"
          onClick={() => onMaxGenerationsChange(Math.min(20, maxGenerations + 1))}
          className="w-6 h-6 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-sm"
        >
          +
        </button>
        <span className="text-text-dim text-xs ml-1">gen</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Density presets */}
      <div className="flex rounded overflow-hidden border border-border">
        {(['compact', 'comfortable', 'spacious'] as const).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => onDensityChange(d)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              density === d
                ? 'bg-gold text-bg'
                : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title={d.charAt(0).toUpperCase() + d.slice(1)}
          >
            {DENSITY_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Fan mode toggle (semi/full — only visible in fan view) */}
      {viewMode === 'fan' && (
        <div className="flex rounded overflow-hidden border border-border">
          {([
            { key: 'semi' as const, label: '\u25D1', title: 'Semicircle' },
            { key: 'full' as const, label: '\u25CB', title: 'Full circle' },
          ]).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onFanModeChange(opt.key)}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                fanMode === opt.key
                  ? 'bg-gold text-bg'
                  : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
              title={opt.title}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Orientation toggle (hidden for pedigreeGrid, fan, lineagePath) */}
      {viewMode !== 'pedigreeGrid' && viewMode !== 'fan' && viewMode !== 'lineagePath' && (
        <div className="flex rounded overflow-hidden border border-border">
          {([
            { key: 'horizontal' as const, label: '\u2194', title: 'Horizontal (left-to-right)' },
            { key: 'vertical-down' as const, label: '\u2193', title: 'Vertical (top-to-bottom)' },
            { key: 'vertical-up' as const, label: '\u2191', title: 'Vertical (bottom-to-top)' },
          ]).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onOrientationChange(opt.key)}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                orientation === opt.key
                  ? 'bg-gold text-bg'
                  : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
              title={opt.title}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Zoom controls */}
      <div className="flex gap-1">
        <button type="button" onClick={onZoomIn} className="w-8 h-8 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-sm" title="Zoom in (+)">+</button>
        <button type="button" onClick={onZoomOut} className="w-8 h-8 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-sm" title="Zoom out (-)">&minus;</button>
        <button type="button" onClick={onFitToView} className="h-8 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-xs px-2" title="Fit to view (0)">Fit</button>
        {onCenterOnSelected && (
          <button type="button" onClick={onCenterOnSelected} className="h-8 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-xs px-2" title="Center on selected (c)">Center</button>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Tier filters */}
      <div className="flex gap-1">
        {([1, 2, 3, 4] as ConfidenceTier[]).map(tier => {
          const active = visibleTiers.has(tier);
          return (
            <button
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-opacity ${
                active ? 'opacity-100 border-border' : 'opacity-30 border-transparent'
              }`}
              title={TIER_LABELS[tier]}
            >
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] }} />
              <span className="text-text-secondary">{TIER_LABELS[tier]}</span>
            </button>
          );
        })}
      </div>

      {/* Show rejected */}
      <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={showRejected}
          onChange={e => onShowRejectedChange(e.target.checked)}
          className="accent-gold"
        />
        Rejected
      </label>
    </div>
  );
}
