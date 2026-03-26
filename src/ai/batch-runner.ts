import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { QuickCheckResult, BatchProgress } from '@/types/ai.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { getApiKey, sendMessage } from './ai-client.ts';
import { QUICK_CHECK_SYSTEM_PROMPT, buildQuickCheckUserPrompt } from './prompts/index.ts';
import { parseQuickCheckResult } from './result-parser.ts';
import { computeEraTag } from './era-context.ts';

const MAX_CONCURRENT = 5;
const DELAY_MS = 500;
const EST_INPUT_TOKENS = 1_500;
const EST_OUTPUT_TOKENS = 500;
const INPUT_PRICE_PER_1M = 3.0;
const OUTPUT_PRICE_PER_1M = 15.0;

export interface QuickCheckBatchResult {
  personId: string;
  result: QuickCheckResult | null;
}

/**
 * Run Mode 1 quick checks on a batch of persons.
 * Yields progress updates after each concurrent batch completes.
 */
export async function* runBatchQuickCheck(
  personIds: string[],
  graph: TreeGraph,
  flags: Flag[],
  signal?: AbortSignal,
): AsyncGenerator<{ progress: BatchProgress; results: QuickCheckBatchResult[] }> {
  const apiKey = getApiKey();
  if (!apiKey || personIds.length === 0) return;

  const total = personIds.length;
  const estimatedCostUsd = (total * EST_INPUT_TOKENS / 1_000_000) * INPUT_PRICE_PER_1M
    + (total * EST_OUTPUT_TOKENS / 1_000_000) * OUTPUT_PRICE_PER_1M;

  let completed = 0;
  let failed = 0;
  let actualCostUsd = 0;
  const allResults: QuickCheckBatchResult[] = [];

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < total; i += MAX_CONCURRENT) {
    if (signal?.aborted) {
      yield {
        progress: { scope: 'all_flagged', total, completed, failed, estimatedCostUsd, actualCostUsd, status: 'cancelled', startedAt: null },
        results: allResults,
      };
      return;
    }

    const batch = personIds.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(pid => processOne(pid, graph, flags, apiKey)),
    );

    for (const br of batchResults) {
      allResults.push(br.batchResult);
      actualCostUsd += br.cost;
      completed++;
      if (!br.batchResult.result) failed++;
    }

    yield {
      progress: {
        scope: 'all_flagged',
        total,
        completed,
        failed,
        estimatedCostUsd,
        actualCostUsd,
        status: completed >= total ? 'complete' : 'running',
        startedAt: null,
      },
      results: allResults,
    };

    // Small delay between batches
    if (i + MAX_CONCURRENT < total) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
}

async function processOne(
  personId: string,
  graph: TreeGraph,
  flags: Flag[],
  apiKey: string,
): Promise<{ batchResult: QuickCheckBatchResult; cost: number }> {
  const person = graph.persons.get(personId);
  if (!person) return { batchResult: { personId, result: null }, cost: 0 };

  const parentEdges = graph.parentEdges.get(personId) ?? [];
  const fatherEdge = parentEdges.find(e => {
    const p = graph.persons.get(e.parentId);
    return p && p.sex === 'M';
  });
  const motherEdge = parentEdges.find(e => {
    const p = graph.persons.get(e.parentId);
    return p && p.sex === 'F';
  });
  const parents = {
    father: fatherEdge ? graph.persons.get(fatherEdge.parentId) ?? null : null,
    mother: motherEdge ? graph.persons.get(motherEdge.parentId) ?? null : null,
  };
  const children = (graph.childEdges.get(personId) ?? [])
    .map(e => graph.persons.get(e.childId))
    .filter((p): p is Person => p !== undefined);

  const sources = person.sourceIds
    .map(id => graph.sources.get(id))
    .filter((s): s is Source => s !== undefined);

  const personFlags = flags.filter(f => f.affectedPersonIds.includes(personId));
  const eraTag = computeEraTag(person);

  try {
    const userPrompt = buildQuickCheckUserPrompt(person, parents, children, sources, personFlags, eraTag);
    const response = await sendMessage(apiKey, QUICK_CHECK_SYSTEM_PROMPT, userPrompt);
    const result = parseQuickCheckResult(response.text);
    const cost = (response.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M
      + (response.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
    return { batchResult: { personId, result }, cost };
  } catch {
    return { batchResult: { personId, result: null }, cost: 0 };
  }
}
