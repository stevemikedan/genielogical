# GenieLogical — Architecture Amendments

**Date:** March 26, 2026
**Scope:** Two cross-cutting architectural changes that affect Phases B, D, and E

---

## Amendment 1: Shared Ancestor Validation Inheritance

### The Problem

When the same ancestor appears at the convergence point of multiple paths, validating one path's chain to that ancestor should automatically benefit every other path that shares the same segment.

Example: Three paths all converge at Fulk V of Anjou, then share the identical Anjou → Vermandois → Carolingian chain down to Charlemagne. If a user validates the Fulk V → Charlemagne segment through Path 1, Paths 2 and 3 should inherit that work. Currently, each path's proof ladder evaluates edges independently — the same edge between Fulk V and Fulk IV gets scored identically three times but doesn't "know" it's the same edge.

This also applies at closer range: if two branches share a great-grandparent, and the user has verified that great-grandparent's parents with a primary source, every path through that great-grandparent should reflect the verified connection.

### Why This Already Mostly Works (and Where It Doesn't)

The in-memory graph stores edges once — there's one Edge object between Fulk V and Fulk IV regardless of how many paths traverse it. When the user adds a source to that edge, the confidence scorer re-scores it once, and every proof ladder that traverses it picks up the new tier. **So the confidence scoring already inherits correctly.**

What DOESN'T inherit:

1. **AI validation results.** If the user runs "Ask AI" on a person in Path 1, the `aiValidation` result is cached on that person. But when the user views that same person through Path 2's proof ladder, the cached result should be visible — not hidden because the AI was triggered from a different context.

2. **Research steps.** If the research recommender generates a step "Find NC land grant for Thomas McKenzie" from Path 1's context, that same step should appear when viewing Thomas McKenzie from Path 2's context. Research steps are attached to persons/edges, not paths — so this should work. But the UI needs to make it obvious.

3. **"Safe to share" text.** The proof ladder generates a safe-to-share statement for a specific path. If the shared segment has been strengthened, ALL paths' safe-to-share text should update. This requires re-evaluating chain confidence whenever any edge in the graph changes tier.

4. **Story card chain confidence.** Each NotableAncestor has a `chainConfidence` field (weakest link in the path). When a shared segment improves, every story card that traverses it should update.

### Implementation

**This is mostly a cache invalidation problem, not a new feature.** The fixes:

**A. Confidence re-scoring is already global.** `scoreAllConfidence(graph, activeFlags)` runs over all edges and persons. When a source is added to any edge, this re-runs and updates everything. No change needed.

**B. Proof ladder should recompute on render, not cache.** The proof ladder for a path should be computed fresh each time it's displayed (it's O(path_length), fast), pulling current edge tiers from the graph. Don't cache proof ladder results — they go stale when shared edges change.

```typescript
// In ProofLadderSection.tsx — compute on render:
const proofLadder = useMemo(
  () => buildProofLadder(graph, rootId, targetId),
  [graph.version, rootId, targetId]  // graph.version increments on any mutation
);
```

**C. Story cards should recompute chain confidence on graph change.** The `StoryPathResult` from `story-paths.ts` includes `chainConfidence` per notable ancestor. This should be recomputed when the graph version changes, not cached from import time.

```typescript
// In the deep scan / story paths hook:
const storyPaths = useMemo(
  () => computeStoryPaths(graph, subjectId),
  [graph.version, subjectId]
);
```

**D. Add a "Shared segment" indicator to the proof ladder UI.** When a proof ladder displays an edge that is traversed by multiple notable-ancestor paths, show a subtle badge: "Also on path to: Charlemagne, MacRae of Inverinate" — this tells the user that verifying this edge has multiplied impact.

