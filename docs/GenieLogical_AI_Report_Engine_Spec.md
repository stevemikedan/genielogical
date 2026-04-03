# GenieLogical — AI Report Engine

## Feature Specification: On-Demand AI-Generated Reports from GEDCOM Data

**Version:** 1.0 DRAFT  
**Date:** March 29, 2026  
**Status:** Requirements (pre-implementation)  
**Depends on:** Phase 1 (parser, tree navigator, person detail panel, health dashboard), AI Research Engine (Modes 1–3), Confidence Scoring System

---

## 1. Problem Statement

Genealogical data is inherently narrative — dates and names only matter in the context of the stories they tell. Users currently have no way to ask their GEDCOM "who are the notable women in my tree?" or "show me everyone who immigrated" or "what are my weakest links?" and get back a structured, scored, citable report.

The Women's History Month prototype demonstrated this: by combining GEDCOM parsing, AI-driven historical research, confidence scoring (person × chain = ancestral), and narrative generation, we produced something far more meaningful than raw data. This feature generalizes that capability into a user-facing report engine.

---

## 2. Core Concept

The user selects a **report type** (from a catalog or via natural language), optionally configures **scope and filters**, and the system generates a structured report combining:

- GEDCOM data extraction (programmatic — fast, deterministic)
- AI analysis and narrative (Claude Sonnet API — slower, scored)
- Confidence scoring (person identity, cumulative chain, ancestral confidence)
- Source citations and GEDCOM data quality flags
- Exportable output (in-app view + downloadable document)

Reports are **not** static templates filled with data. They are AI-generated analytical documents where the AI evaluates, scores, narrates, and flags issues — the same way a professional genealogist would write up their findings.

---

## 3. Report Catalog

### 3.1 Built-In Report Types

Each report type defines: a name, description, required GEDCOM traversal strategy, AI prompt template, output structure, and estimated cost/time.

#### Thematic / Heritage Reports

| Report | Description | Traversal | AI Role |
|--------|-------------|-----------|---------|
| **Notable Women** | Women with titles, roles, historical significance across all generations. Direct-line mothers highlighted separately. | Full tree scan for F sex + title/role keywords; BFS from root for direct maternal line | Score each woman's person identity and chain confidence. Research historical context. Flag GEDCOM quality issues. |
| **Notable Men** | Same as above for male ancestors — military service, titles, occupations, historical roles. | Full tree scan for M sex + title/role/occupation keywords | Same scoring and narrative approach. |
| **Immigration Stories** | Ancestors who crossed borders — country of origin, destination, era, route. | Scan for birth/death country mismatches; place name analysis for colonial/immigrant markers | Era-specific migration pattern analysis. Map to known immigration corridors. |
| **Military Service** | Ancestors with military connections — wars, ranks, service records. | Scan for occupation/title keywords (Captain, Colonel, General, Private, Confederate, militia, etc.) | Map to specific conflicts by date range. Flag unverified ranks. |
| **Geographic Origins** | Where your ancestors came from — country/region breakdown with era mapping. | Aggregate birth_place by country/region/state; cluster by time period | Identify migration patterns, settlement waves, geographic concentrations. |
| **Occupations & Trades** | What your ancestors did — professions, trades, social roles across eras. | Scan OCCU fields + title/name embedded occupations | Map to historical economic contexts. Identify trade lineages. |
| **Longevity & Mortality** | Lifespan analysis — who lived longest, who died youngest, era patterns. | Calculate lifespans from BIRT/DEAT dates; identify outliers | Contextualize with era-specific life expectancy. Flag potential data errors (e.g., 200-year lifespans). |
| **Religious & Cultural Heritage** | Church affiliations, biblical naming patterns, religious occupations. | Scan for Rev/Reverend/Minister/Deacon occupations; biblical name detection; church marriage places | Map naming traditions to regional religious culture (e.g., Appalachian biblical naming). |

#### Analytical / Research Reports

| Report | Description | Traversal | AI Role |
|--------|-------------|-----------|---------|
| **Weakest Links** | Identify the lowest-confidence connections in the tree — where research effort should focus. | Score all edges; rank by cumulative chain impact (how many descendants does this link affect?) | Recommend specific primary source types for each weak link. Estimate research difficulty. |
| **Duplicate Detection** | Find probable duplicate individuals — same person entered multiple times. | Name similarity + date proximity + place matching across all individuals | Score match probability. Identify worst cases (e.g., triple/quadruple duplicates). Recommend merge actions. |
| **Unverified Bridges** | Consecutive weak edges — chains of unverified links that could collapse entire branches. | Graph traversal identifying consecutive edges below confidence threshold | Impact analysis: how many verified ancestors become unreachable if this bridge fails? |
| **Title & Claim Audit** | Verify titles and claims against historical records. Classify as verified/probable/embellishment/fabricated. | Scan all TITL fields and embedded title strings in NAME fields | Cross-reference against known historical title holders. Apply four-class title framework. |
| **Source Coverage** | Which branches have sources, which don't? Where is documentation strongest/weakest? | Count SOUR records per individual; aggregate by branch/generation | Map source density to identify research deserts. Recommend source acquisition strategy. |
| **Data Quality Dashboard** | Comprehensive GEDCOM health report — dates, places, names, encoding, structural issues. | Full parse validation: date formats, place standardization, name field overloading, orphan records | Prioritize fixes by impact. Estimate cleanup effort. |

