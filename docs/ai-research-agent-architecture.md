# GenieLogical — AI Research Agent Architecture

**Date:** March 26, 2026
**Scope:** Phase E — AI validation, record search, and research recommendations
**Goal:** Transform the "Ask AI" feature from a generic chatbot into a structured genealogical research agent that finds real records, cross-references them against GEDCOM data, and produces actionable results.

---

## The Problem with the Current Spec

The current Phase E spec describes:
- Send person name, dates, places, tier, sources, flags to Claude
- Ask: "Is this person historically plausible?"
- Get back: `{ summary, suggestedTier, historicalNotes, sourceSuggestions[] }`

This produces vague, hedge-filled responses: "This person is plausible for the era. Consider checking census records." That's not useful. Users can already see from the confidence tier that something needs verification. They need the AI to *do the research* — or at least do the structured part of it.

**What we actually need:** An agent that understands genealogical research methodology, knows what records exist for specific eras and locations, can search the web for actual sources, cross-references findings against the GEDCOM data, and produces specific, actionable results with citations.

---

## Agent Architecture Overview

The AI system has three modes, escalating in depth and cost:

| Mode | Name | When to Use | API Calls | Web Search |
|---|---|---|---|---|
| **Quick** | Plausibility Check | Triage: is this connection worth investigating? | 1 | No |
| **Standard** | Validation Report | Per-person or per-edge deep analysis | 1-3 | Yes (via tool use) |
| **Deep** | Research Agent | Full agentic loop finding actual records | 3-10 | Yes, multiple rounds |

All modes use **Claude Sonnet** for cost efficiency. The user's API key is used directly — no proxy. Cost estimation is shown before any operation.

---

## Mode 1: Quick Plausibility Check

**Purpose:** Fast triage. For batch operations (scan 50 flagged people) or initial assessment.
**Cost:** ~$0.003 per person (1 API call, no tools)
**Latency:** 2-5 seconds

### System Prompt

```
You are a genealogical research assistant. You will be given data about a person 
from a GEDCOM family tree and asked to assess plausibility.

Your job is NOT to be polite or hedging. Be direct and specific:
- If something is wrong, say exactly what and why.
- If something is plausible, say what would confirm it.
- If a date, place, or connection is anachronistic, flag it with the correct information.

Always respond in the specified JSON format. No prose outside the JSON.
```

### User Prompt Template

```
Assess this person from a family tree:

Name: {name}
Birth: {birthDate} in {birthPlace}
Death: {deathDate} in {deathPlace}
Role in tree: {generationLabel} (generation {genNumber} from subject)
Parents: {fatherName} ({fatherDates}) + {motherName} ({motherDates})
Children: {childrenSummary}
Current confidence tier: {tier}
Active flags: {flagsSummary}
Sources attached: {sourcesSummary}
Era context: {eraTag} // e.g., "colonial_america", "medieval_scotland", "antebellum_south"

Respond with JSON only:
{
  "plausibility": "confirmed" | "plausible" | "questionable" | "implausible",
  "issues": [
    { "type": "date" | "place" | "name" | "connection" | "title", 
      "description": "specific issue",
      "correction": "what it should be, if known" }
  ],
  "suggestedTier": 1-4,
  "tierReason": "one sentence explaining why",
  "quickWin": "the single most impactful thing to verify, or null"
}
```

### Implementation Notes

- No web search tool provided. This is pure knowledge assessment.
- Batch-friendly: can run 50 of these in parallel with rate limiting.
- Results cached per person + GEDCOM hash. Don't re-run unless data changes.
- The `quickWin` field feeds directly into the Research Priority Matrix.

---

## Mode 2: Standard Validation Report

**Purpose:** Deep analysis of a single person or edge. This is the main "Ask AI" feature.
**Cost:** ~$0.01-0.03 per person (1-3 API calls with web search tool)
**Latency:** 10-30 seconds

### Why Web Search Matters

The difference between a useful AI genealogy tool and a useless one is web search. Without it, Claude can only say "this seems plausible." With it, Claude can:
- Find actual census records on FamilySearch
- Check published genealogies on Google Books / Internet Archive
- Verify historical figures on Wikipedia / ODNB
- Find marriage bonds, probate records, land grants in indexed databases
- Cross-reference county histories and published family histories
- Check WikiTree, Geni, and The Peerage for existing research

