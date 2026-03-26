import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Flag } from '@/types/flag.ts';
import type { BatchValidationScope, BatchProgress, CostEstimate, AIPersonValidation } from '@/types/ai.ts';
import type { Person } from '@/types/person.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { sendMessage } from './ai-client.ts';
import { buildPersonValidationPrompt, parsePersonValidation } from './validation-prompts.ts';

// Sonnet pricing per 1M tokens (as of 2025)
const INPUT_PRICE_PER_1M = 3.0;
const OUTPUT_PRICE_PER_1M = 15.0;
const EST_INPUT_TOKENS_PER_PERSON = 1500;
const EST_OUTPUT_TOKENS_PER_PERSON = 500;

function getPersonsInScope(
  scope: BatchValidationScope,
  graph: TreeGraph,
  flags: Flag[],
): Person[] {
  switch (scope) {
    case 'all_flagged': {
      const flaggedIds = new Set(flags.flatMap(f => f.affectedPersonIds));
      return [...flaggedIds]
        .map(id => graph.persons.get(id))
        .filter((p): p is Person => p !== undefined);
    }
    case 'tier3_4':
      return [...graph.persons.values()].filter(p => p.confidenceTier >= 3);
    case 'whole_tree':
      return [...graph.persons.values()];
  }
}

export function estimateCost(
  scope: BatchValidationScope,
  graph: TreeGraph,
  flags: Flag[],
): CostEstimate {
  const persons = getPersonsInScope(scope, graph, flags);
  const inputTokens = persons.length * EST_INPUT_TOKENS_PER_PERSON;
  const outputTokens = persons.length * EST_OUTPUT_TOKENS_PER_PERSON;
  const cost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M
             + (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

  return {
    personCount: persons.length,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: Math.round(cost * 100) / 100,
  };
}

export async function* runBatchValidation(
  scope: BatchValidationScope,
  graph: TreeGraph,
  flags: Flag[],
  apiKey: string,
  dispatch: React.Dispatch<TreeAction>,
  signal?: AbortSignal,
): AsyncGenerator<BatchProgress> {
  const persons = getPersonsInScope(scope, graph, flags);
  const estimate = estimateCost(scope, graph, flags);

  const progress: BatchProgress = {
    scope,
    total: persons.length,
    completed: 0,
    failed: 0,
    estimatedCostUsd: estimate.estimatedCostUsd,
    actualCostUsd: 0,
    status: 'running',
    startedAt: new Date(),
  };

  yield { ...progress };

  const MAX_CONCURRENT = 5;
  let inFlight = 0;
  let index = 0;

  const processOne = async (person: Person): Promise<AIPersonValidation | null> => {
    const parents = (graph.parentEdges.get(person.id) ?? [])
      .map(e => graph.persons.get(e.parentId))
      .filter((p): p is Person => p !== undefined);

    const children = (graph.childEdges.get(person.id) ?? [])
      .map(e => graph.persons.get(e.childId))
      .filter((p): p is Person => p !== undefined);

    const sources = person.sourceIds
      .map(id => graph.sources.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const personFlags = flags.filter(f => f.affectedPersonIds.includes(person.id));

    const { system, user } = buildPersonValidationPrompt(person, parents, children, sources, personFlags);

    try {
      const response = await sendMessage(apiKey, system, user);
      const actualCost = (response.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M
                       + (response.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
      progress.actualCostUsd += actualCost;
      return parsePersonValidation(person.id, response.text);
    } catch {
      return null;
    }
  };

  // Process with concurrency limit
  const queue: Promise<void>[] = [];

  while (index < persons.length) {
    if (signal?.aborted) {
      progress.status = 'cancelled';
      yield { ...progress };
      return;
    }

    if (inFlight < MAX_CONCURRENT && index < persons.length) {
      const person = persons[index++];
      inFlight++;

      const promise = processOne(person).then(result => {
        inFlight--;
        if (result) {
          progress.completed++;
          dispatch({ type: 'SET_AI_VALIDATION', validation: result });
        } else {
          progress.failed++;
        }
      });

      queue.push(promise);

      // Yield progress periodically
      if (inFlight >= MAX_CONCURRENT || index >= persons.length) {
        await Promise.race(queue);
        // Remove resolved promises
        const settled = queue.filter(p => {
          let resolved = false;
          p.then(() => { resolved = true; }, () => { resolved = true; });
          return !resolved;
        });
        queue.length = 0;
        queue.push(...settled);
        yield { ...progress };
      }
    } else {
      // Wait for at least one to finish
      await Promise.race(queue);
      yield { ...progress };
    }
  }

  // Wait for remaining
  if (queue.length > 0) {
    await Promise.all(queue);
    yield { ...progress };
  }

  progress.status = 'complete';
  yield { ...progress };
}