#### Path & Connection Reports

| Report | Description | Traversal | AI Role |
|--------|-------------|-----------|---------|
| **Notable Ancestor Paths** | Trace verified paths to specific famous ancestors (e.g., Charlemagne, Plantagenets). | BFS/DFS from root to target individuals; score each link in path | Evaluate each link's evidence. Identify weakest point. Compare parallel paths. |
| **Branch Comparison** | Compare two branches of the tree — depth, documentation quality, geographic spread. | Parallel BFS from two selected ancestors; comparative metrics | Narrative comparison with specific examples from each branch. |
| **DNA-Confirmed Lines** | Highlight all DNA-verified connections and what they strengthen. | Scan for DNA markers in names/notes (♦, ♥, DNA, cM values) | Map DNA confirmations to confidence improvements. Identify which unverified branches gain support. |
| **Story Paths** | Detect ancestors with interesting stories — unusual names, dramatic death records, notable connections. | Keyword/pattern scan on names, notes, death places for narrative markers | Generate narrative summaries. Rank by "story interest" score. |

### 3.2 Custom / Natural Language Reports

Beyond the catalog, users can request reports via natural language:

- "Show me all my ancestors from Scotland before 1700"
- "Who in my tree has the most children?"
- "Find ancestors connected to the American Revolution"
- "Compare my mother's side vs my father's side"

The system parses the request, maps it to a traversal strategy and AI prompt, and generates a one-off report.

---

## 4. Report Generation Pipeline

### 4.1 Pipeline Stages

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. SCOPE    │────▶│  2. EXTRACT  │────▶│  3. SCORE    │────▶│  4. NARRATE  │────▶│  5. RENDER   │
│  Selection   │     │  GEDCOM Data │     │  Confidence  │     │  AI Analysis │     │  Output      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
    User picks         Programmatic         Person identity     Claude Sonnet         In-app view
    report type,       tree traversal,      + cumulative        generates             + exportable
    filters,           keyword matching,    chain scoring       narratives,           document
    scope              relationship         on all results      historical            (MD, HTML, 
                       mapping                                  context, flags        DOCX, PDF)