```typescript
// In proof-ladder.ts, add to ProofLink:
interface ProofLink {
  // ... existing fields ...
  sharedWithPaths: string[];  // Names of other notable ancestors whose paths share this edge
}

function buildProofLadder(
  graph: TreeGraph,
  rootId: string,
  targetId: string,
  allNotablePaths?: NotableAncestor[]  // Pass in for shared-path detection
): ProofLink[] {
  const path = findPath(graph, rootId, targetId);
  
  return path.map((personId, i) => {
    const edge = i > 0 ? getEdgeBetween(graph, path[i-1], personId) : null;
    
    // Find other notable paths that share this edge
    const sharedWith: string[] = [];
    if (edge && allNotablePaths) {
      for (const notable of allNotablePaths) {
        if (notable.personId === targetId) continue;  // Skip self
        if (notable.pathToSubject.includes(path[i-1]) && 
            notable.pathToSubject.includes(personId)) {
          sharedWith.push(notable.name);
        }
      }
    }
    
    return {
      personId,
      edge,
      tier: edge?.confidenceTier ?? null,
      sharedWithPaths: sharedWith,
    };
  });
}
```

**E. Impact scorer already handles this.** The impact scorer counts how many notable-ancestor paths pass through each edge. Shared edges naturally get higher impact scores. No change needed.

### What This Means for the User

When a user adds a primary source to an edge deep in the Charlemagne path (say, the Jean Stewart → Robert Stewart link), and that edge is shared by three paths:

1. The confidence scorer re-runs → that edge upgrades to Tier 1
2. Every proof ladder that includes that edge shows the new tier (because they recompute on render)
3. Every story card whose path traverses that edge updates its chain confidence
4. The research priority matrix updates (that edge is no longer a priority)
5. The safe-to-share text for all affected paths updates

All of this happens automatically because the graph is the single source of truth and everything derives from it. No explicit "inheritance" mechanism needed — just proper cache invalidation.

### One New Feature: "Validated Segment" Visual

In the proof ladder UI, when a contiguous run of edges all have Tier 1-2 confidence, group them visually as a "validated segment" with a green background band:

```
Gen 0:  Steven Daniel                    ●
Gen 1:  Catherine Luman                  ●
        ┌─── Validated segment ──────────────────┐
Gen 2:  │ Joe Luman                      ●       │
Gen 3:  │ Violet Ammons                  ●       │
Gen 4:  │ Flora Cunningham               ●       │
        └────────────────────────────────────────┘
        ┌─── Bridge zone (3 unsourced) ──────────┐
Gen 5:  │ Talitha Smiley                 ○       │
Gen 6:  │ Happy Gibson                   ○       │
Gen 7:  │ John Stewart Gibson            ○       │
        └────────────────────────────────────────┘
Gen 8:  Rev. Samuel Baxter Gibson        ◐
        ...
        ┌─── Validated segment (shared with 2    │
        │    other paths) ───────────────────────┐
Gen 32: │ Fulk V of Anjou               ◐       │
Gen 33: │ Fulk IV                       ◐       │
        │ ...                                    │
Gen 43: │ Charlemagne                    ◐       │
        └────────────────────────────────────────┘
```

The "shared with 2 other paths" label tells the user their work on this segment has already paid dividends elsewhere.

---

## Amendment 2: LLM Provider Abstraction

### Current State

The app is hardcoded to Anthropic:
- `CLAUDE.md` specifies `@anthropic-ai/sdk` (Claude Sonnet 4)
- `src/ai/ai-client.ts` uses the Anthropic SDK directly
- Prompts reference `web_search_20250305` tool (Anthropic-specific)
- `implementation-plan.md` says "Anthropic API (Claude Sonnet 4) — user-provided API key"

### The Problem

1. **Cost.** Claude Sonnet is ~$3/M input, $15/M output tokens. A deep research session on 50 people could cost $1-5. Users doing serious genealogy research will hit this regularly.

2. **Vendor lock-in.** If Anthropic changes pricing, rate limits, or tool availability, the entire AI feature set breaks.

3. **Free/local options exist.** Ollama runs models locally for free. Google Gemini has a generous free tier. Open-source models (Llama, Mistral, Qwen) are good enough for Mode 1 plausibility checks.

