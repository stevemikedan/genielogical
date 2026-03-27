# GenieLogical — Conflicting Ancestry Detection & Resolution

**Date:** March 26, 2026
**Scope:** Enhancements to Phase B (flag engine / duplicate detector), Phase D (resolution UI), and Phase E (AI-assisted resolution)
**Priority:** High — this is a data integrity issue that silently corrupts trees

---

## The Problem

When a GEDCOM is exported from Ancestry (or any platform that accepts "hints" from other users' trees), a common corruption pattern occurs:

1. Person X exists in the tree as a direct ancestor
2. The user accepts a hint that adds Person X's parents (Father-A + Mother-A)
3. Later, through a different branch of the tree, Person X appears again — but this time with different parents (Father-B + Mother-B) from a different hint source
4. The GEDCOM now contains **two INDI records** for the same real person, each with different upstream ancestry
5. Both entries may have descendants that connect back to the tree subject through different paths

The result: the tree silently contains contradictory claims about the same person's parentage. The user sees a consistent-looking tree in both branches and has no idea the conflict exists. Worse, one or both parent chains may be completely wrong — speculative Ancestry grafts that were accepted without verification.

This is different from:
- **Known parallel parentage** (the existing `parallelGroupId` system) — that's one INDI with multiple candidate parent edges, explicitly modeled
- **Simple duplicates** (the existing `DUP_NAME_DATE_MATCH` flag) — that catches name/date similarity but doesn't compare ancestry
- **Date impossibilities** (the existing `CHRONO_*` flags) — those catch broken dates but don't identify WHY there are two conflicting chains

---

## Detection Architecture

### Layer 1: Enhanced Duplicate Detection (Phase B — Flag Engine)

The existing duplicate detector uses name + date + location similarity to find potential duplicates. Enhance it with **ancestry comparison**:

```typescript
interface DuplicatePairAnalysis {
  personIdA: string;
  personIdB: string;
  
  // Existing similarity metrics
  nameSimilarity: number;      // 0-1 (Soundex + Levenshtein)
  dateSimilarity: number;      // 0-1 (year overlap)
  placeSimilarity: number;     // 0-1 (location match)
  
  // NEW: Ancestry comparison
  ancestryConflict: AncestryConflict | null;
  
  // Overall assessment
  duplicateProbability: number;  // 0-1
  hasConflictingAncestry: boolean;
}

interface AncestryConflict {
  // Who are the parents in each version?
  pathA: {
    fatherId: string | null;
    fatherName: string | null;
    motherId: string | null;
    motherName: string | null;
    grandparentCount: number;  // How deep does this chain go?
  };
  pathB: {
    fatherId: string | null;
    fatherName: string | null;
    motherId: string | null;
    motherName: string | null;
    grandparentCount: number;
  };
  
  // What specifically differs?
  conflictType: 
    | "different_parents"       // Completely different parent pairs
    | "different_father"        // Same mother, different father
    | "different_mother"        // Same father, different mother  
    | "additional_parents"      // One has parents, the other doesn't
    | "upstream_divergence"     // Same parents but THEIR parents differ
    ;
  
  // How much of the tree is affected?
  descendantsAffectedA: number;  // How many descendants trace through version A
  descendantsAffectedB: number;  // How many descendants trace through version B
  sharedDescendants: string[];   // People who appear in BOTH subtrees
  
  // Which version has better evidence?
  sourceCountA: number;
  sourceCountB: number;
  confidenceTierA: number;
  confidenceTierB: number;
}
```

### Detection Algorithm

```
STEP 1: Find duplicate candidates (existing)
  Run the existing DUP_NAME_DATE_MATCH detection.
  
STEP 2: For each duplicate pair, compare ancestry
  For personA and personB:
    parentsA = getParents(personA)
    parentsB = getParents(personB)
    
    if parentsA == parentsB:
      → Simple duplicate (same ancestry, just redundant entry)
      
    if parentsA != parentsB AND both have parents:
      → CONFLICTING ANCESTRY — critical flag
      
    if one has parents and the other doesn't:
      → Partial duplicate (one is more complete than the other)
      
    if parentsA == parentsB but grandparentsA != grandparentsB:
      → UPSTREAM DIVERGENCE — the conflict is one level higher
      Recurse upward until the divergence point is found.

STEP 3: Compute impact
  For each conflicting pair:
    Count descendants reachable through each version.
    Count shared descendants (people who appear in both subtrees).
    Count notable ancestors reachable through each version.
    
STEP 4: Generate flag
  Create a new flag type: ANCESTRY_CONFLICT
```

### New Flag Types

```typescript
// Add to flag engine rules:

// Critical: Same person has different parents in different tree entries
"ANCESTRY_CONFLICT_DIFFERENT_PARENTS"
// Severity: critical
// Description: "{Person} appears twice in the tree with different parents:
//   Version A: child of {Father-A} + {Mother-A} (via {path description})
//   Version B: child of {Father-B} + {Mother-B} (via {path description})
//   This affects {N} downstream ancestors. One or both parent chains may be incorrect."
// Suggested action: "Compare both parent chains. Use the AI research tool to verify
//   which parentage is supported by primary sources, then merge the entries."

// Warning: Same person's parents match but grandparents differ
"ANCESTRY_CONFLICT_UPSTREAM_DIVERGENCE"  
// Severity: warning
// Description: "{Person}'s parents are consistent across entries, but the ancestry
//   diverges at generation {N}: {Ancestor} has different parents in the two paths."

// Warning: One entry has parents, the other doesn't
"ANCESTRY_CONFLICT_PARTIAL"
// Severity: warning
// Description: "{Person} appears twice. One entry has parents ({Father} + {Mother}),
//   the other has no parents listed. These should likely be merged."

// Info: Identical duplicate (same ancestry, redundant entry)
"ANCESTRY_DUPLICATE_IDENTICAL"
// Severity: info
// Description: "{Person} has two identical entries in the tree. Safe to merge."
```

### Layer 2: Path Convergence Scanner (Phase B — New Engine)

Beyond simple duplicate detection, scan for a subtler problem: **convergence points where the same historical person is reached through different lineage paths, potentially with different intermediate ancestors.**

This catches cases where the person doesn't have two INDI records — instead, one INDI record is a child in two different FAM records, each with different parents. (The existing multi-FAM detection creates parallel paths for this, but doesn't flag it as a conflict.)

