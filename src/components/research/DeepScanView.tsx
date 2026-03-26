import { useState, useCallback } from 'react';
import type { DeepScanResult } from '@/types/deep-scan.ts';
import type { StoryPathResult } from '@/types/story-path.ts';
import type { ResearchPriority } from '@/types/research.ts';
import { StoryCard } from './StoryCard.tsx';
import { PriorityMatrix } from './PriorityMatrix.tsx';
import { BatchValidationPanel } from './BatchValidationPanel.tsx';
import { AISettingsModal } from '@/components/shared/AISettingsModal.tsx';

interface DeepScanViewProps {
  deepScan: DeepScanResult;
  storyPaths: StoryPathResult | null;
  priorities: ResearchPriority[];
  onSelectPerson?: (personId: string) => void;
}

function GenerationChart({ distribution }: { distribution: Map<number, number> }) {
  const entries = Array.from(distribution.entries()).sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, c]) => c));
  const barMaxHeight = 120;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h4 className="text-sm font-medium text-text-secondary mb-3">Generation Distribution</h4>
      <div className="flex items-end gap-1 h-[140px]">
        {entries.map(([gen, count]) => {
          const height = Math.max(4, (count / maxCount) * barMaxHeight);
          return (
            <div key={gen} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <span className="text-xs text-text-dim font-mono">{count}</span>
              <div
                className="w-full bg-gold/60 rounded-t min-w-[12px] max-w-[32px] mx-auto"
                style={{ height: `${height}px` }}
              />
              <span className="text-xs text-text-dim">G{gen}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchCard({ branch, onSelectPerson }: { branch: DeepScanResult['branches'][number]; onSelectPerson?: (id: string) => void }) {
  const hasNotables = branch.notableFigures.length > 0;
  const isThin = branch.ancestorCount <= 2;

  return (
    <div className={`rounded-lg border bg-surface p-4 ${isThin ? 'border-tier3-border' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <button
            type="button"
            className="font-serif text-base text-text-primary hover:text-gold transition-colors text-left"
            onClick={() => onSelectPerson?.(branch.greatGrandparentId)}
          >
            {branch.greatGrandparentName}
          </button>
          <p className="text-xs text-text-dim">via {branch.viaGrandparentName}</p>
        </div>
        <span className="text-xs font-mono text-text-dim bg-surface-2 px-2 py-0.5 rounded">
          Score: {branch.richnessScore.toFixed(1)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <div className="text-lg font-mono text-gold">{branch.ancestorCount}</div>
          <div className="text-xs text-text-dim">Ancestors</div>
        </div>
        <div>
          <div className="text-lg font-mono text-text-primary">{branch.maxDepth}</div>
          <div className="text-xs text-text-dim">Max Depth</div>
        </div>
        <div>
          <div className="text-lg font-mono text-text-primary">{branch.notableFigures.length}</div>
          <div className="text-xs text-text-dim">Notable</div>
        </div>
      </div>

      {branch.deepestAncestorName && (
        <p className="text-xs text-text-secondary mb-2">
          Deepest: <button
            type="button"
            className="text-gold hover:text-gold-light transition-colors"
            onClick={() => onSelectPerson?.(branch.deepestAncestorId)}
          >
            {branch.deepestAncestorName}
          </button>
          {branch.deepestAncestorBirthYear && (
            <span className="text-text-dim ml-1">({branch.deepestAncestorBirthYear})</span>
          )}
        </p>
      )}

      {isThin && (
        <div className="text-xs text-tier3-text bg-tier3-bg/30 px-2 py-1 rounded mb-2">
          Thin path — few ancestors found in this line
        </div>
      )}

      {hasNotables && (
        <div className="border-t border-border pt-2 mt-2">
          <p className="text-xs text-text-dim mb-1">Notable figures:</p>
          <div className="flex flex-wrap gap-1">
            {branch.notableFigures.slice(0, 3).map(n => (
              <button
                key={n.personId}
                type="button"
                className="text-xs px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-colors"
                onClick={() => onSelectPerson?.(n.personId)}
              >
                {n.name}
              </button>
            ))}
            {branch.notableFigures.length > 3 && (
              <span className="text-xs text-text-dim">+{branch.notableFigures.length - 3} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DeepScanView({ deepScan, storyPaths, priorities, onSelectPerson }: DeepScanViewProps) {
  const notables = storyPaths?.notableAncestors ?? [];
  const [showSettings, setShowSettings] = useState(false);

  const handleOpenSettings = useCallback(() => setShowSettings(true), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);

  return (
    <div className="space-y-8">
      {/* Batch validation */}
      <BatchValidationPanel onOpenSettings={handleOpenSettings} />
      {showSettings && <AISettingsModal onClose={handleCloseSettings} />}

      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl text-text-primary">Your Tree at a Glance</h2>
          <p className="text-sm text-text-secondary mt-1">
            {deepScan.totalUniqueAncestors} unique ancestor{deepScan.totalUniqueAncestors !== 1 ? 's' : ''} across {deepScan.maxGenerationReached} generation{deepScan.maxGenerationReached !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono text-gold">{deepScan.branches.length}</div>
          <div className="text-xs text-text-dim">Branch{deepScan.branches.length !== 1 ? 'es' : ''}</div>
        </div>
      </div>

      {/* Generation distribution chart */}
      <GenerationChart distribution={deepScan.generationDistribution} />

      {/* Branch cards */}
      {deepScan.branches.length > 0 && (
        <div>
          <h3 className="font-serif text-lg text-text-primary mb-3">
            Branch Analysis
            <span className="text-sm text-text-dim font-sans ml-2">ranked by richness</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {deepScan.branches.map(branch => (
              <BranchCard
                key={branch.greatGrandparentId}
                branch={branch}
                onSelectPerson={onSelectPerson}
              />
            ))}
          </div>
        </div>
      )}

      {/* Notable ancestors gallery */}
      {notables.length > 0 && (
        <div>
          <h3 className="font-serif text-lg text-text-primary mb-3">
            Notable Ancestors
            <span className="text-sm text-text-dim font-sans ml-2">({notables.length} found)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {notables.map(notable => (
              <StoryCard
                key={notable.personId}
                notable={notable}
                onSelectPerson={onSelectPerson}
              />
            ))}
          </div>
        </div>
      )}

      {/* Research priorities */}
      {priorities.length > 0 && (
        <PriorityMatrix priorities={priorities} onSelectPerson={onSelectPerson} />
      )}
    </div>
  );
}