4. **Not all tasks need the best model.** Mode 1 (quick plausibility check) doesn't need Claude Sonnet. A cheaper or free model would work fine. Mode 3 (deep research with web search) genuinely benefits from Claude's quality and tool use. Different tasks should be able to use different providers.

### Architecture: Provider Interface

Abstract the AI layer behind a provider interface. The app codes against the interface, never against a specific SDK.

```typescript
// src/ai/provider/types.ts

export interface LLMProvider {
  id: string;                    // "anthropic" | "openai" | "ollama" | "google" | "custom"
  name: string;                  // "Claude (Anthropic)" | "GPT-4o (OpenAI)" | etc.
  
  // Capabilities — not all providers support all features
  capabilities: {
    webSearch: boolean;           // Can the model search the web during inference?
    toolUse: boolean;             // Can the model call tools (function calling)?
    structuredOutput: boolean;    // Can the model reliably output JSON?
    maxContextTokens: number;     // Context window size
    maxOutputTokens: number;
    streaming: boolean;
  };
  
  // Cost (per million tokens, in USD, for cost estimation)
  cost: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  
  // Connection
  requiresApiKey: boolean;
  apiKeyLabel: string;           // "Anthropic API Key" | "OpenAI API Key" | "Ollama URL"
  baseUrl: string | null;        // For self-hosted / custom endpoints
  
  // The actual call
  sendMessage(request: LLMRequest): Promise<LLMResponse>;
  
  // Validate connection (test API key, check model availability)
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

export interface LLMRequest {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature?: number;
  
  // Tool use (optional — only used if provider supports it)
  tools?: ToolDefinition[];
  
  // Structured output hint
  responseFormat?: "text" | "json";
}

export interface LLMResponse {
  content: string;                // The text response
  toolCalls?: ToolCall[];         // Any tool calls made (web search results, etc.)
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;        // In USD
  };
  
  // For multi-turn (Mode 3)
  stopReason: "end_turn" | "tool_use" | "max_tokens";
}

export interface ToolDefinition {
  type: string;
  name: string;
  description?: string;
  // Provider-specific tool config is handled in the provider implementation
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result: string;
}
```

### Provider Implementations

```
src/ai/
├── provider/
│   ├── types.ts                 # LLMProvider interface + LLMRequest/Response
│   ├── anthropic-provider.ts    # Claude via @anthropic-ai/sdk
│   ├── openai-provider.ts       # GPT-4o / GPT-4o-mini via openai SDK
│   ├── ollama-provider.ts       # Local models via Ollama REST API
│   ├── google-provider.ts       # Gemini via Google AI SDK
│   ├── openrouter-provider.ts   # Multiple models via OpenRouter (one API key, many models)
│   └── provider-registry.ts     # Manages available providers + user config
├── ai-client.ts                 # Uses LLMProvider interface, not a specific SDK
├── prompts/                     # Prompts are provider-agnostic (plain text)
│   └── ...
└── ...
```

### Provider Registry

```typescript
// src/ai/provider/provider-registry.ts

export interface ProviderConfig {
  providerId: string;
  modelId: string;              // "claude-sonnet-4-20250514" | "gpt-4o" | "llama3.1:70b"
  apiKey: string | null;        // null for Ollama (no key needed)
  baseUrl: string | null;       // Custom endpoint URL
  enabled: boolean;
}

export interface TaskAssignment {
  quickCheck: ProviderConfig;       // Mode 1 — cheapest model is fine
  validation: ProviderConfig;       // Mode 2 — needs structured output, ideally web search
  deepResearch: ProviderConfig;     // Mode 3 — needs web search + high quality
  chat: ProviderConfig;             // Research assistant chat
}

// Default: all tasks use the same provider
// Advanced: users can assign different providers to different tasks
// e.g., Ollama for quick checks, Claude for deep research
```

### Provider-Specific Capabilities Matrix

