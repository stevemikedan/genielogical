# GenieLogical — Advanced Visualization Modes

**Date:** March 26, 2026  
**Phase:** Phase 2 (Views 2-3), Phase 3 (Views 4-5)  
**Depends on:** Phase C (D3 tree navigator), Phase D (person detail panel)  
**Goal:** Five distinct view modes that serve different research tasks, from big-picture overview to focused relationship mapping.

---

## Current State (Phase C)

The app ships with one view: **horizontal pedigree** (ancestor chart). D3-hierarchy layout, direct ancestors only, confidence-colored edges, pan/zoom, node click opens person detail. This is View 1 and remains the default.

**What it can't show:**
- Siblings, aunts, uncles, cousins (collateral relatives)
- The full shape of the tree (which branches are deep vs. shallow)
- A single lineage path in isolation (for storytelling/sharing)
- How a specific person connects to everyone around them (family unit context)
- Descendant charts (from an ancestor downward)

Each missing capability maps to a new view mode.

---

## View Architecture

All views share:
- The same in-memory `TreeGraph` data source
- The same person detail panel (click any node → panel opens)
- The same confidence color system (Tier 1-4 colors, edge styles)
- The same flag/status badge system
- The same "notable ancestor" gold highlight

Views differ in:
- Layout algorithm
- What subset of the graph they render
- Interaction patterns (zoom behavior, expand/collapse semantics)
- Information density and labeling strategy

### Shared Infrastructure

```typescript
// src/components/tree/view-types.ts

export type ViewMode = 
  | "pedigree"          // View 1: existing horizontal ancestor chart
  | "fan"               // View 2: radial/semicircle ancestor chart
  | "pedigree_extended" // View 3: pedigree + collateral relatives
  | "lineage_path"      // View 4: vertical single-path chain
  | "network"           // View 5: relationship constellation map
  ;

// All views implement this interface for consistent integration
export interface TreeView {
  mode: ViewMode;
  rootPersonId: string;        // Who is the "subject" of this view
  targetPersonId?: string;     // For lineage_path: who are we tracing to?
  
  // What data does this view need from the graph?
  getRequiredPersonIds(graph: TreeGraph): string[];
  
  // Render configuration
  config: ViewConfig;
}

export interface ViewConfig {
  maxGenerations: number;          // How deep to render
  showCollaterals: boolean;        // Show siblings of direct ancestors
  collateralDepth: number;         // 0=siblings only, 1=+spouses, 2=+children
  showConfidenceColors: boolean;
  showFlags: boolean;
  showNotableHighlights: boolean;
  labelDensity: "minimal" | "standard" | "detailed";
}
```

### View Selector UI

A toolbar control that switches between available views:

```
┌──────────────────────────────────────────────────┐
│ [🌳 Pedigree] [🌀 Fan] [👥 Extended] [📏 Path] [🕸 Network] │
│                                                    │
│ Root: steven daniel ▾    Generations: [8] ▾        │
│ □ Show collaterals  □ Show confidence  □ Show flags│
└──────────────────────────────────────────────────┘
```

---

## View 2: Fan Chart (Radial Ancestor Chart)

### Purpose
Big-picture overview: see the full shape of your ancestry at a glance. Which branches are deep? Which are shallow? Where are the gaps?

### Layout
- Subject at the center (bottom of semicircle or center of full circle)
- Each generation is a concentric ring radiating outward
- Each ancestor occupies a wedge proportional to `1 / 2^generation`
- Generation 1 (parents): two 90° wedges
- Generation 2 (grandparents): four 45° wedges
- Generation 3: eight 22.5° wedges
- And so on

### D3 Implementation

```typescript
// Uses d3.arc() for wedge geometry
// d3-hierarchy with custom radial layout

interface FanNode {
  personId: string;
  generation: number;
  startAngle: number;   // In radians
  endAngle: number;
  innerRadius: number;  // Based on generation
  outerRadius: number;
}

// Ring width decreases with generation (outer rings are thinner)
function ringRadius(gen: number, maxGen: number, totalRadius: number): [number, number] {
  // Log scale so inner rings are wider (more readable)
  const inner = totalRadius * Math.log(gen + 1) / Math.log(maxGen + 2);
  const outer = totalRadius * Math.log(gen + 2) / Math.log(maxGen + 2);
  return [inner, outer];
}
```

### Visual Encoding

- **Wedge fill color:** Confidence tier of the edge connecting this person to their child
  - Tier 1 (green): solid fill
  - Tier 2 (blue): solid fill
  - Tier 3 (amber): hatched or lighter fill
  - Tier 4 (red): dotted pattern or very light fill