### System Prompt

```
You are an expert genealogical researcher. You will be given data about a person 
from a GEDCOM family tree and asked to validate them using web research.

METHODOLOGY:
1. First, assess what you already know about this person or their historical context.
2. Then, search for corroborating or contradicting evidence using web search.
3. Cross-reference what you find against the GEDCOM data provided.
4. Be specific: cite actual sources with URLs. Don't say "check census records" — 
   search for them and report what you find or don't find.

SEARCH STRATEGY BY ERA AND LOCATION:
- US 1850-present: Search for census records, vital records on FamilySearch/Ancestry.
  Try: "{name} {birth year} {state} census" or "{name} {county} {state} marriage"
- US 1790-1850: Pre-detail census. Search for: tax lists, land grants, court records,
  church records. Try: "{surname} {county} {state} land grant" or "{surname} {county} deed"
- US Colonial (pre-1790): County court records, vestry books, land patents.
  Try: "{surname} {county} colonial records" or "{name} {colony} will probate"
- Scotland pre-1855: Old Parochial Records (OPR), NRS, ScotlandsPeople.
  Try: "{surname} {parish} Scotland baptism" or "{name} NRS Scotland"
- Scotland nobility: Scots Peerage (Paul), Burke's Peerage, Complete Peerage.
  Try: "{title} {surname} Scots Peerage" or "{name} Complete Peerage"
- England pre-1837: Parish registers, TNA, wills at TNA/county archives.
  Try: "{surname} {parish} England parish register"
- Ireland: Civil registration (post-1864), church registers, Griffith's Valuation (1847-64).
  Try: "{surname} {county} Ireland church records"
- Germany: Archion (church books), local archives, emigration records.
  Try: "{surname} {town} {region} Germany kirchenbuch"
- Medieval Europe: Published peerages, Wikipedia, Medieval Lands (FMG).
  Try: "{name} {title} medieval" or "{name} Foundation for Medieval Genealogy"
- Military (any era): NARA pension files, Fold3, service records.
  Try: "{name} {war} pension NARA" or "{name} {regiment} military records"
- Native American: Tribal records, Draper Manuscripts, published histories.
  Try: "{name} {tribe} historical records"

WHAT TO REPORT:
- Records found that CONFIRM the GEDCOM data (with URLs)
- Records found that CONTRADICT the GEDCOM data (with URLs and explanation)
- Records NOT found that SHOULD exist if the person is real (absence of evidence)
- The single most impactful next research step

CROSS-REFERENCING RULES:
- If the GEDCOM says Person A is child of Person B, look for records that name both.
- If you find a record with a matching name but different dates, note the discrepancy.
- If you find a record that names different parents than the GEDCOM shows, flag it.
- Pay attention to county/state boundaries that changed over time.
- Note spelling variants: McRae/MacRae/McCrae/McCree are the same family.

Always respond in the specified JSON format.
```

### User Prompt Template

