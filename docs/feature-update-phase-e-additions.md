# GenieLogical — Feature Update: Phase E Additions & Cross-Phase Refinements

**Date:** March 25, 2026
**Context:** User research with real GEDCOM data (5,700+ individuals, 46 generations) revealed feature gaps and opportunities across Phases D–F and into Phase 2. This document describes new features, refinements to existing specs, and updated test data — all generalized for any user's tree, not specific to any single dataset.

**Action for Claude Code:** Integrate these additions into `docs/implementation-plan.md`, update `CLAUDE.md` with new architecture notes and test expectations, and add new type definitions to `src/types/`. Do NOT begin implementation — this is a planning update only.

---

## 1. New Engine: Deep Scanner (`src/engine/deep-scanner.ts`)

**Phase:** E (fires automatically after flag engine on import)
**Purpose:** Analyze tree structure by branch, giving users an instant "Your Tree at a Glance" research roadmap.

### What it does

Given a subject person, trace ancestry through all 4 grandparents to identify 8 great-grandparent branches (or fewer if the tree is incomplete). For each branch, compute:

- **Ancestor count** — total unique ancestors reachable through that branch
- **Max depth** — deepest generation reached
- **Deepest ancestor** — name and ID of the person at the end of the longest path
- **Notable figures** — historically significant people detected by keyword/title matching
- **Branch richness score** — `ancestors × log(maxDepth) × (1 + notableCount)` — a composite ranking to help users prioritize research

### Output type

```typescript
interface BranchAnalysis {
  branchLabel: string;              // "Paternal grandfather's father" etc.
  greatGrandparentId: string;
  greatGrandparentName: string;
  viaGrandparentName: string;
  ancestorCount: number;
  maxDepth: number;                 // Generation number relative to subject
  deepestAncestorId: string;
  deepestAncestorName: string;
  deepestAncestorBirthYear: number | null;
  notableFigures: NotableAncestor[];
  richnessScore: number;
}

interface DeepScanResult {
  subjectId: string;
  totalUniqueAncestors: number;
  maxGenerationReached: number;
  branches: BranchAnalysis[];
  generationDistribution: Map<number, number>;  // gen → count
  allNotableFigures: NotableAncestor[];          // deduplicated across branches
}
```

### Implementation notes

- Pure function: `runDeepScan(graph: TreeGraph, subjectId: string): DeepScanResult`
- Uses BFS from subject. Track which branch each ancestor was first reached through.
- Generation distribution is useful for the "depth map" visualization — most trees have a dense cluster in the middle generations (colonial era for American trees) with narrow paths extending deeper.
- Should complete in <500ms for a 6,000-person tree. BFS is O(V+E).

### UI: `DeepScanView.tsx`

New tab alongside Health Dashboard. Shows:
- 8-branch summary cards ranked by richness score
- Generation distribution chart (bar chart: generation number × ancestor count)
- "Thin path" warning when a deep path narrows to 1-2 ancestors per generation for 3+ consecutive generations — this is where speculative grafts typically live
- Notable figures gallery (click to navigate to person detail)

---

## 2. New Engine: Story Paths (`src/engine/story-paths.ts`)

**Phase:** E (promoted from Phase 2 deferred list — this is the feature that drives sharing and engagement)
**Purpose:** Automatically discover historically significant ancestors and present them as narrative "story cards."

### How detection works

Maintain a dictionary of detection rules:

**1. Name-based matching** — known historical figures:
```typescript
const KNOWN_FIGURES: { pattern: RegExp; category: string; significance: string }[] = [
  { pattern: /charlemagne/i, category: "royalty", significance: "Emperor of the Carolingian Empire (800–814)" },
  { pattern: /edward\b.*\bengland/i, category: "royalty", significance: "King of England" },
  // ... extensible list
];
```

**2. Title-based matching** — detect titles embedded in name fields:
```typescript
const TITLE_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /knight\s*templar/i, category: "military_order" },
  { pattern: /\bregicide\b/i, category: "political" },
  { pattern: /\bcovenanter\b/i, category: "clergy" },
  { pattern: /lord\s*high\s*chancellor/i, category: "legal_scholar" },
  { pattern: /\bchief\b.*\b(cornstalk|shawnee|cherokee|creek)/i, category: "indigenous_leader" },
  { pattern: /godfather.*shakespeare|shakespeare.*godfather/i, category: "author_theologian" },
  { pattern: /\bking\s*of\s*jerusalem\b/i, category: "military_order" },
  // ... extensible
];
```

