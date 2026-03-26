# GenieLogical — Implementation Plan

**Owner:** Steve Daniel · En Dash Consulting
**Date:** March 24, 2026
**Goal:** Fastest path to dropping a real GEDCOM and seeing results
**Approach:** 6 build phases, each producing a testable milestone

---

## Guiding Principles

1. **GEDCOM-in first.** Every phase builds toward "drop a .ged, see something useful." No phase ships without being testable against Steve's 3,348-person tree.
2. **In-memory graph, persisted to IndexedDB.** The entire tree loads into a `Map<string, Person>` + `Map<string, Edge>` structure on import. All UI and analysis operates against the in-memory graph. IndexedDB is the save/load layer, not the query layer.
3. **GEDCOM 7 deferred to Phase 1b.** Phase 1 handles 5.5 and 5.5.1 (covers ~95% of real exports including Ancestry, FamilySearch, MyHeritage). GEDCOM 7 import/export is a separate effort after the core app is solid.
4. **AI from the start, but opt-in.** The Claude API integration is built into Phase 1, but every AI feature requires the user to bring their own API key. No backend, no proxy. Cost estimation shown before batch operations.
5. **Confidence is ceiling-based.** Multiple secondary sources cannot promote a connection to Tier 1. You need at least one primary source. This is more honest and gives users a clear target.

---

## Technical Foundation

| Component | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | React 18+ |
| Build | Vite |
| Styling | Tailwind CSS + CSS custom properties for theme tokens |
| Tree rendering | D3.js (d3-hierarchy) |
| Storage | IndexedDB via `idb` library |
| State management | React Context + useReducer (upgrade to Zustand if needed) |
| AI | Anthropic API (Claude Sonnet 4) — user-provided API key |
| Testing | Vitest + React Testing Library |
| Hosting | Static (Netlify / GitHub Pages / Cloudflare Pages) |

### Project Structure

```
genielogical/
├── public/
├── src/
│   ├── types/              # All TypeScript interfaces
│   │   ├── person.ts
│   │   ├── edge.ts
│   │   ├── source.ts
│   │   ├── flag.ts
│   │   ├── research.ts
│   │   └── conjecture.ts
│   ├── parser/             # GEDCOM parsing
│   │   ├── gedcom-parser.ts
│   │   ├── date-normalizer.ts
│   │   ├── place-normalizer.ts
│   │   └── format-detector.ts
│   ├── graph/              # In-memory graph structure
│   │   ├── tree-graph.ts
│   │   ├── traversal.ts
│   │   └── path-finder.ts
│   ├── engine/             # Analysis engines
│   │   ├── flag-engine.ts
│   │   ├── confidence-scorer.ts
│   │   ├── duplicate-detector.ts
│   │   └── research-recommender.ts
│   ├── ai/                 # Claude API integration
│   │   ├── ai-client.ts
│   │   ├── validation-prompts.ts
│   │   └── batch-validator.ts
│   ├── storage/            # Persistence
│   │   ├── indexeddb-store.ts
│   │   ├── export-gedcom.ts
│   │   ├── export-json.ts
│   │   └── import-json.ts
│   ├── components/         # React UI
│   │   ├── layout/
│   │   ├── tree/
│   │   ├── person-detail/
│   │   ├── health-dashboard/
│   │   ├── research/
│   │   └── shared/
│   ├── hooks/
│   ├── context/
│   ├── theme/
│   └── App.tsx
├── test/
│   ├── fixtures/           # Test GEDCOM files including Steve's
│   ├── parser/
│   ├── engine/
│   └── components/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Refined Data Model (v4)

All types are defined here. These replace the undefined references (`Source`, `Flag`, `Evidence`, `ResearchStep`, `Conjecture`) from the v3 plan.

### Source

GEDCOM-imported citations and user-added citations are the same type, distinguished by `origin`. The v3 plan's separate `evidenceVault` array is eliminated — everything is a `Source` with a `sourceType` that covers documents, images, DNA, and citations alike.

```typescript
interface Source {
  id: string;
  origin: "gedcom_import" | "user_added";

  // Classification — this drives confidence scoring
  sourceClass: "primary" | "secondary" | "tertiary" | "derivative";
  //  primary   = created at/near time of event by knowledgeable party
  //              (vital record, parish register, census, pension file)
  //  secondary = created later from primary sources, with citations
  //              (published peerage, academic genealogy, DNA + corroboration)
  //  tertiary  = compiled without clear sourcing
  //              (Ancestry tree, unsourced family history, online database)
  //  derivative = copy or transcription of another source