```typescript
function scanPathConvergence(
  graph: TreeGraph,
  subjectId: string
): ConvergencePoint[] {
  // BFS from subject, tracking all paths to each ancestor
  const pathsToAncestor: Map<string, string[][]> = new Map();
  // key = ancestor ID, value = array of paths (each path = array of person IDs)
  
  // For each ancestor reached by multiple paths:
  // Check if the intermediate ancestors are the same or different
  // If different: this is a convergence point with potential conflict
  
  // Also check: is this ancestor a child in multiple FAM records?
  // If yes: are the parents the same or different?
}

interface ConvergencePoint {
  ancestorId: string;
  ancestorName: string;
  paths: {
    pathIds: string[];          // Full path from subject to this ancestor
    intermediateAncestors: string[];  // Who's between subject and ancestor
    parentIds: [string | null, string | null];  // Parents per this path
    confidence: number;         // Weakest tier on this path
  }[];
  conflictDetected: boolean;    // Do the paths disagree about this person's ancestry?
  divergenceGeneration: number; // Where do the paths first disagree?
}
```

---

## Resolution Workflow

### Phase D: Conflict Resolution UI

When a person has an `ANCESTRY_CONFLICT_*` flag, the person detail panel shows a **Conflict Resolution section** (above the normal Parents section):

```
┌─────────────────────────────────────────────────────┐
│ ⚠ ANCESTRY CONFLICT                                 │
│                                                      │
│ This person appears twice in the tree with           │
│ different parent chains:                             │
│                                                      │
│ ┌─ Version A ──────────────────────────────────────┐ │
│ │ Parents: Joseph Gibson + Mary McRee              │ │
│ │ Via: Samuel Gibson → Happy Gibson → John Gibson  │ │
│ │ Sources: 2 (marriage record, census)             │ │
│ │ Confidence: Tier 2                               │ │
│ │ Upstream: reaches MacRae of Inverinate (13 gen)  │ │
│ │ [Keep this version]                              │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Version B ──────────────────────────────────────┐ │
│ │ Parents: Finlay McRae (b.1722) + Unknown         │ │
│ │ Via: Hugh I McRee → Mary Hannah McCree           │ │
│ │ Sources: 0                                       │ │
│ │ Confidence: Tier 4 (impossible date flagged)     │ │
│ │ Upstream: reaches MacRae of Inverinate (14 gen)  │ │
│ │ [Keep this version]                              │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [Merge: keep A, discard B]                          │
│ [Merge: keep B, discard A]                          │
│ [Research both with AI]                             │
│ [Keep both as parallel paths]                       │
│ [Dismiss — I'll handle this later]                  │
└─────────────────────────────────────────────────────┘
```