**3. Role-based matching** — detect occupational/role keywords:
```typescript
const ROLE_PATTERNS = [
  { pattern: /\bauthor\b|\bpoet\b|\bwriter\b/i, category: "author_theologian" },
  { pattern: /\bphysician\b|\bsurgeon\b/i, category: "scientist_physician" },
  { pattern: /\bbishop\b|\barchbishop\b/i, category: "clergy" },
  // ...
];
```

### Output type

```typescript
interface NotableAncestor {
  personId: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  category:
    | "royalty"
    | "military_order"        // Templar, Hospitaller, Crusader
    | "political"             // Regicide, VP, Lord Chancellor
    | "indigenous_leader"
    | "author_theologian"
    | "scientist_physician"
    | "artist_musician"
    | "legal_scholar"
    | "clergy"
    | "colonial_gentry"
    | "military"
    | "other";
  matchRule: string;           // Which pattern triggered the match
  significance: string;        // One-line description (from dictionary or AI-generated)
  generationsFromSubject: number;
  pathToSubject: string[];     // Ordered list of person IDs from subject → this ancestor
  chainConfidence: number;     // Tier number of weakest link in the path
  bridgeZone: BridgeZone | null;
}

interface StoryPathResult {
  subjectId: string;
  notableAncestors: NotableAncestor[];
  byCategory: Map<string, NotableAncestor[]>;
}
```

### Integration with AI (Phase E)

For each detected notable ancestor, the "Ask AI" button can:
1. Confirm whether the person is historically real and significant
2. Generate a 2-3 sentence historical context blurb
3. Assess whether the GEDCOM path to them is plausible given known genealogical scholarship
4. Suggest the single most impactful source to verify the connection

This is a natural extension of the existing single-person "Ask AI" spec — it just provides richer context to the prompt.

### UI: `StoryCard.tsx`

Rendered in the Deep Scan view and linkable from person detail. Each card shows:
- Person name, dates, category badge
- Historical significance (1-2 sentences)
- Generation count and chain confidence tier
- Bridge zone callout if present
- "View full path" button → opens proof ladder for this specific chain
- "Ask AI" button → generates historical context and plausibility assessment

---

## 3. New Engine: Bridge Detector (`src/engine/bridge-detector.ts`)

**Phase:** E (also feeds into Phase D proof ladder refinement)
**Purpose:** Identify consecutive runs of unsourced or low-confidence edges in a path. These "bridge zones" are the structural weak points that, if verified, unlock the most value.

### What it does

Given a path (ordered list of person IDs from subject to target ancestor), walk the edges and identify spans where 2+ consecutive edges are below a threshold tier (default: Tier 3 or lower). Return the bridge zones.

```typescript
interface BridgeZone {
  startPersonId: string;
  endPersonId: string;
  startGen: number;          // Generation of first person in the zone
  endGen: number;            // Generation of last person in the zone
  edgeCount: number;         // Number of consecutive weak edges
  averageTier: number;       // Mean confidence tier in the zone
  description: string;       // "3 consecutive unsourced links between Gen 8–10"
}

function detectBridgeZones(
  graph: TreeGraph,
  path: string[],
  threshold: ConfidenceTier = 3
): BridgeZone[];
```

### Why this matters

Users currently see per-edge confidence, but the *pattern* of multiple weak edges in sequence is far more significant than any individual weak edge. A single Tier 3 edge in an otherwise Tier 1 chain is a minor issue. Three consecutive Tier 3 edges represent a structural gap that could invalidate everything downstream. The bridge detector surfaces this pattern explicitly.

### UI integration

- **Proof Ladder (Phase D):** Highlight bridge zones with a colored background band and label. Current spec shows per-link badges — add zone grouping.
- **Story Cards (Phase E):** Include bridge zone info so users immediately see where the connection is weakest.
- **Research Priority Matrix (Phase E):** Bridge zones with high path throughput (many notable ancestors downstream) get boosted priority.