- **Empty wedge:** Where the tree has a gap (unknown parent), the wedge is dark/transparent — visually obvious holes in the fan
- **Notable ancestor:** Gold border on wedge
- **Flag indicator:** Small warning triangle in corner of wedge

### Semantic Zoom (Critical for Usability)

At different zoom levels, different information is visible:

| Zoom Level | What's Shown |
|---|---|
| **Overview** (full fan visible) | Colored wedges only. No text. Shape of tree visible. |
| **Medium** (4-6 generations visible) | Name in each wedge. Generation numbers on rings. |
| **Close** (2-3 generations visible) | Name + dates + confidence badge. Click to open detail. |
| **Detail** (1-2 generations) | Full person card in each wedge. Sources count. Flag icons. |

This is implemented via D3 zoom transform — at each zoom level, check the pixel width of wedges and render accordingly.

### Interaction

- **Click wedge:** Open person detail panel
- **Double-click wedge:** Re-center fan on that person (they become the new root)
- **Scroll:** Zoom in/out
- **Hover:** Tooltip with name, dates, tier
- **Right-click / long-press:** Context menu (open detail, recenter, expand branch, mark as focus)

### Handling Depth Asymmetry

Unlike Ancestry's fixed 5-generation fan, our fan should handle trees where one branch goes 40 generations deep and another stops at 4. Solutions:

- **Collapsed branches:** When a branch terminates (no parents known), the wedge stops. The angular space is NOT redistributed — the gap is visible, showing where research is needed.
- **Deep branches:** Wedges beyond a configurable max generation (default: 10) collapse into a gradient fade with a depth indicator: "→ 34 more generations"
- **Expand on demand:** Click a collapsed deep branch to expand it, re-rendering the fan with more rings for that sector

### Comparison with Ancestry

| Feature | Ancestry Fan | GenieLogical Fan |
|---|---|---|
| Max depth | 5 generations fixed | Configurable, default 10, expandable |
| Color meaning | Alternating pastels (decorative) | Confidence tier (informative) |
| Gaps | Hidden (no empty wedges) | Visible as dark empty wedges |
| Zoom | None | Semantic zoom with progressive detail |
| Interaction | Click to recenter | Click, recenter, context menu |
| Notable ancestors | Not shown | Gold border highlight |
| Flags/issues | Not shown | Warning triangles on wedges |

---

## View 3: Extended Pedigree (Collateral Relatives)

### Purpose
The research view. Shows direct ancestors with their siblings visible behind them — because siblings are the key to corroboration, naming patterns, DNA matching, and discovering notable collateral relatives.

### Layout
Same horizontal pedigree as View 1, but each node has a "depth stack" showing siblings.

### The Stacking Model

Each direct-ancestor node becomes a **card stack**:

```
Standard node (View 1):
┌──────────────────────┐
│ Rev. Samuel Gibson    │
│ 1794-1878  ● Tier 2  │
└──────────────────────┘

Extended node (View 3):
       ┌──────────────────┐
      ┌┤ Mary Gibson       │ ← Sibling (back card)
     ┌┤│ b. 1802           │
    ┌┤└┤──────────────────┘
   ┌┤│┌┴──────────────────┐
   ││││ James Gibson       │ ← Sibling
   │└┤│ b. 1798           │
   │ └┤──────────────────┘
   │ ┌┴───────────────────┐
   │ │ Rev. Samuel Gibson  │ ← Direct ancestor (front card)
   │ │ 1794-1878  ● Tier 2│
   └─┤                    │
     └────────────────────┘
```

### Stack Rendering

```typescript
interface StackedNode {
  directAncestor: Person;       // The front card (always visible)
  siblings: Person[];            // Back cards (stacked behind)
  siblingCount: number;          // Total sibling count
  hasNotableCollateral: boolean; // Any sibling or sibling's descendant is notable
  stackDepth: number;            // Visual offset depth (capped at 4 for rendering)
}
```

Visual rules:
- **Front card:** Full rendering (name, dates, tier badge, flag icons)
- **Back cards:** Offset 4px right and 4px up per card. Show name only. Subtle border.
- **Stack cap:** Max 4 visible back cards regardless of actual sibling count. Beyond 4, show a count badge: "+3 more"
- **Notable collateral badge:** If any sibling or their descendants include a notable figure, the stack edge gets a gold accent with a tooltip: "VP John C. Calhoun is this person's nephew"

### Expand Interaction

Click the stack (not the front card) to expand siblings:

**Option A — Dropdown expansion:**
Siblings fan out vertically below the stack, showing names and dates. Click any sibling to open their person detail.

**Option B — Side panel:**
A mini-panel slides out showing all siblings with their vital data, spouses, and children. This is more useful for research but takes more screen space.