```
Validate this person and their parental connection:

PERSON:
  Name: {name} (also known as: {alternateNames})
  Birth: {birthDate} in {birthPlace}
  Death: {deathDate} in {deathPlace}
  Occupation: {occupation}
  
PARENTS (per GEDCOM):
  Father: {fatherName} ({fatherDates}, {fatherPlace})
  Mother: {motherName} ({motherDates}, {motherPlace})
  Marriage: {parentsMarriageDate} in {parentsMarriagePlace}
  
CHILDREN (per GEDCOM):
  {childrenList}

CURRENT ASSESSMENT:
  Confidence tier: {tier}
  Active flags: {flagsList}
  Existing sources: {sourcesList}
  
CONTEXT:
  Generation {genNumber} from tree subject.
  This person is on a path to: {notableAncestorNames} (if applicable)
  Era tag: {eraTag}
  Known bridge zone: {yes/no} — {bridgeDescription}

SPECIFIC QUESTIONS:
  {generatedQuestions}
  // e.g., "Is there a marriage record for {father} and {mother} in {county}?"
  // e.g., "Does the 1850 census for {county} list this family?"
  // e.g., "Is this person documented in the Scots Peerage or Complete Peerage?"

Search the web to find evidence. Report findings in this JSON format:
{
  "personAssessment": {
    "plausibility": "confirmed" | "plausible" | "questionable" | "implausible",
    "summary": "2-3 sentence assessment"
  },
  "parentalLink": {
    "status": "confirmed" | "plausible" | "questionable" | "implausible" | "contradicted",
    "summary": "1-2 sentence assessment of the parent-child connection specifically"
  },
  "recordsFound": [
    {
      "type": "census" | "vital" | "church" | "military" | "land" | "probate" | "published_genealogy" | "peerage" | "other",
      "title": "description of the record",
      "url": "URL if found online",
      "repository": "FamilySearch" | "Ancestry" | "NARA" | "NRS" | "WikiTree" | "other",
      "confirms": ["what GEDCOM claims this supports"],
      "contradicts": ["what GEDCOM claims this contradicts, if any"],
      "sourceClass": "primary" | "secondary" | "tertiary"
    }
  ],
  "recordsExpectedButNotFound": [
    {
      "type": "record type",
      "description": "what should exist and where to look",
      "significance": "what its absence might mean"
    }
  ],
  "dateDiscrepancies": [
    {
      "gedcomClaim": "what the tree says",
      "evidenceSays": "what the records say",
      "source": "where the evidence comes from"
    }
  ],
  "suggestedTier": 1-4,
  "suggestedSourceClass": "primary" | "secondary" | "tertiary",
  "nextStep": {
    "action": "specific research action",
    "repository": "where to look",
    "expectedCost": "free" | "subscription" | "archive_visit" | "unknown",
    "impactIfFound": "what this would prove or disprove"
  }
}
```

### Generating Specific Questions

The prompt includes `{generatedQuestions}` — these should NOT be generic. They should be computed by the app based on what's missing:

```typescript
function generateResearchQuestions(
  person: Person, 
  edge: Edge | null,
  flags: Flag[],
  era: EraTag,
  location: LocationContext
): string[] {
  const questions: string[] = [];
  
  // If no birth record
  if (!person.sources.some(s => s.provesWhat.includes("birth"))) {
    if (era === "us_post_1850") {
      questions.push(
        `Search for ${person.displayName} in the ${person.birthYear || "estimated"} US Census for ${person.birthPlace?.county || "unknown county"}, ${person.birthPlace?.state}.`
      );
    } else if (era === "scotland_pre_1855") {
      questions.push(
        `Search for a baptism record for ${person.displayName} in the Old Parochial Records for ${person.birthPlace?.parish || "the relevant parish"}, Scotland.`
      );
    }
  }
  
  // If parental link is unsourced
  if (edge && edge.confidenceTier >= 3) {
    const parent = graph.getPerson(edge.parentId);
    questions.push(
      `Is there any record (census, will, deed, church register) that names ${person.displayName} as a child of ${parent.displayName}?`
    );
  }
  
  // If person has a title in their name (prestige inflation flag)
  if (flags.some(f => f.ruleId === "PRESTIGE_TITLE_IN_NAME")) {
    questions.push(
      `Verify whether ${person.displayName} actually held the title "${extractTitle(person.name)}". Check the relevant peerage, baronetage, or published genealogy.`
    );
  }
  
  // If person is on a notable-ancestor path
  if (person.isOnNotablePath) {
    questions.push(
      `This person is on a claimed lineage path. Search for any published genealogy or scholarly source that documents or disputes this connection.`
    );
  }
  
  // If there's a date flag
  if (flags.some(f => f.category === "chronological")) {
    questions.push(
      `The GEDCOM dates for this person have been flagged as problematic. Search for independent records to establish correct dates.`
    );
  }

  return questions;
}
```

### Tool Configuration

