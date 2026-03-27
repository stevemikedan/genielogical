# GenieLogical — Data Model Assessment for Multi-User Shared Datasets

**Date:** March 26, 2026  
**Phase:** Phase 3+ (future architecture)  
**Purpose:** Assess whether the current data model supports eventual multi-user shared datasets, identify what needs to change, and define the migration path.

---

## The Vision

Today: single user imports a GEDCOM, works on it locally.

Tomorrow: users share their validated segments. When User A verifies that Rev. Farquhar MacRae (1580-1662) → Alexander of Inverinate (1614-1685), that verified edge benefits every user whose tree also includes those two people. A growing, community-validated genealogical dataset where everyone's research strengthens everyone else's tree.

This is fundamentally different from what Ancestry, FamilySearch, or WikiTree do today:
- **Ancestry** has a massive dataset but trees are private silos. "Hints" cross-pollinate but without quality control.
- **FamilySearch** has one shared tree but no confidence methodology — anyone can edit anything.
- **WikiTree** has collaborative editing with source requirements but no automated confidence scoring.

GenieLogical's differentiator: **confidence-scored edges with source classification, shared across users, where community validation accumulates and is visible.** The trust model isn't "someone added this so it's probably right" — it's "this edge has 3 primary sources from 2 independent researchers, so it's Tier 1."

---

## Current Data Model Assessment

### What Already Works

**Person identity model:** Each person has a unique ID, normalized names, normalized dates, normalized places. This is sufficient for local use. For shared datasets, persons need a **canonical identity** that can be matched across users' trees (see below).

**Edge model:** Parent-child edges with confidence tiers, source attachments, parallel path support. This is the core strength. Edges are the unit of genealogical proof, and the model already treats them that way. For shared datasets, edges need **provenance tracking** (who asserted this connection, when, with what evidence).

**Source model:** Source classification (primary/secondary/tertiary/derivative), source types, repository references, provesWhat fields. This transfers directly to a shared model — sources are the evidence layer and they're already well-structured.

**Confidence scoring:** Ceiling-based, source-class-driven, era-adjusted. This algorithm is deterministic and reproducible — given the same inputs, any instance of the app produces the same score. This is essential for shared datasets: users see the same confidence levels because the algorithm is the same everywhere.

### What Needs to Change

**1. Person Identity — The Matching Problem**

Currently, persons are identified by GEDCOM xref IDs (`@I12345@`), which are local to a single file. Two users who both have "Rev. Farquhar MacRae, b. 1580, Ellandonan" in their trees will have different internal IDs.

For shared datasets, we need a **canonical person identifier** that's stable across trees:

```typescript
interface CanonicalIdentity {
  // Hash-based identity for approximate matching
  identityHash: string;  
  // Generated from: normalized surname + normalized given name + 
  //                  birth decade + birth country + death decade
  // Example: "macrae_farquhar_1580_scotland_1662" → SHA-256 hash
  
  // External identifiers (when known)
  wikitreeId: string | null;       // "MacRae-123"
  familysearchId: string | null;   // "XXXX-XXX"
  findAGraveId: string | null;     // "12345678"
  
  // Disambiguation
  isAmbiguous: boolean;  
  // True when the identity hash matches multiple real people
  // (common names in common eras: "John Smith, b. ~1750, Virginia")
}
```

The identity hash is NOT guaranteed unique — it's a matching key. When two users' identity hashes match, the system flags it as a potential person match for human review. False positives (different people with similar vitals) are resolved by checking additional details: parents' names, spouse names, specific birth places, sources.

**2. Edge Provenance — Who Said This?**

Currently, edges have no concept of "who asserted this connection." In a single-user app, it's implicit — the user imported this GEDCOM or added this source. For shared datasets, every edge assertion needs provenance:

```typescript
interface EdgeAssertion {
  edgeId: string;
  assertedBy: string;           // User ID or "gedcom_import"
  assertedAt: Date;
  sources: string[];            // Source IDs supporting this assertion
  confidenceTier: number;       // The asserter's confidence at time of assertion
  
  // Consensus
  supportedByUsers: string[];   // Other users who agree (have same edge + sources)
  disputedByUsers: string[];    // Users who explicitly disagree
}
```

When multiple users independently assert the same edge with independent sources, the consensus strengthens. When a user disputes an edge, the dispute is visible to all.

**3. Source Provenance — Who Found This?**

Same issue: sources currently have `addedBy: string` but it's not a user identity system. For shared datasets:

```typescript
interface SharedSource extends Source {
  // Existing fields...
  
  // Multi-user additions
  originalContributorId: string;   // Who first added this source
  verifiedByUsers: string[];       // Who independently confirmed it
  disputedByUsers: string[];       // Who questions its accuracy
  
  // Deduplication
  sourceHash: string;              // Hash of citation + URL for dedup across users
}
```

**4. Privacy Layer**

Not everyone will want their entire tree shared. The model needs privacy controls:

```typescript
interface PersonPrivacy {
  personId: string;
  shareLevel: 
    | "public"          // Visible to all users, included in shared dataset
    | "anonymized"      // Included in shared dataset but with living persons' names redacted
    | "private"         // Not shared, local only
    ;
}

// Default: living persons are "private", deceased persons are "anonymized"
// User can promote to "public" for deceased ancestors they want to share
// Living persons are NEVER shared regardless of user setting
```

**5. Conflict Resolution — Multi-User Edition**

The ancestry conflict detection system (already spec'd) operates on a single tree. For shared datasets, conflicts arise between users:

- User A says Person X's parents are Father-A + Mother-A
- User B says Person X's parents are Father-B + Mother-B
- The shared dataset shows BOTH assertions with their respective evidence
- Neither user's assertion is deleted — they coexist as competing theories
- The system scores each assertion independently and shows which has stronger evidence
- Users can vote: "I agree with assertion A" (adds to consensus count)

This maps naturally to the existing **parallel paths** model — each user's assertion becomes a path option, and the best-sourced one is marked primary by consensus rather than by a single user.

---

## Migration Path: Single-User → Shared Dataset

### Phase 1 (Current): Local Only
- All data in IndexedDB
- Person IDs are GEDCOM xrefs
- No user identity system
- No sharing

### Phase 2: Export/Import Sharing
- Users can export their validated segments as GenieLogical JSON
- Other users can import those segments and merge with their tree
- Matching is manual: "This person in the import looks like this person in your tree. Merge?"
- The conflict resolution UI (already spec'd) handles disagreements
- No server, no accounts — file-based sharing

### Phase 3: Shared Dataset Service
- **Requires a backend** — this is where the "client-side only" architecture changes
- Users create accounts (or authenticate via existing genealogy platform OAuth)
- Validated edges + sources are uploaded to a central database
- The canonical identity system matches people across trees
- New users importing a GEDCOM get automatic "community validation" annotations:
  "3 other researchers have verified this connection with primary sources"
- The app pulls community data when viewing a person: "Community confidence: Tier 1 (4 researchers, 7 sources)"

### Phase 3 Backend Architecture (High Level)

```
┌─────────────────┐     ┌──────────────────────────┐
│ GenieLogical App │────▶│ GenieLogical API          │
│ (client)         │◀────│ (server)                  │
│                  │     │                           │
│ Local tree in    │     │ Shared person registry    │
│ IndexedDB        │     │ Shared edge assertions    │
│                  │     │ Shared source library     │
│ User's private   │     │ Consensus scoring         │
│ research data    │     │ Privacy enforcement       │
└─────────────────┘     └──────────────────────────┘
```

The client remains the primary workspace. The server is a supplementary data source — the app works fully offline and syncs when connected. This is the same model as WikiTree or Obsidian Sync: local-first, cloud-enhanced.

### Database Schema (Conceptual)

```sql
-- Canonical person registry
CREATE TABLE shared_persons (
  canonical_id     UUID PRIMARY KEY,
  identity_hash    TEXT NOT NULL,
  display_name     TEXT,
  birth_year       INT,
  birth_place      TEXT,
  death_year       INT,
  death_place      TEXT,
  external_ids     JSONB,  -- wikitree, familysearch, etc.
  contributor_count INT,
  created_at       TIMESTAMP,
  INDEX idx_identity_hash (identity_hash)
);

-- Edge assertions from multiple users
CREATE TABLE shared_edges (
  edge_id          UUID PRIMARY KEY,
  parent_id        UUID REFERENCES shared_persons,
  child_id         UUID REFERENCES shared_persons,
  relationship     TEXT,  -- "biological", "adoptive", "step"
  asserted_by      UUID REFERENCES users,
  asserted_at      TIMESTAMP,
  confidence_tier  INT,
  source_ids       UUID[],
  supported_by     UUID[],  -- User IDs who agree
  disputed_by      UUID[],  -- User IDs who disagree
  consensus_score  FLOAT,   -- Computed from support/dispute ratio + source quality
  INDEX idx_parent (parent_id),
  INDEX idx_child (child_id)
);

-- Source library (deduplicated across users)
CREATE TABLE shared_sources (
  source_id        UUID PRIMARY KEY,
  source_hash      TEXT NOT NULL,  -- For dedup
  source_class     TEXT,
  source_type      TEXT,
  title            TEXT,
  citation         TEXT,
  url              TEXT,
  repository       TEXT,
  proves_what      TEXT[],
  contributed_by   UUID REFERENCES users,
  verified_by      UUID[],
  INDEX idx_hash (source_hash)
);
```

---

## What to Build Now (Phase 1-2) vs. Later (Phase 3+)

### Build Now: Single-user foundations that don't need rewriting later

**1. Use UUIDs for internal IDs, not GEDCOM xrefs.**
The GEDCOM parser should generate stable UUIDs when importing. The xref is stored as metadata, not used as the primary key. This avoids ID collisions when merging trees later.

**Status:** Check if the current parser already does this. If it uses xrefs as keys, migrate to UUIDs now — it only gets harder later.

**2. Compute identity hashes on import.**
Even without sharing, the identity hash is useful for local duplicate detection. Add `identityHash` to the Person type now. Use it in the duplicate detector.

```typescript
function computeIdentityHash(person: Person): string {
  const normalized = [
    person.surname?.toLowerCase().trim(),
    person.givenName?.toLowerCase().trim(),
    person.birthYear ? Math.floor(person.birthYear / 10) * 10 : "unknown",
    person.birthPlace?.country?.toLowerCase() || "unknown",
    person.deathYear ? Math.floor(person.deathYear / 10) * 10 : "unknown",
  ].join("_");
  
  return sha256(normalized);
}
```

**3. Track assertion provenance on edges.**
Add `assertedBy` and `assertedAt` to the Edge type now. For single-user, `assertedBy` is always "local_user" or "gedcom_import". When sharing is added, it becomes a real user ID with zero migration.

**4. Add source hashing for dedup.**
Compute a hash of (citation + URL + repository) on each source. Even locally, this catches duplicate source entries. When sharing is added, it prevents the same census record from being stored 1,000 times.

**5. Privacy defaults on living persons.**
The GEDCOM parser already knows who's living (no death date, birth within ~100 years). Tag them now. When sharing is added, the privacy layer is already in place.

### Build Later: Multi-user infrastructure

- User accounts / authentication
- Server API / database
- Cross-tree matching algorithm
- Consensus scoring
- Real-time sync
- Community validation display

These all require a backend and are Phase 3+ scope. But the foundations above (UUIDs, identity hashes, provenance tracking, source hashing, privacy tags) ensure the single-user app is migration-ready.

---

## Impact on Current Data Model

### Person Type — Additions

```typescript
interface Person {
  // ... existing fields ...
  
  // NEW: Multi-user ready
  identityHash: string;             // Computed on import/creation
  privacyLevel: "public" | "anonymized" | "private";  // Default based on living status
  externalIds: {                    // Populated manually or by AI research
    wikitree?: string;
    familysearch?: string;
    findagrave?: string;
  };
}
```

### Edge Type — Additions

```typescript
interface Edge {
  // ... existing fields ...
  
  // NEW: Provenance
  assertedBy: string;               // "gedcom_import" | "local_user" | future: user UUID
  assertedAt: Date;
}
```

### Source Type — Addition

```typescript
interface Source {
  // ... existing fields ...
  
  // NEW: Dedup hash
  sourceHash: string;               // SHA-256 of normalized citation + URL
}
```

### These are ADDITIVE changes — no existing fields change, no existing behavior changes. They just add fields that are immediately useful locally and essential later for sharing.

---

## Network View Data Model Implications

The network view (View 5 in the visualization spec) requires computing relationships between any two people in the tree. The current model supports this through traversal:
- Parent-child: explicit edges
- Siblings: derived (share at least one parent edge)
- Spouses: derived (share at least one child edge, or explicit FAMS connection)
- In-laws: derived (spouse's parents/siblings)
- Cousins: derived (common ancestor calculation)

None of these require new data types — they're all computable from the existing Person + Edge graph. The `relationship-calculator.ts` engine (in the visualization spec) handles the computation. The results can be cached per-session but don't need to be persisted.

For the distributed/shared dataset future, the network view becomes the natural "merge preview" interface: overlay two users' networks, highlight shared nodes, show where they agree and disagree. This doesn't require data model changes — it's a rendering concern.

---

## Files Summary

### Immediate Changes (Phase 2 prep, can do now)

| File | Change |
|---|---|
| `src/types/person.ts` | Add `identityHash`, `privacyLevel`, `externalIds` fields |
| `src/types/edge.ts` | Add `assertedBy`, `assertedAt` fields |
| `src/types/source.ts` | Add `sourceHash` field |
| `src/parser/gedcom-parser.ts` | Generate UUIDs (if not already), compute identity hashes on import, set privacy defaults |
| `src/engine/duplicate-detector.ts` | Use identity hashes for faster matching |
| `src/graph/tree-graph.ts` | Add `getNeighborhood(id, hops)` method for network view |

### Future Files (Phase 3)

| File | Purpose |
|---|---|
| `src/types/shared.ts` | `CanonicalIdentity`, `EdgeAssertion`, `SharedSource`, `PersonPrivacy` |
| `src/api/sync-client.ts` | Client for the shared dataset API |
| `src/api/merge-preview.ts` | Compare local tree against shared dataset |
| `src/components/shared/CommunityValidation.tsx` | Display community consensus on edges |
| `src/components/shared/ShareSettings.tsx` | Privacy controls per-person and global |

---

## Key Principle

**The single-user app and the shared dataset are the same data model.** The shared dataset is just the union of many single-user datasets with a matching/consensus layer on top. If the single-user model is right (and it is — Persons, Edges, Sources with confidence scoring), the shared model is just more of the same with provenance metadata. Build the foundations now, add the multi-user layer later, and nothing needs to be rewritten.