---

## 4. New Engine: Impact Scorer (`src/engine/impact-scorer.ts`)

**Phase:** E (enhancement to `research-recommender.ts`)
**Purpose:** Rank unsourced edges by how many notable-ancestor paths pass through them, so users know which single verification would strengthen the most connections.

### Algorithm

```typescript
interface ResearchPriority {
  edgeId: string;
  parentId: string;
  childId: string;
  currentTier: number;
  impactScore: number;
  affectedNotablePaths: string[];    // Names of notable ancestors downstream
  affectedPathCount: number;
  suggestedSources: ResearchStep[];  // From research-recommender
  description: string;               // "Verifying this link would strengthen 3 paths: ..."
}

function computeResearchPriorities(
  graph: TreeGraph,
  notableAncestors: NotableAncestor[],
  allEdges: Map<string, Edge>
): ResearchPriority[];
```

For each edge in the graph:
1. Count how many notable-ancestor paths pass through it
2. Weight by inverse of current tier (Tier 4 edges get 4× weight vs Tier 1)
3. Sort descending by `pathCount × inverseCurrentTier`
4. Attach suggested sources from the existing research-recommender lookup table

### UI: `PriorityMatrix.tsx`

Dedicated view (tab alongside Health Dashboard and Deep Scan). Ranked list of edges to verify, each showing:
- Parent → child names
- Current confidence tier
- Impact score with explanation ("Strengthens 3 paths: Charlemagne, MacRae, Mackenzie royal descent")
- Suggested source types and repositories
- "Go to person" link

---

## 5. Phase D Refinements

### 5a. Proof Ladder: Bridge Zone Highlighting

**Current spec:** Linear vertical chain with per-link confidence badges, weakest link highlighted red.

**Addition:** When the proof ladder contains a bridge zone (2+ consecutive edges below threshold), visually group those links with a colored background band and a label: "Bridge zone: N consecutive unsourced links. Verifying any one strengthens the entire span." The bridge detector feeds this data.

### 5b. Proof Ladder: "Safe to Share" Text Generation

**Current spec:** Listed as Phase 2 deferred.

**Promote to Phase D:** This is a pure string template function operating on the proof ladder result. Trivial to implement once the ladder exists.

```typescript
function generateSafeToShareText(
  subjectName: string,
  targetName: string,
  weakestTier: number,
  bridgeZones: BridgeZone[]
): string;
```

Logic:
- All links Tier 1-2, no bridge zones → "I descend from [target] through a documented chain of [N] generations."
- Weakest link Tier 3, no bridge zones → "My tree connects to [target] through [N] generations. Most links are documented; [M] links await primary source verification."
- Any Tier 4 or bridge zone present → "My tree appears to connect to [target], but [describe weakness]. Further research is needed to confirm this connection."
- Path passes through "extended beyond GEDCOM" territory → "My tree connects to documented historical figures who themselves descend from [target] according to published genealogical sources."

### 5c. Duplicate Detection Inline Alert

**Current spec:** Duplicate detector runs in flag engine, results shown in health dashboard.

**Addition:** When the person detail panel loads and the current person has a `duplicate_suspect` flag, show an inline alert at the top of the panel: "⚠ Possible duplicate: [other person name] has similar name and dates. [Compare]" — the Compare link opens both person panels side by side (or navigates to the other person).

---

## 6. Phase F Addition: Path Export

### 6a. Single-Path HTML Export

**Current spec:** "Export a subtree or path as a self-contained HTML file."

**Clarification:** The most valuable export is a *single lineage path* from subject to a specific notable ancestor, rendered as a navigable vertical chain with:
- Person cards showing name, dates, role, confidence badge
- Per-link source citations
- Bridge zone callouts
- Key findings / research notes
- Historical context for the target ancestor

This is the format of the existing Charlemagne app prototype. The export should generate a self-contained HTML file (React via CDN, no build step) that can be published to any static host.

```typescript
interface PathExportConfig {
  subjectId: string;
  targetId: string;
  title: string;
  subtitle: string;
  includeSourceCitations: boolean;
  includeResearchNotes: boolean;
  theme: "dark_heritage" | "light_print";  // Dark for web, light for PDF
}
```