The API call should include the `web_search` tool:

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: VALIDATION_SYSTEM_PROMPT,
  tools: [
    {
      type: "web_search_20250305",
      name: "web_search"
    }
  ],
  messages: [
    { role: "user", content: validationPrompt }
  ]
});
```

### Processing the Response

Claude will interleave web search calls with its reasoning. The response will contain multiple content blocks. Extract:

```typescript
interface ValidationResult {
  // Parsed from the final JSON in Claude's response
  personAssessment: { plausibility: string; summary: string };
  parentalLink: { status: string; summary: string };
  recordsFound: FoundRecord[];
  recordsExpectedButNotFound: MissingRecord[];
  dateDiscrepancies: DateDiscrepancy[];
  suggestedTier: number;
  nextStep: ResearchStep;
  
  // Metadata
  searchesPerformed: number;  // Count of web_search tool uses
  sourcesConsulted: string[]; // URLs visited
  cachedAt: Date;
  apiCostEstimate: number;    // Approximate cost in USD
}
```

---

## Mode 3: Deep Research Agent

**Purpose:** Full agentic research loop for high-value targets. Used for bridge zones, notable ancestor paths, and critical verification tasks.
**Cost:** ~$0.05-0.15 per research task (3-10 API calls with extensive web search)
**Latency:** 30-120 seconds

### When to Trigger

- User clicks "Deep Research" on a person in a bridge zone
- User clicks "Verify This Path" on a notable ancestor story card
- User selects "Research this edge" on a high-impact priority in the Research Priority Matrix
- Never triggered automatically — always user-initiated with cost estimate

### Architecture: Multi-Turn Agentic Loop

Unlike Modes 1-2 (single API call), Mode 3 uses a conversational loop:

```typescript
async function runDeepResearch(
  task: ResearchTask,
  graph: TreeGraph,
  apiKey: string,
  onProgress: (update: ProgressUpdate) => void
): Promise<DeepResearchResult> {
  
  const conversationHistory: Message[] = [];
  const allFindings: Finding[] = [];
  let iteration = 0;
  const MAX_ITERATIONS = 5;
  
  // Initial prompt with full context
  conversationHistory.push({
    role: "user",
    content: buildDeepResearchPrompt(task, graph)
  });
  
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    onProgress({ phase: `Research round ${iteration}`, detail: "Searching..." });
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: DEEP_RESEARCH_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: conversationHistory
    });
    
    // Add assistant response to history
    conversationHistory.push({ role: "assistant", content: response.content });
    
    // Parse findings from this round
    const roundFindings = parseFindings(response);
    allFindings.push(...roundFindings);
    
    // Check if agent wants to continue or is done
    const agentStatus = parseAgentStatus(response);
    
    if (agentStatus === "complete" || agentStatus === "dead_end") {
      break;
    }
    
    // Agent wants to continue — provide follow-up prompt
    conversationHistory.push({
      role: "user",
      content: buildFollowUpPrompt(agentStatus, roundFindings, task)
    });
  }
  
  // Final synthesis
  return synthesizeResults(allFindings, task);
}
```

### Deep Research System Prompt

```
You are an expert genealogical researcher conducting a focused investigation.
You will be given a specific research task — typically verifying a connection 
between two people, or finding records for a person in a specific era and location.

METHODOLOGY — follow this exact sequence:

ROUND 1: ORIENTATION
- Understand the person, their era, their location, and what needs proving.
- Identify the 3-5 most likely record types that would exist for this person.
- Perform initial web searches targeting the highest-probability records.
- Report what you found or didn't find.

ROUND 2: TARGETED SEARCH
- Based on Round 1 results, narrow your search.
- If you found a partial match, search for corroborating records.
- If you found nothing, try variant spellings, neighboring counties, different date ranges.
- Search for published genealogies or compiled sources that cover this family.
- Report findings.

ROUND 3: CROSS-REFERENCE
- Compare all findings against the GEDCOM data.
- Note confirmations, contradictions, and ambiguities.
- If contradictions exist, search for records that resolve them.
- Report findings.

ROUND 4: SYNTHESIS (if needed)
- Compile all evidence into a final assessment.
- Rate the connection as confirmed, plausible, questionable, or implausible.
- Identify the single most impactful remaining research step.