| Provider | Web Search | Tool Use | JSON Output | Free Tier | Notes |
|---|---|---|---|---|---|
| **Anthropic (Claude)** | ✅ Native | ✅ | ✅ | ❌ | Best quality. Web search is built-in tool. |
| **OpenAI (GPT-4o)** | ❌ (needs Bing plugin or function) | ✅ | ✅ | ❌ | No native web search. Would need external search function. |
| **OpenAI (GPT-4o-mini)** | ❌ | ✅ | ✅ | ❌ | Cheap. Good for Mode 1. |
| **Google (Gemini 2.0)** | ✅ (Grounding) | ✅ | ✅ | ✅ (generous) | Free tier with Google AI Studio. Has "grounding" (web search). |
| **Ollama (local)** | ❌ | ⚠️ Varies | ⚠️ Varies | ✅ Free | Runs locally. Llama 3.1 70B is solid for Mode 1. No web search. |
| **OpenRouter** | Varies by model | Varies | Varies | ❌ (but cheap) | Meta-provider. One API key accesses hundreds of models. Good for experimentation. |

### Handling Web Search Across Providers

This is the hard part. Web search is the core differentiator for Modes 2 and 3, and it's implemented differently (or not at all) across providers.

**Option A: Provider-native search (best quality)**

If the provider supports web search natively (Anthropic, Google Gemini Grounding), use it. The prompt includes the search tool definition and the model decides when to search.

**Option B: External search function (fallback)**

For providers without native search (OpenAI, Ollama), implement a search function the app calls:

```typescript
// src/ai/search/external-search.ts

export async function externalWebSearch(query: string): Promise<SearchResult[]> {
  // Option 1: Use a free search API (SearXNG, Brave Search API free tier)
  // Option 2: Use Google Custom Search (100 free queries/day)
  // Option 3: Use Bing Web Search API (free tier: 1000/month)
  // Option 4: Scrape DuckDuckGo (fragile, not recommended)
}
```

The flow for providers without native search:
1. App sends prompt to LLM: "What would you search for to validate this person?"
2. LLM responds with search queries
3. App executes searches using external search function
4. App sends search results back to LLM: "Here are the search results. Analyze them."
5. LLM analyzes and responds

This is a two-turn pattern instead of Claude's single-turn tool-use, but produces similar results.

```typescript
// In ai-client.ts:

async function runValidation(
  provider: LLMProvider,
  request: ValidationRequest
): Promise<ValidationResult> {
  
  if (provider.capabilities.webSearch) {
    // Provider handles search internally (Anthropic, Google)
    return runValidationWithNativeSearch(provider, request);
  } else if (provider.capabilities.toolUse) {
    // Provider supports function calling — we provide the search function
    return runValidationWithExternalSearch(provider, request);
  } else {
    // No search at all — knowledge-only assessment (Mode 1 equivalent)
    return runValidationKnowledgeOnly(provider, request);
  }
}
```

**Option C: No search (degraded but functional)**

For Mode 1 (quick plausibility check), web search isn't needed at all. The model assesses plausibility from its training data. This works fine on any model, including free local ones.