### Resolution Options

**1. Merge: keep A, discard B**
- The winning version's parent edge becomes the canonical one
- The losing version's INDI record is merged into the winner (any unique data — sources, notes — is preserved)
- The losing version's parent edge is deleted
- All descendants of the losing entry are re-parented to the winning entry
- Ancestors upstream of the losing entry that are ONLY reachable through that entry are marked as "orphaned — no longer connected to subject" (not deleted, just disconnected)
- Confidence re-scored

**2. Merge: keep B, discard A**
- Same as above, reversed

**3. Research both with AI**
- Triggers Mode 3 (Deep Research) with task type `resolve_duplicate`
- The AI receives both versions with full context
- Searches for records that confirm one lineage and/or contradict the other
- Reports findings with "Version A supported by..." / "Version B contradicted by..."
- User makes final decision based on AI findings

**4. Keep both as parallel paths**
- Converts the two entries into a single INDI record with parallel parent edges
- Uses the existing `parallelGroupId` system
- Both paths remain visible, the user marks one as primary
- This is appropriate when there's genuine scholarly disagreement about parentage

**5. Dismiss**
- Marks the flag as dismissed
- No structural changes
- Flag can be re-opened later

### Merge Implementation

```typescript
interface MergeDecision {
  winnerPersonId: string;
  loserPersonId: string;
  action: "merge_keep_winner" | "convert_to_parallel";
  
  // What happens to the loser's unique data
  preserveLoserSources: boolean;    // Copy sources from loser to winner
  preserveLoserNotes: boolean;      // Copy notes from loser to winner
  
  // What happens to the loser's descendants
  reparentDescendants: boolean;     // Move loser's children to winner
  
  // What happens to the loser's upstream ancestry
  orphanUpstream: boolean;          // Disconnect loser's parents (they may still
                                    // be connected through other paths)
}

// New reducer action
"RESOLVE_ANCESTRY_CONFLICT" → {
  conflictFlagId: string;
  decision: MergeDecision;
}
```

---

## AI-Assisted Resolution (Phase E)

### Research Task Type

Add to the existing `ResearchTask` type:

```typescript
type ResearchTaskType = 
  // ... existing types ...
  | "resolve_ancestry_conflict"  // NEW: determine which of two parent chains is correct
  ;
```

### Prompt for Conflict Resolution

```
You are resolving a data conflict in a family tree. The same person appears 
with two different sets of parents. Your job is to determine which parentage 
is correct — or if both are wrong.

PERSON IN QUESTION:
  Name: {name}
  Birth: {birthDate} in {birthPlace}
  Death: {deathDate} in {deathPlace}

VERSION A — Parents:
  Father: {fatherA} ({datesA})
  Mother: {motherA} ({datesA})
  Sources attached: {sourcesA}
  Confidence: Tier {tierA}
  Upstream path: {upstreamSummaryA}
  
VERSION B — Parents:
  Father: {fatherB} ({datesB})
  Mother: {motherB} ({datesB})
  Sources attached: {sourcesB}
  Confidence: Tier {tierB}
  Upstream path: {upstreamSummaryB}

KNOWN ISSUES:
  {flagsSummary}

RESEARCH STRATEGY:
1. Search for records that name this person AND their parents together
   (census, will, probate, church register, pension application).
2. Search for each set of parents independently — do they exist in records?
3. Check date plausibility: are the parent birth dates compatible with this
   person's birth date?
4. Check geographic plausibility: were these families in the same location?
5. Search for published genealogies that cover this family.
6. If one version leads to a well-documented historical family and the other
   doesn't, note that — but document evidence, not genealogical prestige.

RESPOND WITH:
{
  "verdict": "version_a" | "version_b" | "neither" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentence explanation",
  "evidenceForA": [{ "description": "...", "url": "...", "weight": "strong|moderate|weak" }],
  "evidenceForB": [{ "description": "...", "url": "...", "weight": "strong|moderate|weak" }],
  "evidenceAgainstA": [{ "description": "...", "url": "...", "weight": "strong|moderate|weak" }],
  "evidenceAgainstB": [{ "description": "...", "url": "...", "weight": "strong|moderate|weak" }],
  "recommendation": "merge_keep_a" | "merge_keep_b" | "keep_as_parallel" | "needs_more_research",
  "nextStep": { "action": "...", "repository": "...", "impactIfFound": "..." }
}
```