SEARCH TIPS:
- FamilySearch.org has free census indexes. Try: site:familysearch.org "{name}" "{state}"
- WikiTree has collaborative genealogies with sources. Try: site:wikitree.com "{surname}"
- Google Books has full-text county histories. Try: "{surname}" "{county}" site:books.google.com
- Internet Archive has digitized genealogies. Try: "{surname}" site:archive.org
- Find A Grave has burial records. Try: site:findagrave.com "{name}" "{state}"
- The Peerage has British/Irish nobility. Try: site:thepeerage.com "{name}"
- For Scottish records: site:scotlandspeople.gov.uk or search NRS catalog
- For military pensions: "NARA" "{name}" pension OR "fold3" "{name}"

IMPORTANT:
- Actually search. Don't say "you should check FamilySearch" — search it and report results.
- Cite specific URLs for everything you find.
- If a search returns no results, say so explicitly — absence of evidence matters.
- Note when records have been digitized vs. when they're only available in physical archives.

After each round, end your response with a status:
STATUS: CONTINUE — I have promising leads to follow
STATUS: COMPLETE — I've found enough to make an assessment  
STATUS: DEAD_END — I've exhausted available online sources for this person

Then provide your findings in this format:
{
  "round": 1-4,
  "searchesPerformed": ["query 1", "query 2", ...],
  "findings": [
    {
      "type": "confirmation" | "contradiction" | "new_lead" | "absence",
      "description": "what was found or not found",
      "url": "source URL if applicable",
      "sourceClass": "primary" | "secondary" | "tertiary",
      "relevantTo": "what GEDCOM claim this relates to"
    }
  ],
  "status": "CONTINUE" | "COMPLETE" | "DEAD_END"
}
```

### Deep Research Task Types

```typescript
interface ResearchTask {
  type: 
    | "verify_person"          // Does this person exist in records?
    | "verify_edge"            // Is this parent-child link real?
    | "verify_bridge"          // Verify a bridge zone (multiple edges)
    | "verify_notable_path"    // Full path from subject to notable ancestor
    | "find_parents"           // Person exists but parents unknown
    | "resolve_duplicate"      // Are these two GEDCOM entries the same person?
    | "resolve_date_conflict"  // GEDCOM dates flagged as impossible
    | "verify_title"           // Does this person actually hold claimed title?
    ;
  
  primaryPersonId: string;
  secondaryPersonId: string | null;  // For edges, duplicates
  edgeIds: string[];                  // For bridge zones
  
  // Pre-computed context the agent needs
  eraTag: EraTag;
  locationContext: LocationContext;
  existingSources: Source[];
  activeFlags: Flag[];
  researchQuestions: string[];        // Pre-generated specific questions
  
  // For notable path verification
  pathPersonIds: string[] | null;
  notableAncestorName: string | null;
}
```

### Deep Research Result

```typescript
interface DeepResearchResult {
  task: ResearchTask;
  
  // Overall assessment
  verdict: "confirmed" | "plausible" | "questionable" | "implausible" | "contradicted";
  confidenceBefore: number;  // Tier before research
  confidenceAfter: number;   // Suggested tier after research
  summary: string;           // 3-5 sentence narrative summary
  
  // All findings across rounds
  findings: Finding[];
  confirmations: Finding[];
  contradictions: Finding[];
  absences: Finding[];       // Expected records not found
  
  // Sources discovered (can be auto-imported as Sources in the app)
  discoveredSources: {
    title: string;
    url: string;
    repository: string;
    sourceClass: "primary" | "secondary" | "tertiary";
    provesWhat: string[];
    autoImport: boolean;     // User can approve auto-import
  }[];
  
  // What's still needed
  nextSteps: {
    action: string;
    repository: string;
    expectedCost: "free" | "subscription" | "archive_visit";
    impactIfFound: string;
    priority: "high" | "medium" | "low";
  }[];
  