For Mode 2 without search, the model can still:
- Assess date/place plausibility
- Check if a claimed title or historical figure is real
- Suggest what records SHOULD exist (even if it can't search for them)
- Identify naming patterns, geographic consistency, era appropriateness

The result is a "knowledge-based assessment" rather than a "research report." Less valuable, but still useful — and free.

### Prompt Portability

The prompts in `src/ai/prompts/` should be provider-agnostic — plain text, no SDK-specific syntax. Provider-specific formatting (tool definitions, JSON mode flags) is handled in the provider implementation, not in the prompt templates.

```typescript
// GOOD — prompt is plain text, portable:
const systemPrompt = `You are a genealogical research assistant. 
Assess this person's plausibility...`;

// Provider adds its own tool config:
// Anthropic: tools: [{ type: "web_search_20250305", name: "web_search" }]
// OpenAI: tools: [{ type: "function", function: { name: "web_search", ... } }]
// Ollama: (no tools — knowledge-only mode)
```

The one exception: the JSON response format. Some models need stronger coercion to output valid JSON. The prompt templates should include the JSON schema, and providers that support structured output (OpenAI's `response_format: { type: "json_object" }`, Claude's natural JSON compliance) handle it their way. For models that struggle with JSON, the result parser should have a fallback that extracts key fields from freeform text.

```typescript
// src/ai/result-parser.ts

function parseValidationResult(raw: string): ValidationResult {
  // Try JSON parse first
  try {
    const cleaned = raw.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(cleaned) as ValidationResult;
  } catch {
    // Fallback: extract fields from freeform text
    return extractFieldsFromText(raw);
  }
}
```

### Settings UI

```
┌─────────────────────────────────────────────────────┐
│ ⚙️ AI Provider Settings                             │
│                                                      │
│ ┌─ Quick checks (Mode 1) ────────────────────────┐  │
│ │ Provider: [Ollama (local)     ▾]               │  │
│ │ Model:    [llama3.1:8b        ▾]               │  │
│ │ Status:   ● Connected                          │  │
│ │ Cost:     Free                                 │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌─ Validation & research (Mode 2-3) ─────────────┐  │
│ │ Provider: [Anthropic (Claude)  ▾]              │  │
│ │ Model:    [claude-sonnet-4     ▾]              │  │
│ │ API Key:  [sk-ant-•••••••••••] [Test ✓]       │  │
│ │ Cost:     ~$3/M in, $15/M out                  │  │
│ │ Web search: ✅ Supported                       │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌─ Research chat ────────────────────────────────┐  │
│ │ Provider: [Same as validation  ▾]              │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ [Use same provider for everything]                   │
│                                                      │
│ Monthly budget limit: [$5.00       ]                 │
│ Spent this month:     $1.23                          │
│                                                      │
│ [Add custom provider (OpenRouter, self-hosted)]      │
└─────────────────────────────────────────────────────┘
```

### Recommended Default Setup for Cost-Conscious Users

| Task | Provider | Model | Cost | Quality |
|---|---|---|---|---|
| Mode 1 (quick check) | Ollama or Gemini free | Llama 3.1 8B or Gemini Flash | Free | Good enough for plausibility |
| Mode 2 (validation) | Google Gemini | Gemini 2.0 Pro (with grounding) | Free tier: 50 req/day | Good, has web search |
| Mode 3 (deep research) | Anthropic | Claude Sonnet | ~$0.05-0.15/task | Best quality, best web search |
| Chat | Google Gemini or Anthropic | Depends on budget | Varies | Depends on task |

This setup gives users free daily research capacity (Gemini free tier) with Claude available for the deep, high-value investigations.

### Migration Path

**Phase E initial build:** Implement the provider interface + Anthropic provider. All existing prompts work. This is what ships first.

**Phase E follow-up (or Phase 2):** Add OpenAI, Ollama, and Google providers. Add the task assignment UI. Add external search fallback.

**The key rule:** Never import `@anthropic-ai/sdk` outside of `anthropic-provider.ts`. All other code uses the `LLMProvider` interface. This means adding new providers never touches existing code.

```typescript
// WRONG — tight coupling:
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey });
const response = await client.messages.create({ ... });