---

## 7. New Types to Add (`src/types/`)

### `src/types/deep-scan.ts`

```typescript
export interface BranchAnalysis {
  branchLabel: string;
  greatGrandparentId: string;
  greatGrandparentName: string;
  viaGrandparentName: string;
  ancestorCount: number;
  maxDepth: number;
  deepestAncestorId: string;
  deepestAncestorName: string;
  deepestAncestorBirthYear: number | null;
  notableFigures: NotableAncestor[];
  richnessScore: number;
}

export interface DeepScanResult {
  subjectId: string;
  totalUniqueAncestors: number;
  maxGenerationReached: number;
  branches: BranchAnalysis[];
  generationDistribution: Map<number, number>;
  allNotableFigures: NotableAncestor[];
}
```

### `src/types/story-path.ts`

```typescript
export interface NotableAncestor {
  personId: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  category: NotableCategory;
  matchRule: string;
  significance: string;
  generationsFromSubject: number;
  pathToSubject: string[];
  chainConfidence: number;
  bridgeZone: BridgeZone | null;
}

export type NotableCategory =
  | "royalty"
  | "military_order"
  | "political"
  | "indigenous_leader"
  | "author_theologian"
  | "scientist_physician"
  | "artist_musician"
  | "legal_scholar"
  | "clergy"
  | "colonial_gentry"
  | "military"
  | "other";

export interface StoryPathResult {
  subjectId: string;
  notableAncestors: NotableAncestor[];
  byCategory: Map<NotableCategory, NotableAncestor[]>;
}
```

### `src/types/bridge.ts`

```typescript
export interface BridgeZone {
  startPersonId: string;
  endPersonId: string;
  startGen: number;
  endGen: number;
  edgeCount: number;
  averageTier: number;
  description: string;
}
```

### `src/types/research.ts` — additions

```typescript
// Add to existing ResearchStep or alongside it:
export interface ResearchPriority {
  edgeId: string;
  parentId: string;
  childId: string;
  currentTier: number;
  impactScore: number;
  affectedNotablePaths: string[];
  affectedPathCount: number;
  suggestedSources: ResearchStep[];
  description: string;
}
```

---

## 8. New Files Summary

| File | Phase | Purpose |
|---|---|---|
| `src/types/deep-scan.ts` | E | Types for branch analysis and deep scan results |
| `src/types/story-path.ts` | E | Types for notable ancestor detection |
| `src/types/bridge.ts` | E | Types for bridge zone detection |
| `src/engine/deep-scanner.ts` | E | Branch analysis, depth mapping, generation distribution |
| `src/engine/deep-scanner.test.ts` | E | Tests against fixture GEDCOMs |
| `src/engine/story-paths.ts` | E | Notable ancestor matching, path extraction |
| `src/engine/story-paths.test.ts` | E | Tests |
| `src/engine/bridge-detector.ts` | E | Consecutive weak-edge detection in paths |
| `src/engine/bridge-detector.test.ts` | E | Tests |
| `src/engine/impact-scorer.ts` | E | Research priority ranking by path throughput |
| `src/engine/impact-scorer.test.ts` | E | Tests |
| `src/components/research/DeepScanView.tsx` | E | "Your Tree at a Glance" UI |
| `src/components/research/StoryCard.tsx` | E | Notable ancestor narrative cards |
| `src/components/research/PriorityMatrix.tsx` | E | Ranked research action list |
| `src/components/research/PathExportView.tsx` | F | Single-path export preview + download |

### Modified files

| File | Changes |
|---|---|
| `src/types/index.ts` | Export new type modules |
| `src/engine/index.ts` | Export new engines |
| `src/graph/proof-ladder.ts` | Accept optional `BridgeZone[]` for zone highlighting |
| `src/components/person-detail/ProofLadderSection.tsx` | Add bridge zone visual grouping |
| `src/components/person-detail/PersonDetailPanel.tsx` | Add duplicate-suspect inline alert |
| `src/components/layout/` | Add Deep Scan and Priority Matrix as navigation tabs |
| `src/App.tsx` | Wire new views into routing/tab system |
| `docs/implementation-plan.md` | Add these features to Phase E spec, update Phase D and F specs |
| `CLAUDE.md` | Update architecture notes, add new engine descriptions, update test data section |

