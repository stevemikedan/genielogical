## Context

I'm sharing three spec documents that cover remaining architectural decisions and features. Read all three before making any changes. Some of this may overlap with work already in progress — check the current codebase state before implementing anything.

## Documents (in priority order)

### 1. `architecture-amendments.md` — URGENT, affects current work

**Read this before building or modifying `src/ai/ai-client.ts` or anything in `src/ai/`.**

This contains two amendments:

**Amendment 1: LLM Provider Abstraction.** All AI code must target an `LLMProvider` interface, not the Anthropic SDK directly. Never import `@anthropic-ai/sdk` outside of `src/ai/provider/anthropic-provider.ts`. This enables users to connect free/cheap alternatives (Ollama local, Google Gemini free tier, OpenAI, OpenRouter) alongside Claude. Different AI task types (quick check vs. deep research vs. chat) can use different providers.

Action: If `ai-client.ts` already imports the Anthropic SDK directly, refactor it behind the provider interface now. If you haven't built it yet, build it with the interface from the start. Create `src/ai/provider/types.ts` with the `LLMProvider`, `LLMRequest`, `LLMResponse` interfaces, then `src/ai/provider/anthropic-provider.ts` as the first implementation. The Anthropic provider is the only one needed now — other providers come later, but the abstraction layer must exist from the start.

**Amendment 2: Shared Ancestor Validation Inheritance.** Proof ladders and story card chain confidence should recompute from live graph state on render, not cache stale import-time values. When a shared edge between two paths improves (user adds a source), every path traversing that edge should reflect the update. This is mostly a "derive, don't cache" principle — not a new feature. Add `sharedWithPaths` field to `ProofLink` so the UI can show "also on path to: [other notable ancestors]." Lower priority than the provider abstraction.

### 2. `ancestry-conflict-detection-spec.md` — CHECK CURRENT STATE FIRST

This describes detection and resolution of conflicting ancestry (same person with different parents in different parts of the tree), echo duplicates (same person at different generation depths with slight name variants), and convergence scanning.

**Before implementing: check if the current codebase already handles any of this.** If ancestry conflict detection/resolution is already built or in progress, review this spec against what exists and only implement what's missing. The spec adds:
- `ANCESTRY_CONFLICT_*` flag types (different_parents, upstream_divergence, partial)
- Echo duplicate detector (same person at different generation depths)
- Path convergence scanner
- Conflict resolution UI section in person detail panel
- `RESOLVE_ANCESTRY_CONFLICT` reducer action with merge logic
- Confidence penalty for unresolved ancestry conflicts
- Full-tree ancestry audit as a batch operation

If the existing implementation covers the core case (duplicate entries with different parents), focus on what it doesn't cover: echo duplicates, upstream divergence detection, the merge workflow that reparents descendants and preserves sources, and the confidence scorer penalty.

### 3. `research-assistant-chat-spec.md` — LOWER PRIORITY, Phase 2

This describes a context-aware research chat panel. It is designed to be built AFTER the structured AI modes (quick check, validation, deep research) are working. 

If chat panel implementation is already in progress: review this spec for the interaction patterns (tree questions, research with web search, natural-language source entry, comparative analysis, historical context) and the structured action buttons pattern (the app parses AI responses and renders inline action buttons like "Add this source ✓" that dispatch reducer actions). The key architectural point: the chat never mutates the tree directly — every mutation goes through a confirmation button that dispatches existing reducer actions.

If chat hasn't been started yet: defer to after the structured AI modes are complete and tested.

## Key Rules

1. **Never import a specific LLM SDK outside its own provider file.** `@anthropic-ai/sdk` only in `anthropic-provider.ts`. All other code uses `LLMProvider` interface.
2. **Prompts are plain text, not SDK-specific.** Provider implementations handle tool definitions and response format flags.
3. **AI never mutates the tree directly.** AI suggests, user confirms via UI action buttons, reducer handles mutation.
4. **Derive, don't cache.** Proof ladders, chain confidence, and story cards recompute from the live graph. Stale cached values cause inconsistency when shared edges are updated.
5. **Cost is always visible.** Every AI operation shows estimated cost before execution and actual cost after.