// RIGHT — loose coupling:
import { getProvider } from "@/ai/provider/provider-registry";
const provider = getProvider("validation");  // Returns whatever the user configured
const response = await provider.sendMessage({ ... });
```

### Dependencies

| Provider | npm Package | Bundle Impact |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | ~50KB |
| OpenAI | `openai` | ~45KB |
| Google | `@google/generative-ai` | ~30KB |
| Ollama | None (REST API via fetch) | 0KB |
| OpenRouter | None (OpenAI-compatible REST API) | 0KB |

Only the configured provider's SDK needs to load. Use dynamic imports:

```typescript
// src/ai/provider/anthropic-provider.ts
export async function createAnthropicProvider(config: ProviderConfig): Promise<LLMProvider> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.apiKey });
  // ...
}
```

This keeps the initial bundle small. Ollama and OpenRouter need zero additional dependencies since they use standard REST APIs.

---

## Files Summary

### Amendment 1 (Shared Ancestor Inheritance)

No new files. Changes to existing files:

| File | Change |
|---|---|
| `src/graph/proof-ladder.ts` | Add `sharedWithPaths` field to `ProofLink`. Accept optional `allNotablePaths` parameter. |
| `src/components/person-detail/ProofLadderSection.tsx` | Show "shared with N other paths" badge. Show "validated segment" visual grouping for consecutive Tier 1-2 edges. |
| `src/engine/story-paths.ts` | Recompute `chainConfidence` from live graph data, not cached import-time values. |

### Amendment 2 (LLM Provider Abstraction)

New files:

| File | Phase | Purpose |
|---|---|---|
| `src/ai/provider/types.ts` | E | `LLMProvider`, `LLMRequest`, `LLMResponse` interfaces |
| `src/ai/provider/anthropic-provider.ts` | E | Claude implementation |
| `src/ai/provider/openai-provider.ts` | E+ or Phase 2 | GPT-4o / GPT-4o-mini implementation |
| `src/ai/provider/ollama-provider.ts` | E+ or Phase 2 | Local model implementation (zero-cost) |
| `src/ai/provider/google-provider.ts` | E+ or Phase 2 | Gemini implementation (free tier) |
| `src/ai/provider/openrouter-provider.ts` | Phase 2 | Multi-model provider |
| `src/ai/provider/provider-registry.ts` | E | Provider management + task assignment |
| `src/ai/search/external-search.ts` | E+ or Phase 2 | Fallback web search for non-Anthropic providers |
| `src/components/settings/ProviderSettings.tsx` | E | Provider configuration UI |

Modified files:

| File | Change |
|---|---|
| `src/ai/ai-client.ts` | Refactor to use `LLMProvider` interface instead of Anthropic SDK directly |
| `src/ai/prompts/*.ts` | Ensure all prompts are plain text, no SDK-specific syntax |
| `src/ai/result-parser.ts` | Add freeform text fallback for models that don't reliably output JSON |
| `CLAUDE.md` | Update AI section: provider interface, supported providers, task assignment |
| `docs/implementation-plan.md` | Update Phase E: provider abstraction ships with Anthropic provider; others follow |

### CLAUDE.md Updates

Replace in "Tech Stack" table:
```
| AI | `@anthropic-ai/sdk` (Claude Sonnet 4) |
```
With:
```
| AI | LLMProvider abstraction. Ships with Anthropic (Claude Sonnet). 
|    | Supports OpenAI, Google Gemini, Ollama (local/free), OpenRouter. 
|    | Provider SDKs loaded dynamically. Web search via provider-native 
|    | tools or external fallback. |
```

Add to "Key Design Decisions":
```
13. **LLM provider abstraction.** All AI code uses the LLMProvider interface, never
    a specific SDK. Provider implementations are isolated in src/ai/provider/. 
    Adding a new provider never touches existing code. Dynamic imports keep the 
    bundle small.
14. **Task-level provider assignment.** Users can assign different providers to 
    different task types: free/local model for quick checks, paid model for deep 
    research. This makes the AI features accessible at zero cost for basic use.
15. **Web search has three tiers.** Provider-native (best, Anthropic/Google), 
    external function (good, OpenAI + Brave/SearXNG), knowledge-only (degraded 
    but free, Ollama). The app adapts automatically based on provider capabilities.
16. **Shared ancestor segments inherit validation.** Proof ladders recompute 
    from live graph state. When a shared edge improves, every path through it 
    updates. No explicit inheritance mechanism — just proper cache invalidation 
    and deriving from the single source of truth (the graph).
```