---

## 9. CLAUDE.md Updates

### Add to "Architecture Overview" section:

```
- **Deep scan runs on import.** After flag engine completes, the deep scanner traces all
  great-grandparent branches and identifies notable figures. Results cached in state. Pure
  graph traversal, no AI. O(V+E) — fast even on large trees.
- **Story paths are keyword-matched, AI-enriched.** Detection is rule-based (fast, deterministic).
  Historical context blurbs are AI-generated on demand (opt-in, costs API calls).
- **Bridge zones are a first-class concept.** A bridge zone is 2+ consecutive edges below a
  confidence threshold. The bridge detector feeds into proof ladders, story cards, and the
  research priority matrix.
- **Impact scoring is path-throughput-based.** Priority = count of notable-ancestor paths
  passing through an edge × inverse of current tier. No AI needed — pure graph computation.
```

### Add to "Key Design Decisions" section:

```
9. **Notable ancestor detection is pattern-based, not AI-dependent.** A dictionary of regex
   patterns matches known historical figures, titles, and roles. AI enhances with context
   blurbs but isn't required for detection. The dictionary is extensible.
10. **Bridge zones, not just weakest links.** The proof ladder highlights consecutive runs
    of weak edges, not just the single worst link. This better represents structural gaps
    in lineage evidence.
11. **Safe-to-share text is template-generated.** Based on weakest tier and bridge zone
    presence. No AI needed. Prevents overclaiming while encouraging sharing.
12. **Deep scan branches from 8 great-grandparents.** This is the natural research unit
    for genealogy — each great-grandparent line is a separate research project with its
    own depth, richness, and documentation level.
```

### Update "Test Data" section:

Add these as general test expectations (not referencing specific people):

```
The test GEDCOM should exercise these scenarios:
- At least one path with 30+ generations reaching medieval European royalty
- At least one path with a date impossibility (child born before parent)
- At least one person appearing as duplicate entries with different parent chains
- At least one person with a title embedded in the name field (e.g., "Sir", "Knight Templar")
- At least one bridge zone of 3+ consecutive unsourced edges
- At least one notable ancestor with a well-documented historical identity
- At least one branch with <100 ancestors (shallow) and one with >1000 (deep)
- At least 2 great-grandparents with no birth date or place (near-root data gaps)
- Multiple branches converging on the same deep ancestor (shared medieval gateway)
- At least one "extended beyond GEDCOM" connection (published genealogy extending beyond tree data)
```

---

## 10. Phase Sequencing Update

No changes to the phase order. All new features slot into existing phases:

| Addition | Phase | Dependency |
|---|---|---|
| Bridge detector | E | Confidence scorer (B), proof ladder (D) |
| Deep scanner | E | Graph traversal (A), flag engine (B) |
| Story paths | E | Graph traversal (A), bridge detector (E) |
| Impact scorer | E | Story paths (E), research recommender (E) |
| Proof ladder bridge zones | D (refinement) | Bridge detector (E) — or stub with TODO |
| Safe-to-share text | D (refinement) | Proof ladder (D) |
| Duplicate inline alert | D (refinement) | Duplicate detector (B) |
| Path export | F | Proof ladder (D), story paths (E) |

**Note on Phase D refinements:** The bridge zone highlighting and safe-to-share text can be stubbed in Phase D (show placeholder or compute without bridge data) and fully wired when Phase E delivers the bridge detector. The duplicate inline alert only needs the existing flag data from Phase B.

---

## 11. What NOT to Do

- **Do not hardcode any specific GEDCOM data, person names, or family connections into the app.** All detection is pattern-based and works on any tree.
- **Do not require AI for any core feature.** AI enriches (context blurbs, plausibility assessment) but every feature has a non-AI fallback.
- **Do not build multi-tree comparison yet.** That's Phase 3. These features all operate on a single imported tree.
- **Do not promote GEDCOM 7 support.** Still deferred. These features work with the existing 5.5/5.5.1 parser.
- **Do not add a "famous ancestors" database that users can't extend.** The notable-ancestor dictionary must be extensible — users should be able to add their own patterns for figures significant to their family.