---

## Full-Tree Ancestry Audit (Phase E — Batch Operation)

### Purpose

After import, run a comprehensive scan that goes beyond simple duplicate detection. This is the "full tree evaluation" Steve described — checking every person who appears on multiple paths for consistency.

### Algorithm

```typescript
async function runFullAncestryAudit(
  graph: TreeGraph,
  subjectId: string,
  aiClient: AIClient | null,   // null = rule-based only, no AI
  onProgress: (update: ProgressUpdate) => void
): Promise<AncestryAuditResult> {
  
  // Phase 1: Structural scan (no AI, fast)
  onProgress({ phase: "Scanning tree structure..." });
  
  // 1a. Find all duplicate candidates
  const duplicates = detectDuplicates(graph);
  
  // 1b. Compare ancestry for each duplicate pair
  const conflicts: AncestryConflict[] = [];
  for (const pair of duplicates) {
    const conflict = compareAncestry(graph, pair.personIdA, pair.personIdB);
    if (conflict) conflicts.push(conflict);
  }
  
  // 1c. Scan for convergence points (same person, multiple paths, different intermediaries)
  const convergences = scanPathConvergence(graph, subjectId);
  const convergenceConflicts = convergences.filter(c => c.conflictDetected);
  
  // 1d. Check for "echo" duplicates — same historical person entered
  //     with slightly different names at different points in the tree
  //     (e.g., "Alexander MacRae of Inverinate" and "Alexader MacRae of Inverinate")
  const echoMatches = detectEchoDuplicates(graph, subjectId);
  
  // Phase 2: AI-assisted evaluation (optional, costs money)
  let aiAssessments: Map<string, ConflictAssessment> | null = null;
  
  if (aiClient && conflicts.length > 0) {
    onProgress({ phase: `Evaluating ${conflicts.length} conflicts with AI...` });
    
    // Cost estimate
    const estimatedCost = conflicts.length * 0.02;  // ~$0.02 per conflict (Mode 2)
    
    // Only proceed if user approved
    aiAssessments = new Map();
    for (const conflict of conflicts) {
      const assessment = await aiClient.resolveConflict(conflict);
      aiAssessments.set(conflict.personIdA + "_" + conflict.personIdB, assessment);
    }
  }
  
  return {
    duplicatesFound: duplicates.length,
    ancestryConflicts: conflicts,
    convergenceConflicts,
    echoMatches,
    aiAssessments,
    
    // Summary
    summary: {
      totalConflicts: conflicts.length + convergenceConflicts.length,
      criticalConflicts: conflicts.filter(c => c.conflictType === "different_parents").length,
      autoResolvable: conflicts.filter(c => isAutoResolvable(c)).length,
      needsResearch: conflicts.filter(c => !isAutoResolvable(c)).length,
    }
  };
}

function isAutoResolvable(conflict: AncestryConflict): boolean {
  // A conflict is auto-resolvable if one version is clearly better:
  // - One version has sources, the other has none
  // - One version has an impossible date, the other doesn't
  // - One version has Tier 1-2, the other has Tier 4
  
  const tierDiff = Math.abs(conflict.confidenceTierA - conflict.confidenceTierB);
  const sourceDiff = Math.abs(conflict.sourceCountA - conflict.sourceCountB);
  
  if (tierDiff >= 2) return true;  // Clear quality difference
  if (conflict.sourceCountA > 0 && conflict.sourceCountB === 0) return true;
  if (conflict.sourceCountB > 0 && conflict.sourceCountA === 0) return true;
  
  return false;
}
```

### Echo Duplicate Detection

A specific sub-problem: the same historical person appears in different parts of the tree with slightly different names, entered independently from different hint sources. They don't trigger normal duplicate detection because they're in different generations or branches.