  // Granular type — drives research recommendations
  sourceType:
    | "vital_record" | "census" | "church_register" | "court_record"
    | "military_record" | "pension_file" | "land_grant" | "probate"
    | "published_genealogy" | "compiled_tree" | "dna"
    | "family_bible" | "newspaper" | "monument_inscription"
    | "personal_knowledge" | "ancestry_hint" | "photograph"
    | "document_scan" | "other";

  // Description
  title: string;
  citation: string;           // Full citation text
  notes: string;
  url: string | null;
  repository: string | null;  // "FamilySearch", "Ancestry", "NARA", "NRS"

  // What does this source prove?
  provesWhat: ("identity" | "birth" | "death" | "marriage"
    | "parentage" | "residence" | "occupation")[];

  // Linkage
  attachedToPersonIds: string[];
  attachedToEdgeIds: string[];

  // GEDCOM cross-reference
  gedcomTag: string | null;

  addedAt: Date;
  addedBy: string;
}
```

### Flag

Auto-detected issues. Created by the flag engine on import and on-demand re-analysis.

```typescript
interface Flag {
  id: string;
  category:
    | "chronological"
    | "prestige_inflation"
    | "duplicate_suspect"
    | "place_normalization"
    | "source_desert"
    | "structural"
    | "unresolved_parentage"
    | "data_quality";
  severity: "critical" | "warning" | "info";

  title: string;
  description: string;
  suggestedAction: string;

  // What triggered this
  ruleId: string;              // e.g. "CHRONO_CENTURY_GAP", "PRESTIGE_TITLE_IN_NAME"
  affectedPersonIds: string[];
  affectedEdgeIds: string[];

  // User response
  userStatus: "new" | "acknowledged" | "investigating" | "dismissed" | "resolved";
  userNote: string | null;

  detectedAt: Date;
  resolvedAt: Date | null;
}
```

### ResearchStep

A concrete, actionable recommendation — either rule-generated or AI-generated.

```typescript
interface ResearchStep {
  id: string;
  personId: string;
  edgeId: string | null;

  origin: "rule_based" | "ai_generated";

  description: string;
  suggestedSource: string | null;
  suggestedUrl: string | null;
  reasoning: string;
  impact: "high" | "medium" | "low";

  status: "not_started" | "complete";
  completedAt: Date | null;
  resultNote: string | null;

  generatedAt: Date;
}
```

### Conjecture

A user hypothesis about an unproven connection.

```typescript
interface Conjecture {
  id: string;
  personId: string;

  hypothesis: string;
  confidencePercent: number;   // 0–100, user's subjective assessment
  supportingEvidence: string;
  contradictingEvidence: string;
  sourceIds: string[];

  status: "open" | "confirmed" | "disproven";
  createdAt: Date;
  updatedAt: Date;
}
```

### Person (updated)

Changes from v3: `evidenceVault` removed (folded into `sources`). `Source`, `Flag`, `ResearchStep`, `Conjecture` types now defined. No other structural changes.

### Edge (unchanged from v3)

The parallel-path model, relationship types, and legitimacy fields are all solid as designed.

---

## Confidence Scoring Algorithm

### Edge Confidence (scored first — atomic unit)

```
INPUTS: edge.sources[], edge.edgeFlags[], connected persons' dates

STEP 1 — Source ceiling
  bestSourceClass = highest sourceClass among sources where
                    provesWhat includes "parentage"

  if bestSourceClass == "primary"    → baseTier = 1
  if bestSourceClass == "secondary"  → baseTier = 2
  if bestSourceClass == "tertiary"   → baseTier = 3
  if bestSourceClass == "derivative" → baseTier = 3
  if no sources at all               → baseTier = 3

STEP 2 — Flag penalties
  if any critical flag on this edge  → baseTier = max(baseTier, 3)
  if chronological impossibility     → baseTier = 4
  if prestige inflation on either connected person → baseTier = max(baseTier, 3)