```

### 4.2 Stage Details

**Stage 1: Scope Selection**
- Report type (from catalog or natural language)
- Scope: entire tree, specific branch, direct line only, generation range
- Filters: sex, date range, geography, confidence threshold, source availability
- AI depth: quick (Mode 1 plausibility only) vs. standard (Mode 2 web research) vs. deep (Mode 3 agentic)

**Stage 2: GEDCOM Extraction**
- Deterministic, fast, no AI cost
- Runs the appropriate traversal (BFS, full scan, keyword match, etc.)
- Produces a structured candidate list with all GEDCOM fields
- Identifies duplicates, data quality issues, missing fields
- Estimates AI processing cost before proceeding (user approval gate)

**Stage 3: Confidence Scoring**
- Person identity scoring based on: source count, name consistency, date plausibility, duplicate risk
- Chain scoring: trace path from each candidate to root person; multiply link confidences
- Ancestral confidence: person × chain
- Flag unverified bridges that affect multiple candidates

**Stage 4: AI Narrative Generation**
- Claude Sonnet API calls for each scored candidate (batched for efficiency)
- Prompt includes: person data, confidence scores, era/location context tags, report type instructions
- AI generates: historical narrative, significance assessment, connection description, GEDCOM quality notes, recommended research actions
- Web search (Mode 2+) for historical verification where AI depth warrants it

**Stage 5: Rendering**
- In-app interactive view (React component with expandable cards, filter/sort)
- Methodology section (auto-generated, explains scoring for this specific report)
- Export: Markdown, HTML (styled), DOCX (professional document), PDF
- Shareable link (read-only, per existing sharing model)

### 4.3 Cost Estimation & User Approval

Before Stage 4, the system presents an estimate:

```
Report: Notable Women in Your Tree
Candidates found: 47 women with titles/roles
AI depth: Standard (Mode 2 — web search)
Estimated cost: $0.47–$1.41 (47 × $0.01–$0.03 per person)
Estimated time: 3–8 minutes
[Generate Report] [Change AI Depth] [Reduce Scope]
```

User must approve before API calls begin. Progress indicator shows real-time status.

---

## 5. Confidence Methodology (Applied to Reports)

### 5.1 Three-Metric Scoring

Every individual in a report receives three scores:

| Metric | Definition | Calculation |
|--------|-----------|-------------|
| **Person Identity** | How confident that this person existed and is who the record claims | Source count, name consistency, date plausibility, duplicate risk, title verification |
| **Cumulative Chain** | How confident that the full parent-child link chain to the root is correct | Product of all link confidences from individual to root: C₁ × C₂ × … × Cₙ |
| **Ancestral Confidence** | How likely is it that this person is actually your ancestor | Person × Chain — the headline number |

### 5.2 Chain Degradation

The core insight: confidence degrades multiplicatively with distance.

- 1 link at 95% → 95% chain
- 5 links at 95% → 77% chain
- 10 links at 95% → 60% chain
- 19 links at 95% → 38% chain
- 1 weak link at 50% in a 10-link chain → 30% chain (vs. 60% without it)

This is why recent direct-line women score 90%+ ancestral confidence while queens 19 generations back score 36%. Both are "real" — but the *path* to the queen has more opportunities to break.

### 5.3 Bridge Impact Analysis

Reports automatically identify **unverified bridges** — specific links where no primary source confirms the parent-child relationship — and calculate their **downstream impact**: how many individuals in the report are affected if this bridge fails.

Example from the Women's History report:
- Nassau-Châlon bridge (unverified) → affects Claude de Valois, Anna de Lorraine, and all upstream continental nobility
- Cornstalk-to-Esther (no pre-2008 source) → affects only the Cornstalk claim, but it's the highest-interest item

---

## 6. Output Format Specification

### 6.1 In-App View

Interactive React component with:
- **Section headers** with collapsible methodology panel
- **Filter tabs** by section (e.g., "Direct Line" vs. "Historical"), tier, confidence range
- **Sortable** by ancestral confidence, date, name, tier
- **Expandable cards** per individual: summary → full analysis (chain analysis, significance, connections, bridges, GEDCOM notes)
- **Confidence visualizations**: bars for person/chain, headline number for ancestral
- **Aggregate stats** footer: total candidates, average confidence, duplicate count, source coverage

### 6.2 Exportable Document

Professional document (DOCX/PDF) containing:
- **Cover page**: report title, tree name, date generated, scope description
- **Methodology section**: explains confidence scoring, tier definitions, what the numbers mean
- **Executive summary**: top findings, key figures, critical flags
- **Individual profiles**: one per page or section, with all analysis fields
- **Appendix A**: unverified bridges and their downstream impact
- **Appendix B**: GEDCOM data quality issues found during this report
- **Appendix C**: recommended research actions, prioritized by impact

### 6.3 Shareable Link

Read-only HTML view (per existing single-user + read-only sharing model) with the same interactive features as the in-app view.

---

## 7. Natural Language Report Interface

### 7.1 Query Parsing

The system accepts natural language queries and maps them to report parameters:

```
User: "Show me notable women for Women's History Month"
→ Report type: Notable Women
→ Scope: full tree
→ Section split: direct line + historical
→ AI depth: Standard

User: "Who are my weakest links on my mother's side?"
→ Report type: Weakest Links
→ Scope: maternal branch only
→ AI depth: Quick (no web search needed for confidence scoring)

User: "Find everyone who came from Germany"
→ Report type: Immigration Stories
→ Filter: birth_place contains Germany/Bavaria/Prussia/Saxony/etc.
→ AI depth: Standard (research immigration corridors)

User: "Compare my Calhoun line to my Luman line"  
→ Report type: Branch Comparison
→ Targets: Calhoun surname branch vs. Luman surname branch
→ AI depth: Standard
```

### 7.2 Clarification Flow

When a query is ambiguous, the system asks targeted follow-up questions before generating:

```
User: "Show me my Scottish ancestors"
System: "I found 305 individuals with Scottish birth places. Would you like:
  □ All 305 (estimated cost: $3.05–$9.15, 15–40 min)
  □ Only direct-line ancestors from Scotland (23 individuals)
  □ Only titled/notable Scottish ancestors (18 individuals)
  □ Quick overview with no AI research (free, instant)"