  // Metadata
  roundsCompleted: number;
  searchesPerformed: string[];
  urlsConsulted: string[];
  totalApiCalls: number;
  estimatedCost: number;
  completedAt: Date;
}
```

---

## Era + Location Context Engine

The AI is only as good as the context it receives. The app should pre-compute era and location context for every person, so prompts are specific rather than generic.

```typescript
type EraTag = 
  | "us_modern"              // US 1900-present
  | "us_gilded_reconstruction" // US 1865-1900
  | "us_antebellum"          // US 1800-1865
  | "us_early_republic"      // US 1790-1800
  | "us_colonial"            // US/Colonial 1607-1790
  | "scotland_modern"        // Scotland 1855-present (civil registration)
  | "scotland_opr"           // Scotland 1553-1854 (Old Parochial Records)
  | "scotland_pre_reformation" // Scotland pre-1560
  | "england_modern"         // England 1837-present (civil registration)
  | "england_parish"         // England 1538-1837 (parish registers)
  | "england_medieval"       // England pre-1538
  | "ireland_modern"         // Ireland 1864-present
  | "ireland_pre_famine"     // Ireland pre-1845
  | "germany_modern"         // Germany 1876-present
  | "germany_church_books"   // Germany pre-1876
  | "france_modern"          // France 1792-present
  | "france_ancien_regime"   // France pre-1792
  | "medieval_europe"        // Any European location pre-1500
  | "unknown";

interface LocationContext {
  country: string;
  state_province: string | null;
  county: string | null;
  parish_town: string | null;
  
  // Pre-computed: what record repositories cover this location?
  availableRepositories: {
    name: string;           // "FamilySearch", "Ancestry", "NRS", "NARA", etc.
    url: string;
    recordTypes: string[];  // ["census", "vital_records", "church_registers"]
    accessLevel: "free" | "subscription" | "in_person_only";
    coverage: string;       // "1790-1940 census indexes" etc.
  }[];
  
  // Pre-computed: what known record gaps exist?
  knownGaps: string[];
  // e.g., "Burke County NC courthouse burned 1865 — pre-1865 records largely destroyed"
  // e.g., "Irish church records before 1820 are sparse for Catholic parishes"
}

function computeEraTag(person: Person): EraTag {
  const year = person.birthYear || person.deathYear;
  const country = person.birthPlace?.country || person.deathPlace?.country;
  
  if (!year || !country) return "unknown";
  
  if (country === "United States" || country === "Colonial America") {
    if (year >= 1900) return "us_modern";
    if (year >= 1865) return "us_gilded_reconstruction";
    if (year >= 1800) return "us_antebellum";
    if (year >= 1790) return "us_early_republic";
    return "us_colonial";
  }
  
  if (country === "Scotland") {
    if (year >= 1855) return "scotland_modern";
    if (year >= 1553) return "scotland_opr";
    return "scotland_pre_reformation";
  }
  
  // ... etc for other countries
  
  if (year < 1500) return "medieval_europe";
  return "unknown";
}
```

### Repository Lookup Table

This is the data that makes the AI prompts specific rather than generic:

```typescript
const REPOSITORY_REGISTRY: RepositoryInfo[] = [
  {
    name: "FamilySearch",
    url: "https://www.familysearch.org",
    accessLevel: "free",
    coverage: [
      { era: "us_modern", recordTypes: ["census", "vital_records", "military_record"], 
        notes: "US Census 1790-1950 fully indexed. Vital records coverage varies by state." },
      { era: "us_antebellum", recordTypes: ["census", "church_register", "probate"],
        notes: "Pre-1850 census only lists household head. Church records patchy." },
      { era: "scotland_opr", recordTypes: ["church_register"],
        notes: "OPR indexes available but images require ScotlandsPeople subscription." },
    ]
  },
  {
    name: "NARA (National Archives)",
    url: "https://www.archives.gov",
    accessLevel: "free",
    coverage: [
      { era: "us_early_republic", recordTypes: ["military_record", "pension_file", "land_grant"],
        notes: "Revolutionary War pension files (M804/M805). War of 1812 pensions (M313)." },
    ]
  },
  {
    name: "National Records of Scotland (NRS)",
    url: "https://www.nrscotland.gov.uk",
    accessLevel: "subscription",
    coverage: [
      { era: "scotland_opr", recordTypes: ["church_register", "court_record"],
        notes: "Old Parochial Records, testaments, deeds, sasines." },
      { era: "scotland_pre_reformation", recordTypes: ["court_record"],
        notes: "Charter records, register of the great seal." },
    ]
  },
  {
    name: "Scots Peerage (Paul, 1904-14)",
    url: null,  // Book, available in libraries and some online
    accessLevel: "free",  // Available on Internet Archive
    coverage: [
      { era: "scotland_pre_reformation", recordTypes: ["published_genealogy"],
        notes: "9 volumes covering Scottish peerage families. Available on Internet Archive." },
      { era: "scotland_opr", recordTypes: ["published_genealogy"],
        notes: "Standard reference for Scottish noble genealogies." },
    ]
  },
  {
    name: "Complete Peerage (Cokayne)",
    url: null,
    accessLevel: "subscription",
    coverage: [
      { era: "england_medieval", recordTypes: ["published_genealogy"],
        notes: "13 volumes. The standard reference for English, Scottish, and Irish peerages." },
    ]
  },
  {
    name: "WikiTree",
    url: "https://www.wikitree.com",
    accessLevel: "free",
    coverage: [
      { era: "us_colonial", recordTypes: ["compiled_tree"],
        notes: "Collaborative genealogy. Quality varies but active community verification. Magna Carta and Gateway Ancestor projects." },
    ]
  },
  {
    name: "Find A Grave",
    url: "https://www.findagrave.com",
    accessLevel: "free",
    coverage: [
      { era: "us_antebellum", recordTypes: ["monument_inscription"],
        notes: "Burial records, headstone photos. Good for death date confirmation." },
    ]
  },
  // ... extend with more repositories
];
```

---

## Batch Operations

### Batch Quick Scan

Scan all people in a selection (e.g., "all Tier 3-4 people", "all flagged people", "this branch") using Mode 1.

```typescript
interface BatchQuickScanConfig {
  scope: "all_flagged" | "tier_3_4" | "branch" | "bridge_zone" | "custom";
  personIds: string[];           // Resolved list
  maxConcurrent: number;         // Default 5
  delayBetweenMs: number;        // Default 500
}