STEP 3 — Era adjustment (parent's birth year)
  if parentBirthYear < 800           → baseTier = max(baseTier, 3)
  if parentBirthYear < 1500          → baseTier = max(baseTier, 2)
  // Rationale: primary vital records essentially don't exist pre-1500.
  // Pre-800, even secondary documentary evidence is extremely rare.
  // This prevents medieval connections from appearing as Tier 1 on the
  // basis of a single published source, while still allowing well-sourced
  // medieval links (Scots Peerage, Complete Peerage) to reach Tier 2.

STEP 4 — No-source desert penalty
  if no sources AND no flags → baseTier = 3  (unsourced but not wrong)
  if no sources AND has flags → baseTier = 4  (unsourced AND problematic)

RESULT: edge.confidenceTier = baseTier
        edge.confidenceReason = auto-generated explanation string
```

### Person Confidence (derived from edges)

```
STEP 1 — If person has no parent edges (tree root / earliest known):
  Score based on own source coverage:
    has primary source for birth or death    → Tier 1
    has secondary source                     → Tier 2
    tertiary or no sources                   → Tier 3–4 (flag-dependent)

STEP 2 — If person has parent edges:
  baseTier = worst (highest number) tier among parent edges
  // A person is only as strong as their weakest parent connection

STEP 3 — Self-sourcing bonus:
  If the person has strong independent sourcing (primary source for identity),
  AND baseTier is 3 or 4:
    baseTier = max(baseTier - 1, 2)
  // Can improve by 1 tier, but not past Tier 2 — the edge still matters

STEP 4 — Flag penalty:
  If person has critical flags → baseTier = max(baseTier, 3)

RESULT: person.confidenceTier = baseTier
```

### Proof Ladder / Chain Confidence

For any path from person A to person B:
- Chain confidence = weakest (highest tier number) link in the path
- The proof ladder highlights this weakest link in red
- "Safe to share" text is calibrated to the chain confidence, not any individual node

---

## Build Phases

### Phase A — Scaffold + Data Model + GEDCOM Parser
**Milestone:** Drop a .ged file → see parse stats + raw person list in console/basic UI
**Estimated effort:** 1–2 sessions

1. **Project setup**
   - `npm create vite@latest genielogical -- --template react-ts`
   - Install dependencies: `tailwind`, `d3`, `idb`, `uuid`
   - Configure Tailwind with the dark heritage theme tokens (color palette from v3 §8)
   - Set up Google Fonts: EB Garamond, Cinzel, Source Sans 3, JetBrains Mono
   - Configure Vitest

2. **Type definitions**
   - Implement all interfaces: `Person`, `Edge`, `Source`, `Flag`, `ResearchStep`, `Conjecture`
   - Include the parallel path types (`parallelGroupId`, `isPrimary`, `pathLabel`)
   - Helper types: `DateParsed`, `PlaceNormalized`, `ConfidenceTier`, `NodeStatus`

3. **GEDCOM parser** (5.5 and 5.5.1)
   - Line-level tokenizer: level, tag, xref, value
   - Record builder: group lines into INDI, FAM, SOUR, NOTE records
   - Format auto-detection from HEAD record
   - **Person extraction:** name parsing (given/surname from `1 NAME Given /Surname/`), sex, birth/death/burial events with dates and places
   - **Family extraction:** HUSB, WIFE, CHIL pointers → edge creation
   - **Relationship type detection:** ADOP, PEDI (birth/adopted/foster/sealing), `_MREL`/`_FREL` tags
   - **Source extraction:** SOUR records → `Source` objects with `origin: "gedcom_import"`, `sourceClass: "tertiary"` as default (user upgrades later)
   - **Encoding handling:** ANSEL → UTF-8 conversion, ASCII passthrough
   - **Multi-FAM child detection:** when a person is CHIL in multiple FAM records, auto-create a parallel path group
   - **Custom tag tolerance:** `_CUSTOM` tags logged but not fatal

4. **Date normalizer**
   - Parse GEDCOM date formats: `1 JAN 1800`, `ABT 1750`, `BEF 1900`, `AFT 1600`, `BET 1700 AND 1750`, `1800` (year only), freeform text
   - Output: `{ date: Date | null, qualifier: "exact" | "about" | "before" | "after" | "between" | "unknown", raw: string }`
   - Flag dates that parse but are historically suspicious (year < 100, year > current)

5. **Place normalizer**
   - Split comma-delimited place strings into hierarchy: city, county, region, country
   - Normalize country names: "USA" / "United States" / "US" / "United States of America" → "United States"
   - Detect anachronisms: state name used before statehood (info-level flag)
   - Build a place frequency table (for duplicate detection later)

6. **In-memory graph**
   - `TreeGraph` class: `persons: Map<string, Person>`, `edges: Map<string, Edge>`, `sources: Map<string, Source>`
   - Traversal helpers: `getParents(id)`, `getChildren(id)`, `getSiblings(id)`, `getSpouses(id)`, `getAncestors(id, maxGen)`, `getDescendants(id, maxGen)`
   - Path finder: `findPath(fromId, toId)` — BFS between any two nodes

7. **Basic import UI**
   - File drop zone / file picker
   - Progress bar (% of lines parsed)
   - On completion: display parse summary (total people, families, sources found, errors encountered)
   - Temporary: render a scrollable person list with name, dates, source count — enough to verify parsing

**Test:** Load `daniel Family Tree.ged`. Verify: 3,348 individuals parsed, 1,956 families, names render correctly, dates parse, no fatal errors.

---

### Phase B — Flag Engine + Confidence Scorer + Health Dashboard
**Milestone:** Drop a .ged → see a health dashboard with all detected issues, confidence tiers assigned
**Estimated effort:** 1–2 sessions

1. **Flag engine** (`flag-engine.ts`)
   - Run automatically after import (and on-demand re-run)
   - Rules implemented:

   **Chronological (critical):**
   - `CHRONO_BIRTH_BEFORE_PARENT`: child born before parent or within 13 years of parent's birth
   - `CHRONO_BIRTH_AFTER_FATHER_DEATH`: child born >1 year after father's death
   - `CHRONO_BIRTH_AFTER_MOTHER_DEATH`: child born after mother's death
   - `CHRONO_DEATH_BEFORE_BIRTH`: death date precedes birth date
   - `CHRONO_MARRIAGE_IMPOSSIBLE`: marriage before age 12 or after death
   - `CHRONO_LIFESPAN_EXTREME`: lifespan >110 years
   - `CHRONO_SIBLING_SPAN`: children from same mother born >50 years apart
   - `CHRONO_CENTURY_GAP`: birth date off by >100 years from expected era (the Alpin mac Eochaid check)

   **Prestige inflation (warning):**
   - `PRESTIGE_TITLE_IN_NAME`: Sir, Lord, Earl, King, Queen, Duke, Baron, Chief, Colonel, Prince detected in NAME field
   - `PRESTIGE_RAPID_ENNOBLEMENT`: commoner → titled within 2–3 generations without documentation
   - `PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED`: medieval royal claim with no sources

   **Duplicate suspects (warning):**
   - `DUP_NAME_DATE_MATCH`: Soundex + Levenshtein match on name, overlapping dates (±10 years), same/nearby location
   - Output: pairs with a similarity score

   **Place issues (info):**
   - `PLACE_COUNTRY_INCONSISTENT`: variant country names for same location
   - `PLACE_ANACHRONISM`: state name before statehood
   - `PLACE_MISSING`: empty or vague location

   **Source desert (warning):**
   - `SOURCE_DESERT`: 5+ consecutive unsourced ancestors in a direct line
   - `SOURCE_FRONTIER`: identifies the boundary where sourcing ends

   **Structural (critical):**
   - `STRUCT_CIRCULAR`: circular parent-child reference
   - `STRUCT_ORPHAN`: person not in any family record
   - `STRUCT_MISSING_GENDER`: person is HUSB/WIFE but sex = "U"
   - `STRUCT_EMPTY_FAMILY`: FAM record with no HUSB, WIFE, or CHIL

   **Unresolved parentage (warning):**
   - `PARENTAGE_UNRESOLVED`: parallel path group where no edge has Tier 1–2
   - `PARENTAGE_PRIMARY_WEAKER`: primary path is weaker than an alternate
   - `PARENTAGE_UNDOCUMENTED_STEP`: step-connection without sourcing

2. **Confidence scorer** (`confidence-scorer.ts`)
   - Implement the edge confidence algorithm (from §Confidence Scoring above)
   - Implement the person confidence algorithm
   - Run after flag engine (flags feed into scoring)
   - Generate `confidenceReason` strings: e.g., "Tier 3: No sources attached to parent-child link. Era adjustment: pre-1500 caps at Tier 2 maximum."

3. **Health dashboard UI**
   - Top-level summary cards: total people, families, generations, overall health score, source coverage %, status breakdown, issue counts by severity
   - Issue categories as expandable sections with counts
   - Click any issue → navigates to person (Phase C will add the tree view; for now, opens person in the list)
   - Severity filters: critical / warning / info
   - Bulk actions: "Mark all as acknowledged" / "Dismiss info-level"

**Test:** Load Steve's GEDCOM. Verify: Alpin mac Eochaid flagged (CHRONO_CENTURY_GAP), "King of Norway" flagged (PRESTIGE_TITLE_IN_NAME), source deserts detected, duplicate suspects found, overall health score generated.

---

### Phase C — Tree Navigator
**Milestone:** Interactive pedigree view with confidence-colored edges and status badges
**Estimated effort:** 2–3 sessions

1. **D3 tree layout**
   - Horizontal pedigree (ancestor chart) as primary view
   - `d3-hierarchy` for layout computation
   - SVG rendering with React wrapper component
   - Node rendering: name, dates, status badge icon (○ ◐ ● ⚠ ✕), flag warning icon
   - Edge rendering: line style (solid/dashed/dotted) and color (green/blue/amber/red) driven by confidence tier

2. **Interaction**
   - Pan: click-drag on background
   - Zoom: scroll wheel / pinch
   - Click node → opens Person Detail (Phase D; for now, highlights + shows tooltip)
   - Click edge → tooltip showing confidence tier, sources, relationship type
   - Collapse/expand branches
   - Generation counter along left edge

3. **Visual encoding**
   - Confidence colors applied per the design system (§8 of v3 plan)
   - Status badges: tentative gray ○, under review amber ◐, validated green ●, disputed red ⚠, rejected dark gray ✕
   - Rejected nodes: collapsed by default, expand toggle visible, upstream paths preserved as ghosted lines
   - Key node gold highlight border (manually flagged or auto-detected notable ancestors)
   - Flag warning: small orange triangle on nodes with unresolved critical/warning flags

4. **Parallel path visualization**
   - Fork icon on edges where parallel paths exist
   - Click fork → shows all candidate paths as branching lines
   - Primary path: normal rendering; alternates: thinner, semi-transparent, own confidence color
   - Relationship type label on hover: "biological," "step," "adoptive," "unknown"
   - "Set as primary" action available from the fork popover

5. **View modes**
   - Pedigree (ancestor chart from selected root) — default
   - Descendant (from selected ancestor downward)
   - Root selector: dropdown or search to pick the starting person

6. **Minimap**
   - Small overview in corner showing full tree extent with viewport rectangle
   - Click minimap to jump to location

7. **Filter toggles**
   - Show/hide by confidence tier (checkboxes for Tier 1–4)
   - Show/hide rejected nodes
   - Highlight: "only show flagged nodes"

**Test:** Navigate Steve's 19-generation tree. Verify: smooth pan/zoom at 3,348 nodes, confidence colors render correctly, Alpin mac Eochaid shows red dotted edge, Lady Jean Stewart shows green solid, rejected medieval nodes collapse properly, parallel paths on Lt. Col. John Smith/Smyth show fork icon.

---

### Phase D — Person Detail Panel
**Milestone:** Click any node → full detail panel with sources, flags, family links, status controls
**Estimated effort:** 1–2 sessions

1. **Panel layout**
   - Slide-in from right on node click
   - Scrollable, sectioned

2. **Sections implemented:**

   **Identity & Life Events**
   - Name (display, given, surname), sex
   - Birth, death, burial: raw date + normalized, raw place + normalized
   - Lifespan calculation
   - Event timeline (vertical, chronological)

   **Family Connections**
   - Parents: clickable, with edge confidence badge and relationship type
   - If parallel parentage: all candidates shown, primary marked ★, "Set as primary" button
   - Siblings, spouses, children: all clickable with confidence indicators

   **Parallel Paths** (if applicable)
   - Comparison view of all alternate parentage theories
   - Each path: candidate parent(s), relationship type, legitimacy, confidence tier, sources
   - Impact preview: "Switching to this path connects you to [upstream ancestors]"

   **Status & Confidence**
   - Status badge with lifecycle buttons (advance: tentative → under review → validated; or → disputed → rejected)
   - Confidence tier display with auto-generated reason
   - Manual override toggle with justification text field
   - AI validation summary (if run)

   **Sources**
   - All sources (GEDCOM-imported + user-added), displayed with sourceClass badge
   - "Add source" button: form with sourceType, sourceClass, title, citation, URL, provesWhat checkboxes
   - Each source: edit, delete

   **Flags & Issues**
   - All flags for this person and their edges
   - Each flag: severity badge, title, description, suggested action
   - Status buttons: acknowledge / investigate / dismiss / resolve

   **Research Recommendations** (placeholder — populated in Phase E)
   - List of ResearchStep items with checkboxes

   **Conjecture Tracker**
   - User can add hypotheses with confidence %, supporting/contradicting evidence, linked sources
   - Status: open / confirmed / disproven

   **Proof Ladder** (for any ancestor reachable from tree root)
   - Visual chain: root → ... → this person
   - Per-link confidence badge
   - Weakest link highlighted red
   - "Safe to share" text auto-generated from weakest link

**Test:** Click Lady Jean Stewart → verify: Tier 1, Scots Peerage source shown, no flags. Click Alpin mac Eochaid → verify: Tier 4, chronological flag shown, suggested action. Click Lt. Col. John Smith/Smyth → verify: parallel paths displayed (step-connection vs. biological unknown).

---

### Phase E — Research Engine + AI Validation
**Milestone:** Rule-based recommendations on import; "Ask AI" button works; global priority list generated
**Estimated effort:** 1–2 sessions

1. **Rule-based recommender** (`research-recommender.ts`)
   - Fires on import for every person/edge
   - Lookup table: era + location + what's missing → suggested sources

   | Era + Location | Suggested Sources |
   |---|---|
   | US 1790–present | US Census (FamilySearch), FindAGrave, Ancestry |
   | Colonial America 1700–1790 | Colonial court records, land grants, church registers |
   | Scotland pre-1700 | NRS, OPR, ScotlandsPeople |
   | England pre-1700 | TNA, parish registers, Complete Peerage |
   | Ireland any era | IrishGenealogy.ie, church registers, Griffith's Valuation |
   | Germany any era | Archion, local church books, Meyers Gazetteer |
   | Military (any era) | NARA pension files, service records, muster rolls |
   | Medieval Europe | Scots Peerage, Complete Peerage, WikiTree, The Peerage |

   - Edge-specific recommendations when the link is the weak point
   - Impact scoring: how many downstream people does this connection affect?

2. **AI validation client** (`ai-client.ts`)
   - User provides Anthropic API key (stored in localStorage, never transmitted elsewhere)
   - API key setup UI with test button

3. **Single-person "Ask AI"**
   - Button in person detail panel
   - Sends to Claude Sonnet: person name, dates, places, current tier, sources, parent/child context, flags
   - Prompt asks: "Is this person historically plausible? What sources would confirm or deny? Suggest a confidence tier."
   - Response parsed into: `aiValidation { summary, suggestedTier, historicalNotes, sourceSuggestions[] }`
   - Displayed in person detail panel

4. **Batch validation**
   - User selects scope: all flagged, all Tier 3–4, specific branch, whole tree
   - **Cost estimation dialog:** "This will validate ~N people. Estimated cost: ~$X.XX. Proceed?"
   - Rate limiting: max 5 concurrent calls, configurable delay
   - Progress bar during batch run
   - Results cached per-person with timestamp; won't re-validate unless user requests

5. **Global priority action list**
   - After batch validation (or incrementally after individual validations):
   - AI generates a ranked list of highest-impact research actions
   - Displayed as a dedicated "Research Priorities" view
   - Each item: description, affected person, impact level, suggested source, link to person detail

**Test:** Verify rule-based recommendations fire for Thomas McKenzie (NC colonial land grants), Rob Roy (Highland Clan MacGregor records), Jacques Fontaine (Huguenot Society). Verify "Ask AI" returns plausible analysis. Verify batch estimation dialog shows correct count and cost.

---

### Phase F — Persistence + Export + Polish
**Milestone:** Full save/load cycle, GEDCOM and JSON export, production-ready UI
**Estimated effort:** 1–2 sessions

1. **IndexedDB persistence** (`indexeddb-store.ts`)
   - Save full workspace: graph + sources + flags + research steps + conjectures + settings
   - Auto-save on significant changes (debounced, every 30 seconds of activity)
   - Load on app start: hydrate in-memory graph from IndexedDB
   - Multiple workspace support (future-ready): workspace ID, name, last modified

2. **Export: GenieLogical JSON**
   - Full-fidelity dump: everything in the workspace
   - Used for backup and cross-device transfer

3. **Export: GEDCOM 5.5.1**
   - Map internal Person/Edge/Source back to GEDCOM records
   - Parallel paths: export child in multiple FAM records + custom `_GL_PARALLEL_GROUP` and `_GL_IS_PRIMARY` tags (ignored by other software, preserved on re-import)
   - Confidence metadata: `_GL_CONFIDENCE_TIER`, `_GL_STATUS` custom tags
   - Export dialog: explains what's preserved and what's lossy
   - Validate output: re-import the exported file and diff against original

4. **Export: Health report**
   - Markdown format: summary stats + all issues grouped by category
   - JSON format: machine-readable

5. **Import: GenieLogical JSON**
   - Reload full workspace state

6. **UI polish**
   - Dark heritage theme fully applied (all colors, typography from design system)
   - Responsive refinements (desktop-first but not broken on tablet)
   - Keyboard navigation: arrow keys in tree, Escape to close panels
   - Loading states, error boundaries, empty states
   - Settings panel: API key management, theme preferences, default view

7. **Static HTML export** (read-only sharing scaffold)
   - Export a subtree or path as a self-contained HTML file
   - Similar to the Charlemagne app: navigable, styled, includes confidence indicators
   - User can publish anywhere (Netlify, GitHub Pages, etc.)

**Test:** Full round-trip: import GEDCOM → analyze → make changes (add sources, change status, add conjectures) → save → reload → verify all state preserved. Export GEDCOM → re-import → diff. Export JSON → re-import → verify identical state.

---

## Phase Sequencing Summary

| Phase | Milestone | Key Deliverable | Depends On |
|---|---|---|---|
| **A** | Parse + see data | GEDCOM parser, data model, basic person list | — |
| **B** | Analyze + see issues | Flag engine, confidence scorer, health dashboard | A |
| **C** | Navigate the tree | Interactive D3 pedigree with visual encoding | A |
| **D** | Inspect any person | Full detail panel with sources, flags, status controls | A, B, C |
| **E** | Get research guidance | Rule-based + AI recommendations, batch validation | A, B, D |
| **F** | Save, export, share | IndexedDB persistence, GEDCOM/JSON export, polish | All above |

**Note:** Phases B and C can be built in parallel — B is engine work, C is visualization work, and both only depend on A. Phases D and E are sequential (D provides the UI surface that E populates).

---

## Decisions Incorporated from Review

| # | Issue | Resolution |
|---|---|---|
| R1 | Undefined types (Source, Flag, etc.) | Fully defined above. `evidenceVault` eliminated; everything is a `Source` with `origin` and `sourceType` fields |
| R2 | Confidence scoring algorithm undefined | Concrete algorithm specified: ceiling-based, source-class-driven, with era adjustment and flag penalties |
| R3 | GEDCOM 7 scope | Deferred to Phase 1b. Phase 1 handles 5.5 and 5.5.1 only |
| R4 | In-memory vs. IndexedDB queries | All runtime operations use in-memory `Map` structures. IndexedDB is save/load only |
| R5 | AI cost management | User-provided API key. Cost estimation dialog before batch operations. Results cached. Max 5 concurrent calls |
| R6 | Export fidelity for parallel paths | Use `_GL_*` custom tags in GEDCOM export. Lossy but preserved on round-trip through GenieLogical. Export dialog explains |
| R7 | Source classification drives scoring | `sourceClass` (primary/secondary/tertiary/derivative) is the main input to the confidence algorithm, not `sourceType` |
| R8 | Ceiling-based scoring | Multiple secondary sources cannot reach Tier 1. At least one primary source required. Honest and gives clear targets |
| R9 | Era adjustment caps | Pre-1500: max Tier 2. Pre-800: max Tier 3. Prevents medieval connections from appearing over-confident |
| R10 | GEDCOM-imported sources default classification | All GEDCOM-imported sources default to `sourceClass: "tertiary"` — user must upgrade. Conservative but honest |

---

## What's NOT in Phase 1

Explicitly deferred (from v3 plan §12–13):

- GEDCOM 7 import/export (Phase 1b)
- Notable ancestor auto-detection (Phase 2)
- Safe-to-say formatter (Phase 2)
- Advanced search + faceted filtering (Phase 2)
- Lineage path visualizer (Phase 2)
- Multi-tree comparison (Phase 3)
- Alignment finder / merge tool (Phase 3)
- Collaborative editing (Phase 3)
- FamilySearch / FindAGrave API integration (Phase 3)
- Light mode theme (someday)