```

---

## 8. Integration Points

### 8.1 With Existing Phase 1 Features

| Feature | Integration |
|---------|-------------|
| **Parser** | Report engine uses the same parsed GEDCOM data model. No re-parsing. |
| **Tree Navigator** | "Generate Report" button on any person or branch. Click-through from report cards to person detail panel. |
| **Person Detail Panel** | Report findings feed back as annotations on individual profiles. |
| **Health Dashboard** | Data Quality report is an expanded version of the dashboard's health metrics. |

### 8.2 With AI Research Engine (Modes 1–3)

| Mode | Report Usage |
|------|-------------|
| **Mode 1: Quick Plausibility** | Default for cost-sensitive reports. ~$0.003/person. Batch-friendly. No web search. Checks dates, places, titles against AI knowledge. |
| **Mode 2: Standard Validation** | Default for most reports. ~$0.01–$0.03/person. Web search via Anthropic tool use. Era-specific repository strategies. Pre-generated research questions. |
| **Mode 3: Deep Research Agent** | User-requested for high-priority individuals. ~$0.05–$0.15/person. Multi-turn agentic loop. 3–5 research rounds per person. |

### 8.3 With Phase E Engines

| Engine | Report Integration |
|--------|-------------------|
| **Deep Scanner** | Branch analysis results feed into Weakest Links and Source Coverage reports. |
| **Story Paths** | Notable ancestor detection feeds directly into Story Paths reports. |
| **Bridge Detector** | Consecutive weak-edge identification is the core of the Unverified Bridges report. |
| **Impact Scorer** | Research priority scores help the report engine recommend where to focus effort. |

### 8.4 With Era/Location Context Engine

Every person scored in a report receives era/location tags (e.g., `us_antebellum`, `scotland_opr`, `medieval_europe`) that determine which repositories and record types the AI research mode targets. This ensures that when the report recommends "verify this link," it also tells you *where* and *how* to verify it.

---

## 9. Data Privacy & Living Persons

- Living persons (no death date, birth date < 100 years ago) are included in direct-line reports only with the tree owner's explicit scope selection
- Living persons are never included in shared/exported reports
- Living person cards show relationship role (e.g., "Mother") but suppress birth place, occupation, and other identifying details in exports
- The user can toggle "include living persons" per report, with a privacy warning

---

## 10. Implementation Phasing

### Phase R1 (MVP — ship with or shortly after Phase 1)
- 3 report types: Notable Women, Notable Men, Data Quality Dashboard
- In-app view only (no export)
- Mode 1 (quick plausibility) AI only
- Basic confidence scoring (person + chain + ancestral)
- Cost estimation and approval gate

### Phase R2 (Post Phase 1)
- Full report catalog (all types listed in §3.1)
- Mode 2 (standard validation) AI support
- Export: Markdown + HTML
- Natural language query interface
- Bridge impact analysis

### Phase R3 (With Phase E engines)
- Mode 3 (deep research) for individual deep-dives from within reports
- DOCX/PDF professional export
- Shareable links
- Custom report builder
- Report history and comparison (re-run a report after GEDCOM changes to see what improved)

---

## 11. Open Questions

1. **Report caching**: Should generated reports be stored and re-displayable, or regenerated each time? Storage is cheaper but the GEDCOM may have changed since last generation. Recommendation: store with a "stale" indicator if GEDCOM has been modified since generation.

2. **Batch vs. streaming**: Should the user see results as they arrive (streaming card-by-card) or wait for the complete report? Recommendation: streaming for in-app view (progressive rendering), complete-then-display for exports.

3. **Cross-report linking**: Should reports reference each other (e.g., a Notable Women report linking to the Weakest Links report for the same individuals)? Recommendation: yes, via shared individual IDs, but defer to Phase R2.

4. **Community report templates**: Should users be able to create and share custom report definitions? Recommendation: defer to post-R3, evaluate demand.

5. **Comparison reports**: Should the system support "diff" between two report runs (e.g., "what changed in my Notable Women report after I fixed the Nassau bridge")? Recommendation: Phase R3, tied to report history.

---

## 12. Success Metrics

- **Adoption**: % of active users who generate at least one report within 30 days of import
- **Completion**: % of started reports that complete (not abandoned at cost approval stage)
- **Research action rate**: % of users who act on a report's recommended research actions
- **Export rate**: % of reports exported (indicates perceived value beyond casual browsing)
- **Re-run rate**: % of reports re-run after GEDCOM modifications (indicates the feedback loop is working)
- **Confidence improvement**: Average ancestral confidence delta between first and subsequent report runs on the same tree

---

*This specification was developed from the Women's History Month prototype analysis of the Daniel Family Tree GEDCOM (6,215 individuals, 3,693 families, 19 generations). The prototype demonstrated all five pipeline stages and validated the three-metric confidence scoring methodology against real data.*