```typescript
function detectEchoDuplicates(
  graph: TreeGraph, 
  subjectId: string
): EchoDuplicate[] {
  // Get all ancestors with generation numbers
  const ancestors = getAllAncestorsWithGen(graph, subjectId);
  
  // Group by approximate identity: normalized name + birth decade
  const groups: Map<string, { personId: string; gen: number }[]> = new Map();
  
  for (const [personId, gen] of ancestors) {
    const person = graph.getPerson(personId);
    const key = normalizeForEchoMatch(person);
    // normalizeForEchoMatch: lowercase, strip titles, Soundex surname, 
    // round birth year to decade
    
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ personId, gen });
  }
  
  // Any group with 2+ entries at DIFFERENT generations is suspicious
  const echoes: EchoDuplicate[] = [];
  for (const [key, entries] of groups) {
    if (entries.length >= 2) {
      const gens = new Set(entries.map(e => e.gen));
      if (gens.size > 1) {
        // Same person appearing at different generation depths = likely echo
        echoes.push({
          normalizedKey: key,
          entries: entries.map(e => ({
            personId: e.personId,
            generation: e.gen,
            name: graph.getPerson(e.personId)!.displayName,
            parents: getParentNames(graph, e.personId)
          })),
          generationSpread: Math.max(...entries.map(e => e.gen)) - Math.min(...entries.map(e => e.gen)),
        });
      }
    }
  }
  
  return echoes;
}

interface EchoDuplicate {
  normalizedKey: string;
  entries: {
    personId: string;
    generation: number;
    name: string;
    parents: { fatherName: string | null; motherName: string | null };
  }[];
  generationSpread: number;  // How many generations apart the entries are
}
```

Example this catches: "Alexander MacRae of Inverinate" (b. 1614, Gen 13) and "Alexader MacRae of Inverinate" (b. 1611, Gen 14) — the same person entered twice with a typo and slightly different dates, appearing at different depths because one path goes through an extra intermediary.

---

## Health Dashboard Integration

### New Dashboard Card

Add an "Ancestry Conflicts" card to the health dashboard:

```
┌─────────────────────────────────────────┐
│ 🔀 ANCESTRY CONFLICTS        3 found   │
│                                         │
│ 1 critical: different parents           │
│ 1 warning: upstream divergence          │
│ 1 info: identical duplicate             │
│                                         │
│ [Run full ancestry audit]               │
│ [View all conflicts ↗]                  │
└─────────────────────────────────────────┘
```

### Conflict List View

Expandable section showing all detected conflicts:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Mary Hannah McCree (b. 1770)                 CRITICAL │
│   Version A: child of Finlay McRae + unknown            │
│   Version B: child of Hugh I McRee + unknown            │
│   Impact: affects 12 downstream ancestors               │
│   Auto-resolvable: Yes (Version B has impossible date)  │
│   [Resolve ↗] [Research with AI ↗]                      │
├─────────────────────────────────────────────────────────┤
│ ⚠ Alexander MacRae of Inverinate (b. 1611/1614) WARNING │
│   Two entries with same parents but different dates      │
│   Impact: affects 2 downstream paths                    │
│   Auto-resolvable: Yes (identical except dates)         │
│   [Merge ↗]                                             │
├─────────────────────────────────────────────────────────┤
│ ℹ John Stewart Gibson (b. 1819)                   INFO  │
│   Identical duplicate — safe to merge                   │
│   [Merge ↗]                                             │
└─────────────────────────────────────────────────────────┘
```

---

## Files Summary

### New Files

| File | Phase | Purpose |
|---|---|---|
| `src/engine/ancestry-conflict-detector.ts` | B (enhancement) | Compare ancestry for duplicate pairs, detect conflicts |
| `src/engine/ancestry-conflict-detector.test.ts` | B | Tests with fixture data including known conflicts |
| `src/engine/convergence-scanner.ts` | B (enhancement) | Scan for path convergence with divergent intermediaries |
| `src/engine/convergence-scanner.test.ts` | B | Tests |
| `src/engine/echo-duplicate-detector.ts` | B (enhancement) | Find same person at different generation depths |
| `src/engine/echo-duplicate-detector.test.ts` | B | Tests |
| `src/engine/ancestry-auditor.ts` | E | Full-tree ancestry audit orchestrator |
| `src/ai/prompts/system-conflict-resolution.ts` | E | AI prompt for resolving ancestry conflicts |
| `src/components/person-detail/ConflictResolutionSection.tsx` | D | Conflict comparison and resolution UI |
| `src/components/health-dashboard/AncestryConflictCard.tsx` | D | Dashboard summary card |
| `src/components/health-dashboard/ConflictListView.tsx` | D | Expandable conflict list |

### Modified Files

| File | Changes |
|---|---|
| `src/engine/duplicate-detector.ts` | Call ancestry-conflict-detector for each duplicate pair |
| `src/engine/flag-engine.ts` | Add `ANCESTRY_CONFLICT_*` flag rules |
| `src/types/flag.ts` | Add new flag categories |
| `src/types/person.ts` or new `src/types/conflict.ts` | Add `AncestryConflict`, `ConvergencePoint`, `EchoDuplicate`, `MergeDecision` types |
| `src/context/tree-state.ts` | Add `RESOLVE_ANCESTRY_CONFLICT` reducer action |
| `src/ai/prompts/user-templates.ts` | Add conflict resolution prompt builder |
| `src/components/person-detail/PersonDetailPanel.tsx` | Show ConflictResolutionSection when conflict flag exists |
| `src/components/health-dashboard/HealthDashboard.tsx` | Add AncestryConflictCard |

### Phase Placement

| Component | Phase | Rationale |
|---|---|---|
| Ancestry conflict detection (structural) | B enhancement | Pure engine work, no UI dependency. Should run on import alongside existing flags. |
| Echo duplicate detection | B enhancement | Same — pure engine, runs on import. |
| Convergence scanner | B enhancement | Same — depends only on graph traversal (Phase A). |
| Conflict resolution UI | D | Needs person detail panel to exist. Add as a section. |
| AI-assisted resolution | E | Needs AI client with web search. |
| Full-tree ancestry audit (batch) | E | Orchestrates all detectors + optional AI. |

---

## Interaction with Existing Systems

### Parallel Paths

When the user chooses "Keep both as parallel paths" during conflict resolution, the system:
1. Merges the two INDI records into one
2. Creates two parent edges with a shared `parallelGroupId`
3. Marks the better-sourced edge as `isPrimary`
4. The tree navigator shows the fork icon (existing Phase C feature)
5. The person detail panel shows the parallel paths section (existing Phase D feature)

This bridges the gap between "unknown conflict" (detected by this system) and "known alternate parentage" (handled by the existing parallel path system).

### Confidence Scoring

Ancestry conflicts should penalize confidence:

```
// Add to confidence-scorer.ts, edge confidence algorithm:

STEP 2b — Ancestry conflict penalty
  if this edge's child has an ANCESTRY_CONFLICT_DIFFERENT_PARENTS flag:
    baseTier = max(baseTier, 3)
    // Rationale: if we don't even know who the parents are,
    // the edge can't be better than Tier 3 regardless of sources
```

### Research Recommender

When an ancestry conflict exists, the research recommender should prioritize records that would resolve it:

```typescript
// In research-recommender.ts:
if (person.flags.some(f => f.ruleId.startsWith("ANCESTRY_CONFLICT"))) {
  recommendations.push({
    description: "Find a record that names this person AND their parents together",
    suggestedSources: getParentNamingRecords(person.eraTag, person.locationContext),
    impact: "high",
    reasoning: "This person has conflicting parent chains. A single record naming " +
               "both the person and their parents would resolve the conflict."
  });
}

function getParentNamingRecords(era: EraTag, location: LocationContext): string[] {
  // Records most likely to name both a person and their parents:
  switch (era) {
    case "us_modern":
      return ["Birth certificate", "Census (lists parents in household)", 
              "Marriage certificate (names father)", "Death certificate (names parents)"];
    case "us_antebellum":
      return ["Census (1850+ names all household members)", 
              "Will/probate (names children)", "Pension application (names family)"];
    case "us_colonial":
      return ["Will/probate", "Court records", "Church register (baptism names parents)",
              "Land deed (naming heirs)"];
    case "scotland_opr":
      return ["Old Parochial Record (baptism names parents)", 
              "Testament (names family members)", "Sasine"];
    // ... etc
  }
}
```

---

## Test Expectations

The test GEDCOM fixture should include:

1. **Two entries for the same person with completely different parents** — the critical case. Both entries should have descendants that connect to the tree subject.

2. **Two entries for the same person with same parents but different grandparents** — the upstream divergence case. Trickier to detect.

3. **Two entries for the same person with slightly different names/dates** — the echo duplicate case. One should be 1-2 generations deeper than the other due to an extra intermediary in one path.

4. **One entry with parents, one without** — the partial duplicate case. Should suggest merging into the more complete entry.

5. **A legitimate case where the same person IS a child in two FAM records** — adoptive + biological parents. This should be detected as a convergence point but NOT flagged as a conflict (it's intentional parallel parentage).

Test assertions:
- Conflict detector finds all 4 conflict cases
- Echo detector finds the name-variant duplicate
- Legitimate parallel parentage is NOT flagged as a conflict
- Auto-resolvable conflicts are correctly identified (one version has sources, other doesn't; one has impossible dates)
- Merge operation correctly reparents descendants, preserves unique sources, and disconnects orphaned upstream ancestors
- Confidence scorer applies conflict penalty
- After resolution, the penalty is removed and confidence re-scores
