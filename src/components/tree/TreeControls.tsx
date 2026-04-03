import { useState, useMemo, useCallback } from 'react';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { TIER_LABELS, TIER_COLORS } from '@/types/tier-labels.ts';
import type { FanMode } from './fan-chart-layout.ts';
import type { TimeRange } from './geo-map-data.ts';

export type MapColorMode = 'tier' | 'era';
export type MapLayerMode = 'markers' | 'heatmap';

export type ViewMode = 'pedigree' | 'descendant' | 'directLine' | 'pedigreeGrid' | 'fan' | 'lineagePath' | 'map' | 'network';
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
  showSiblings: boolean;
  onShowSiblingsChange: (show: boolean) => void;
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
  expandedCount?: number;
  onCollapseAll?: () => void;
  // Map-specific
  mapColorMode?: MapColorMode;
  onMapColorModeChange?: (mode: MapColorMode) => void;
  mapLayerMode?: MapLayerMode;
  onMapLayerModeChange?: (mode: MapLayerMode) => void;
  mapTimeRange?: TimeRange | null;
  onMapTimeRangeChange?: (range: TimeRange | null) => void;
  mapIsPlaying?: boolean;
  onMapPlayPauseToggle?: () => void;
  mapYearBounds?: { minYear: number; maxYear: number } | null;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  pedigree: 'Ancestors',
  descendant: 'Descendants',
  directLine: 'Direct Line',
  pedigreeGrid: 'Grid',
  fan: 'Fan',
  lineagePath: 'Path',
  map: 'Map',
  network: 'Network',
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
  showSiblings,
  onShowSiblingsChange,
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
  expandedCount = 0,
  onCollapseAll,
  mapColorMode = 'era',
  onMapColorModeChange,
  mapLayerMode = 'markers',
  onMapLayerModeChange,
  mapTimeRange,
  onMapTimeRangeChange,
  mapIsPlaying = false,
  onMapPlayPauseToggle,
  mapYearBounds,
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
        {(['pedigree', 'descendant', 'directLine', 'pedigreeGrid', 'fan', 'lineagePath', 'map', 'network'] as const).map(mode => (
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

      {/* Generation limit (hidden for map, network) */}
      {viewMode !== 'map' && viewMode !== 'network' && (
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
      )}

      {/* Divider (hidden for map, network) */}
      {viewMode !== 'map' && viewMode !== 'network' && <div className="w-px h-6 bg-border" />}

      {/* Density presets (hidden for map, network) */}
      {viewMode !== 'map' && viewMode !== 'network' && (
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
      )}

      {/* Siblings toggle (only in pedigreeGrid mode) */}
      {viewMode === 'pedigreeGrid' && (
        <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showSiblings}
            onChange={e => onShowSiblingsChange(e.target.checked)}
            className="accent-gold"
          />
          Siblings
        </label>
      )}

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

      {/* Map controls (only visible in map view) */}
      {viewMode === 'map' && (
        <>
          {/* Color mode toggle */}
          <div className="flex rounded overflow-hidden border border-border">
            {([
              { key: 'tier' as const, label: 'Tier' },
              { key: 'era' as const, label: 'Era' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onMapColorModeChange?.(opt.key)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  mapColorMode === opt.key
                    ? 'bg-gold text-bg'
                    : 'bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Layer mode toggle */}
          <div className="flex rounded overflow-hidden border border-border">
            {([
              { key: 'markers' as const, label: 'Markers' },
              { key: 'heatmap' as const, label: 'Heat' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onMapLayerModeChange?.(opt.key)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  mapLayerMode === opt.key
                    ? 'bg-gold text-bg'
                    : 'bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Time slider */}
          {mapYearBounds && (
            <MapTimeSlider
              yearBounds={mapYearBounds}
              timeRange={mapTimeRange ?? null}
              onTimeRangeChange={onMapTimeRangeChange}
              isPlaying={mapIsPlaying}
              onPlayPauseToggle={onMapPlayPauseToggle}
            />
          )}
        </>
      )}

      {/* Orientation toggle (hidden for pedigreeGrid, fan, lineagePath) */}
      {viewMode !== 'pedigreeGrid' && viewMode !== 'fan' && viewMode !== 'lineagePath' && viewMode !== 'map' && viewMode !== 'network' && (
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
        {expandedCount > 0 && onCollapseAll && (
          <button type="button" onClick={onCollapseAll} className="h-8 flex items-center justify-center rounded bg-bg border border-red-900 text-red-400 hover:text-red-300 text-xs px-2" title="Collapse all expanded branches">Collapse All</button>
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

// ── Map Time Slider (internal component) ──

interface MapTimeSliderProps {
  yearBounds: { minYear: number; maxYear: number };
  timeRange: TimeRange | null;
  onTimeRangeChange?: (range: TimeRange | null) => void;
  isPlaying: boolean;
  onPlayPauseToggle?: () => void;
}

function MapTimeSlider({ yearBounds, timeRange, onTimeRangeChange, isPlaying, onPlayPauseToggle }: MapTimeSliderProps) {
  const { minYear, maxYear } = yearBounds;
  const currentStart = timeRange?.startYear ?? minYear;
  const currentEnd = timeRange?.endYear ?? maxYear;

  const handleStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const newStart = Math.min(val, currentEnd);
    onTimeRangeChange?.({ startYear: newStart, endYear: currentEnd });
  }, [currentEnd, onTimeRangeChange]);

  const handleEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const newEnd = Math.max(val, currentStart);
    onTimeRangeChange?.({ startYear: currentStart, endYear: newEnd });
  }, [currentStart, onTimeRangeChange]);

  // Compute track highlight position
  const range = maxYear - minYear || 1;
  const leftPct = ((currentStart - minYear) / range) * 100;
  const rightPct = ((currentEnd - minYear) / range) * 100;

  return (
    <div className="flex items-center gap-2">
      {/* Play/Pause */}
      <button
        type="button"
        onClick={onPlayPauseToggle}
        className="w-6 h-6 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-gold text-sm"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      {/* Start year label */}
      <span className="font-[family-name:var(--font-mono)] text-xs text-gold w-10 text-right">
        {currentStart}
      </span>

      {/* Dual range slider */}
      <div className="relative w-36 h-6 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-bg rounded-full" />
        {/* Active range highlight */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-gold rounded-full"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />
        {/* Start slider */}
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={currentStart}
          onChange={handleStartChange}
          className="map-time-slider absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
        />
        {/* End slider */}
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={currentEnd}
          onChange={handleEndChange}
          className="map-time-slider absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
        />
      </div>

      {/* End year label */}
      <span className="font-[family-name:var(--font-mono)] text-xs text-gold w-10">
        {currentEnd}
      </span>

      {/* Clear button */}
      {timeRange && (
        <button
          type="button"
          onClick={() => onTimeRangeChange?.(null)}
          className="text-xs text-text-dim hover:text-text-secondary"
          title="Clear time filter"
        >
          Clear
        </button>
      )}
    </div>
  );
}