interface BatchQuickScanResult {
  results: Map<string, QuickCheckResult>;
  summary: {
    confirmed: number;
    plausible: number;
    questionable: number;
    implausible: number;
  };
  estimatedCost: number;
  completedAt: Date;
  suggestedDeepResearchTargets: string[];  // Person IDs that warrant Mode 3
}
```

### Cost Estimation

Always show before any batch operation:

```typescript
function estimateBatchCost(config: BatchQuickScanConfig): CostEstimate {
  const perPersonCost = 0.003;  // Mode 1
  const totalCost = config.personIds.length * perPersonCost;
  
  return {
    personCount: config.personIds.length,
    estimatedCost: totalCost,
    estimatedTime: config.personIds.length * 3,  // ~3 seconds per person
    disclaimer: "Costs are approximate. Actual cost depends on response length."
  };
}
```

---

## Auto-Import Discovered Sources

When the AI finds actual records (Mode 2 or 3), offer to import them as Sources:

```typescript
interface DiscoveredSourceImport {
  // From AI findings
  title: string;
  url: string;
  repository: string;
  sourceClass: "primary" | "secondary" | "tertiary";
  
  // Computed
  suggestedSourceType: SourceType;
  suggestedProvesWhat: string[];
  attachToPersonIds: string[];
  attachToEdgeIds: string[];
  