**Option C — Inline expansion:**
The stack unfolds horizontally, pushing the tree layout to accommodate. Most spatially disruptive but gives the clearest view.

**Recommendation:** Option A as default, Option B as "expanded view" toggle.

### Collateral Depth Settings

```typescript
interface CollateralConfig {
  depth: 0 | 1 | 2;
  // 0: Show siblings of direct ancestors only (names + dates)
  // 1: Show siblings + their spouses (adds marriage connections)  
  // 2: Show siblings + spouses + children (cousin mapping)
  
  highlightNotable: boolean;  // Gold edge on stacks with notable collaterals
  showCollateralFlags: boolean;  // Show flags on collateral individuals
}
```

Depth 2 (full cousin mapping) is expensive to render for large trees. Limit to the visible viewport and lazy-load collateral data as the user pans.

### Notable Collateral Discovery

This is where the magic happens. When `highlightNotable` is enabled, the app scans siblings and their descendants for notable figures and surfaces them:

```typescript
interface NotableCollateral {
  directAncestorId: string;      // The person in your direct line
  collateralPersonId: string;    // The notable person (not in your direct line)
  relationship: string;          // "brother" | "sister" | "nephew" | "niece" | "cousin"
  collateralName: string;
  significance: string;          // "Vice President of the United States"
  pathDescription: string;       // "brother's son" → "nephew"
}
```

These show as tooltip annotations on the stack:

```
  [+2 siblings] ★ "VP John C. Calhoun (nephew)"
  ┌────────────────────────┐
  │ James Caldwell Calhoun  │
  │ 1779-1850  ◐ Tier 2    │
  └────────────────────────┘
```

---

## View 4: Lineage Path (Vertical Chain)

### Purpose
Storytelling and sharing. Show a single path from the subject to a specific ancestor, with full detail at every step. This is the Charlemagne app's ChainView pattern, generalized.

### Layout
Vertical chain, top to bottom (subject at top, target ancestor at bottom). Each person is a full-width card with:
- Name, dates, role label ("4× great-grandfather")
- Confidence badge for the connecting edge
- Source citations (if any)
- Bridge zone highlighting
- "Shared with N other paths" indicator

