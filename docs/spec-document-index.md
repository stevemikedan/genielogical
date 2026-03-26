# GenieLogical — Spec Document Index & Submission Guide

**Date:** March 26, 2026  
**Purpose:** Inventory of all planning/spec documents produced during the genealogical research sprint, with guidance on when and how to share each with Claude Code / Codex agents.

---

## Document Inventory

| # | Document | File | Scope | Phase |
|---|---|---|---|---|
| 1 | Feature Update: Phase E Additions | `feature-update-phase-e-additions.md` | Deep scanner, story paths, bridge detector, impact scorer | Phase E |
| 2 | AI Research Agent Architecture | `ai-research-agent-architecture.md` | Three-tier AI modes, web search, era context, prompts | Phase E |
| 3 | Research Assistant Chat Panel | `research-assistant-chat-spec.md` | Conversational research interface | Phase 2 |
| 4 | Ancestry Conflict Detection & Resolution | `ancestry-conflict-detection-spec.md` | Duplicate ancestry detection, echo duplicates, merge workflow | Phases B/D/E |
| 5 | Architecture Amendments | `architecture-amendments.md` | LLM provider abstraction + shared ancestor inheritance | Phase E |
| 6 | Advanced Visualization Modes | `visualization-modes-spec.md` | Fan chart, extended pedigree, lineage path, network map | Phases 2/3 |
| 7 | Data Model: Shared Dataset Assessment | `data-model-shared-dataset-assessment.md` | Multi-user readiness, identity hashing, provenance, privacy | Phases 2/3 |

---

## Already Shared with Claude Code

Documents 1, 2, 3, and 5 were previously shared and Claude Code is building from them (currently constructing the three-tier prompt system and AI client).

---

## Submission Plan

### Share NOW (before AI client phase completes)

**Document 5 — Architecture Amendments** should already be in Claude Code's context. If the LLM provider abstraction isn't being implemented, interrupt and ensure `ai-client.ts` codes against a `LLMProvider` interface, not directly against `@anthropic-ai/sdk`. This is the most time-sensitive item.

### Share NEXT (after current AI build batch completes)

**Document 4 — Ancestry Conflict Detection**

Framing message for Claude Code:
> "New spec: ancestry conflict detection. This adds detection of duplicate persons with conflicting parent chains — a common GEDCOM corruption from Ancestry hint-acceptance. Three layers: (1) enhanced duplicate detector that compares upstream ancestry for each duplicate pair, (2) convergence scanner that finds the same person reached via different paths with different intermediaries, (3) echo duplicate detector for the same person appearing at different generation depths. Also includes a ConflictResolutionSection component for the person detail panel and a RESOLVE_ANCESTRY_CONFLICT reducer action. The detection engine enhancements go in src/engine/. The UI goes in src/components/person-detail/. Read the full spec for flag types, merge logic, and AI-assisted resolution prompt."

### Share for Phase 2 Planning

**Document 6 — Visualization Modes**

Framing message:
> "Phase 2 visualization spec. Five view modes: fan chart (radial ancestor view with semantic zoom), extended pedigree (existing horizontal view + collateral relative stacking), lineage path (vertical single-path chain), and network map (force-directed relationship constellation). Fan chart, extended pedigree, and lineage path are Phase 2. Network map is Phase 3. All views share the same graph data source, person detail panel, and confidence color system. Start with lineage path (simplest), then fan chart, then extended pedigree."

**Document 7 — Shared Dataset Assessment**

Framing message:
> "Data model prep for future multi-user shared datasets. No backend work needed now — this identifies additive field changes to make the single-user data model migration-ready. Specifically: (1) add identityHash to Person for future cross-tree matching, (2) add assertedBy/assertedAt to Edge for provenance tracking, (3) add sourceHash to Source for dedup, (4) add privacyLevel to Person with living-person defaults. These are all backward-compatible additions that improve the single-user app (better duplicate detection, dedup awareness) while preparing for Phase 3 sharing features."

---

## Documents NOT for Claude Code

The following were produced during research and are reference material, not implementation specs:

| Document | Purpose | Location |
|---|---|---|
| GEDCOM Deep Scan Report | Analysis of Steve's specific tree — branch stats, notable ancestors, research priorities | `gedcom_deep_scan_report.md` |
| Gibson/Black/Carroll Research Report | Verification research on specific ancestral lines | `gibson_black_carroll_research_report.md` |

These inform the app's design but contain personal genealogical data that shouldn't be in the codebase.

---

## Recommended `docs/` Folder Structure

```
docs/
├── implementation-plan.md          # Master plan (existing, update with amendments)
├── ai-research-agent-architecture.md
├── research-assistant-chat-spec.md
├── ancestry-conflict-detection-spec.md
├── architecture-amendments.md
├── feature-update-phase-e-additions.md
├── visualization-modes-spec.md
├── data-model-shared-dataset-assessment.md
└── research/                       # Personal research (gitignored)
    ├── gedcom-deep-scan-report.md
    └── gibson-black-carroll-research-report.md
```

Add to `.gitignore`:
```
docs/research/
```