  // User must confirm
  userApproved: boolean;
}
```

Show a confirmation dialog: "The AI found 3 records for this person. Import them as sources?"

Each discovered source shows:
- Title and URL (clickable to verify)
- Suggested classification (user can override)
- What it proves (user can adjust)
- "Import" / "Skip" buttons

This closes the loop: AI finds a record → user approves → source is added → confidence re-scores → tier potentially upgrades. That's the "watch your tree get stronger" experience.

---

## UI Components

### `src/components/research/AskAIButton.tsx`

Replaces the current "Ask AI" stub. Context-aware button that appears on:
- Person detail panel (runs Mode 2 for that person)
- Edge/connection display (runs Mode 2 for that edge)
- Bridge zone callout (runs Mode 3 for the bridge)
- Story card (runs Mode 3 for the path)
- Flag cards (runs Mode 2 focused on the flagged issue)

The button shows estimated cost before execution.

### `src/components/research/ResearchProgress.tsx`

Progress indicator for Mode 2 and 3:
- Shows current phase ("Searching FamilySearch...", "Cross-referencing census data...")
- For Mode 3, shows round number and findings count
- Cancel button
- Running cost tracker

### `src/components/research/FindingsPanel.tsx`

Displays results from Mode 2 or 3:
- Findings grouped by type (confirmations, contradictions, absences)
- Each finding: description, source URL (clickable), source class badge
- "Import as source" button on each finding
- Overall verdict with tier recommendation
- Next steps list with priority indicators

### `src/components/research/BatchScanDialog.tsx`

For batch Mode 1 operations:
- Scope selector (all flagged, all Tier 3-4, specific branch, custom)
- Person count and cost estimate
- Progress bar during execution
- Results summary when complete
- "View details" for individual results
- "Deep research recommended for N people" callout

---

## Files Summary

### New files

| File | Purpose |
|---|---|
| `src/ai/prompts/system-quick.ts` | Mode 1 system prompt |
| `src/ai/prompts/system-validation.ts` | Mode 2 system prompt |
| `src/ai/prompts/system-deep-research.ts` | Mode 3 system prompt |
| `src/ai/prompts/user-templates.ts` | User prompt builders for all modes |
| `src/ai/question-generator.ts` | Generates specific research questions from person/edge data |
| `src/ai/era-context.ts` | Era tag computation + repository lookup |
| `src/ai/result-parser.ts` | Parse Claude responses into typed results |
| `src/ai/source-importer.ts` | Convert AI findings into importable Sources |
| `src/ai/batch-runner.ts` | Batch execution with rate limiting and progress |
| `src/ai/cost-estimator.ts` | Cost estimation for all modes |
| `src/components/research/AskAIButton.tsx` | Context-aware AI trigger |
| `src/components/research/ResearchProgress.tsx` | Progress indicator |
| `src/components/research/FindingsPanel.tsx` | Results display |
| `src/components/research/BatchScanDialog.tsx` | Batch operation UI |
| `src/components/research/SourceImportDialog.tsx` | Confirm source auto-import |

### Modified files

| File | Changes |
|---|---|
| `src/ai/ai-client.ts` | Refactor to support all 3 modes, tool use, multi-turn |
| `src/ai/validation-prompts.ts` | Replace with new prompt architecture (or deprecate in favor of `prompts/`) |
| `src/ai/batch-validator.ts` | Refactor to use new batch-runner |
| `src/components/person-detail/PersonDetailPanel.tsx` | Wire AskAIButton and FindingsPanel |
| `src/components/research/StoryCard.tsx` | Add "Verify This Path" button triggering Mode 3 |
| `src/components/research/PriorityMatrix.tsx` | Add "Research This" button triggering Mode 3 |

---

## Key Principles

1. **The AI searches, it doesn't just opine.** Web search tool is mandatory for Modes 2-3. Without it, the AI is just a fancy confidence rater.

2. **Context makes or breaks the result.** The era tag, location context, repository lookup, and pre-generated research questions are what make the AI effective. A prompt that says "validate this person" fails. A prompt that says "search FamilySearch for the 1850 Cabarrus County NC census listing for this family" succeeds.

3. **Every finding is importable.** The AI's results should flow back into the app's data model as Sources. This closes the research loop: investigate → find → import → re-score → tree gets stronger.

4. **Cost is always visible.** Show estimated cost before every operation. Show running cost during execution. Show total cost in results. Never surprise users with API bills.

5. **AI is never authoritative.** Results are always "suggested" — the user confirms, rejects, or adjusts. The AI can suggest a tier change, but the user makes it happen. The AI can find a source, but the user approves the import.

6. **Graceful degradation.** If no API key is set, all AI features are hidden. If web search fails, the AI falls back to knowledge-based assessment (Mode 1). If Mode 3 hits a dead end, it reports what it tried and what's left to do manually.

7. **Cache aggressively.** Mode 1 results are cached per person + data hash. Mode 2 results are cached per person + source count. Mode 3 results are cached per task. Don't re-run expensive operations unless the underlying data has changed.