### When to Show
- User clicks "View full path" on a Story Card (notable ancestor)
- User clicks "View proof ladder" in person detail (already spec'd in Phase D)
- User selects two people and chooses "Show path between"

### Differs from Proof Ladder
The proof ladder (Phase D) is a compact section within the person detail panel. The lineage path view is a full-screen dedicated view with richer detail per node and the ability to scroll through 40+ generations. It's the proof ladder expanded into a view mode.

### Export
This view is the basis for the "Static HTML export" feature (Phase F). The rendered path can be exported as a self-contained HTML file for publishing.

---

## View 5: Network Map (Relationship Constellation)

### Purpose
Understand a specific family unit and how it connects to the broader tree. Center on one person, see all their connections radiating outward. Good for: understanding in-law relationships, seeing where DNA matches might come from, visualizing how distant relatives connect.

### Layout
Force-directed graph (D3 force simulation) with:
- Selected person at center
- Parents above
- Children below
- Siblings to the sides
- Spouses adjacent
- In-laws one step further out
- Configurable depth: 1 hop (immediate family), 2 hops (extended), 3 hops (neighborhood)

### This is NOT a Tree Layout
Force-directed layout handles the loops and shared connections that tree layouts can't: a person who is both your 3rd cousin through one branch and your 5th cousin through another; two siblings who married two siblings from another family; any endogamy. Trees force a single-path rendering. Networks show the full topology.

### Node Rendering

```typescript
interface NetworkNode {
  personId: string;
  name: string;
  relationship: string;         // Computed label: "mother", "uncle", "2nd cousin 1× removed"
  hopsFromCenter: number;       // 1, 2, or 3
  connectionType: "blood" | "marriage" | "step" | "adoptive";
  isDirectAncestor: boolean;    // In the subject's direct line?
  isNotable: boolean;
}
```

Visual encoding:
- **Blood relatives:** Solid edges
- **Marriage connections:** Dashed edges
- **Step/adoptive:** Dotted edges
- **Direct ancestors:** Brighter/larger nodes
- **Collateral relatives:** Smaller, more transparent
- **Notable figures:** Gold border
- **Confidence:** Edge color follows the tier system

### Interaction
- **Drag nodes** to rearrange (force simulation allows manual positioning)
- **Click node** to open person detail OR to recenter the network on that person
- **Scroll** to zoom
- **Hop depth slider:** 1-3 hops, dynamically adds/removes nodes
- **Filter toggles:** Show/hide blood, marriage, step connections

### Relationship Label Computation

The network view needs to compute relationship labels dynamically:

```typescript
function computeRelationship(
  graph: TreeGraph,
  fromId: string,   // Center person
  toId: string      // Connected person
): string {
  // Uses the existing path finder + relationship classification
  // Returns: "mother", "paternal grandfather", "maternal aunt",
  //          "1st cousin", "2nd cousin 1× removed",
  //          "wife", "brother-in-law", "step-father", etc.
}
```

This is a well-known algorithm (common ancestor method) but needs to handle:
- Half-siblings (shared one parent, not both)
- Step-relationships (through marriage, not blood)
- In-law relationships (spouse's relatives)
- Removed cousins (different generation from common ancestor)

### Multi-User Future: Network Merge Preview

When the app eventually supports shared datasets (see data model assessment doc), the network view becomes the natural interface for showing where two users' trees overlap. Two users' networks rendered together, with shared nodes highlighted — instant discovery of how they're related.

---

## Data Requirements Per View

| View | Data Needed | Graph Traversal | Render Complexity |
|---|---|---|---|
| Pedigree (V1) | Direct ancestors of root | `getAncestors(rootId, maxGen)` | O(2^maxGen) nodes |
| Fan (V2) | Direct ancestors of root | Same as V1 | O(2^maxGen) arcs |
| Extended (V3) | Direct ancestors + their siblings + optional spouse/children | `getAncestors` + `getSiblings` per node | O(2^maxGen × avgSiblingCount) |
| Lineage Path (V4) | Single path between two people | `findPath(fromId, toId)` | O(pathLength) |
| Network (V5) | All people within N hops of center | BFS from center, N levels | O(branchingFactor^N) |

View 3 and View 5 can get expensive for large trees. Implement viewport culling — only render nodes that are currently visible, load more on pan/zoom.

---

## Phase Placement

| View | Phase | Rationale |
|---|---|---|
| V1 Pedigree | ✅ Phase C (done) | Core navigation |
| V2 Fan Chart | Phase 2 | New D3 layout, moderate complexity |
| V3 Extended Pedigree | Phase 2 | Modifies existing V1 layout, needs collateral data loading |
| V4 Lineage Path | Phase 2 | Simple layout, builds on proof ladder (Phase D) |
| V5 Network Map | Phase 3 | Force-directed layout, relationship computation, most complex |

### Phase 2 Implementation Order

1. **V4 Lineage Path** — Simplest new view. Extends proof ladder to full-screen. Good warm-up.
2. **V2 Fan Chart** — Independent D3 layout. Can be built in parallel with V3.
3. **V3 Extended Pedigree** — Modifies existing V1. Needs collateral data loading + stacking logic.

### Phase 3
4. **V5 Network Map** — Force-directed layout. Relationship computation engine. Multi-hop traversal. Most architecturally distinct from the tree-based views.

---

## New Files

| File | Phase | Purpose |
|---|---|---|
| `src/components/tree/view-types.ts` | Phase 2 | Shared view interfaces and types |
| `src/components/tree/ViewSelector.tsx` | Phase 2 | Toolbar for switching views |
| `src/components/tree/FanChart.tsx` | Phase 2 | Fan chart D3 component |
| `src/components/tree/FanNode.tsx` | Phase 2 | Individual wedge rendering |
| `src/components/tree/ExtendedPedigree.tsx` | Phase 2 | Extended pedigree with collateral stacks |
| `src/components/tree/CollateralStack.tsx` | Phase 2 | Stacked sibling card component |
| `src/components/tree/LineagePath.tsx` | Phase 2 | Vertical chain view |
| `src/components/tree/NetworkMap.tsx` | Phase 3 | Force-directed network view |
| `src/components/tree/NetworkNode.tsx` | Phase 3 | Network node rendering |
| `src/graph/relationship-calculator.ts` | Phase 3 | Compute relationship labels (cousin, uncle, etc.) |
| `src/graph/relationship-calculator.test.ts` | Phase 3 | Tests |
| `src/graph/collateral-loader.ts` | Phase 2 | Load siblings + optional descendants for a set of people |
| `src/engine/notable-collateral-detector.ts` | Phase 2 | Find notable figures among collateral relatives |

### Modified Files

| File | Changes |
|---|---|
| `src/App.tsx` | Add view mode state, render ViewSelector, switch between view components |
| `src/graph/tree-graph.ts` | Add `getSiblings(id)` if not already present, add `getNeighborhood(id, hops)` for network view |
| `src/engine/story-paths.ts` | Extend notable detection to include collateral relatives (not just direct ancestors) |
