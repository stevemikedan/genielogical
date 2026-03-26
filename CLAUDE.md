# GenieLogical

Genealogy app that helps you trust your tree. Parses GEDCOM files, visualizes ancestry with confidence-colored edges, surfaces problems, uses AI to validate connections and recommend research steps.

**Owner:** Steve Daniel · En Dash Consulting
**License:** Open source (future freemium/paid)

## Quick Start

```bash
npm install
npm run dev      # Vite dev server
npm test         # Vitest
npm run build    # TypeScript check + Vite build
```

## Architecture Overview

- **Client-side only.** No backend. Static hosting (Netlify/GitHub Pages/Cloudflare).
- **In-memory graph.** On GEDCOM import, the entire tree loads into `Map<string, Person>` + `Map<string, Edge>`. All UI and analysis operates against the in-memory graph. IndexedDB is the save/load persistence layer, NOT the query layer.
- **AI is opt-in.** Claude API (Sonnet) for validation and research recommendations. User provides their own Anthropic API key (stored in localStorage). Cost estimation dialog before batch operations.

## Key Design Decisions

1. **Confidence is ceiling-based.** Multiple secondary sources cannot promote to Tier 1. You need at least one primary source. This is intentional — gives users a clear target.
2. **GEDCOM 5.5 and 5.5.1 only for now.** GEDCOM 7 is deferred. Covers ~95% of real-world exports.
3. **`sourceClass` drives scoring, not `sourceType`.** The confidence algorithm keys on primary/secondary/tertiary/derivative classification. The granular sourceType (census, vital_record, etc.) is for research recommendations and UI.
4. **No separate Evidence type.** The v3 plan had `evidenceVault` — this was folded into `Source` with `origin` and `sourceType` fields. One fewer concept for users.
5. **GEDCOM-imported sources default to `sourceClass: "tertiary"`.** Conservative. User must upgrade classification manually. Honest default.
6. **Rejected nodes collapse, don't delete.** Upstream paths remain visible so disconnected branches aren't lost.
7. **Parallel paths for disputed parentage.** A child can have edges to multiple candidate parents, grouped by `parallelGroupId`. One edge is `isPrimary`. Tree re-renders when switching.
8. **Era adjustment in confidence scoring.** Pre-1500: max Tier 2. Pre-800: max Tier 3. Prevents medieval connections from appearing over-confident.

## Tech Stack

| Component | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | React 18+ |
| Build | Vite |
| Styling | Tailwind CSS v4 (via @tailwindcss/vite plugin) + CSS custom properties |
| Tree rendering | D3.js (d3-hierarchy) — horizontal pedigree |
| Storage | IndexedDB via `idb` |
| State management | React Context + useReducer |
| AI | `@anthropic-ai/sdk` (Claude Sonnet 4) |
| Testing | Vitest + React Testing Library |

## Design System

### Typography
- **Person names / headings:** EB Garamond (serif)
- **Brand / decorative headers:** Cinzel
- **Body / UI / labels:** Source Sans 3 (sans-serif)
- **Data / GEDCOM IDs / source refs:** JetBrains Mono (mono)

### Theme
Dark heritage theme. All color tokens are defined as CSS custom properties in `src/theme.css` and registered as Tailwind theme values. Use Tailwind classes like `bg-surface`, `text-text-primary`, `border-border`, `text-gold`, `bg-tier1-bg`, etc.

### Confidence Tiers
| Tier | Label | Color | Edge Style |
|---|---|---|---|
| 1 | Documented | Green (`tier1`) | Solid |
| 2 | Supported | Blue (`tier2`) | Solid |
| 3 | Provisional | Amber (`tier3`) | Dashed |
| 4 | Unverified / Speculative | Red (`tier4`) | Dotted |

Tier 4 has contextual labels: "Unverified" (default, unsourced+flagged) or "Speculative" (chronological impossibility). See `src/types/tier-labels.ts` for shared constants.

### Node Status
| Status | Icon | Behavior |
|---|---|---|
| tentative | ○ | Default state |
| under_review | ◐ | Highlighted |
| validated | ● | Confident |
| disputed | ⚠ | Flagged |
| rejected | ✕ | Collapsed by default, expandable |

## Project Structure

```
src/
├── types/           # All TypeScript interfaces (Person, Edge, Source, Flag, etc.)
├── parser/          # GEDCOM parsing, date/place normalization
├── graph/           # In-memory graph structure, traversal, path finding
├── engine/          # Flag engine, confidence scorer, duplicate detector, bridge detector, story paths, deep scanner, impact scorer
├── ai/              # Claude API client, validation prompts, batch validator
├── storage/         # IndexedDB persistence, GEDCOM export, JSON export/import
├── components/      # React UI organized by feature area
│   ├── layout/
│   ├── tree/        # D3 tree navigator
│   ├── person-detail/
│   ├── health-dashboard/
│   ├── research/
│   └── shared/
├── hooks/
├── context/
├── theme.css        # Tailwind + CSS custom properties + font imports
└── App.tsx
```

## Implementation Phases

See `docs/implementation-plan.md` for the full plan. Summary:

- **Phase A:** GEDCOM parser + data model + in-memory graph + basic import UI
- **Phase B:** Flag engine + confidence scorer + health dashboard (can parallel with C)
- **Phase C:** D3 tree navigator with visual encoding (can parallel with B)
- **Phase D:** Person detail panel
- **Phase E:** Research engine + AI validation
- **Phase F:** Persistence + export + polish

## Test Data

Steve's GEDCOM (`daniel Family Tree.ged`) has 3,348 individuals, 1,956 families, 19 generations (~1459–present). Known issues that the app should catch:
- Alpin mac Eochaid: birth date "1500" is ~700 years wrong (9th century)
- "King of Norway" appended to name fields with no sourcing
- Duplicate entries under variant spellings
- <0.5% source coverage
- Rob Roy connection: plausible but no primary source bridge
- Lt. Col. John Smith/Smyth: step-connection to Pocahontas's granddaughter (parallel path case)
- Robert Stewart illegitimate line: documented but needs legitimacy metadata

## Conventions

- Use `@/` path alias for imports from `src/` (configured in tsconfig and vite)
- All types in `src/types/` — one file per major entity
- Engine functions are pure (take graph data in, return results) — no side effects, easy to test
- Components use Tailwind classes referencing theme tokens, not raw hex values
- Test files adjacent to source: `foo.ts` → `foo.test.ts`; or in `src/test/` for integration tests
