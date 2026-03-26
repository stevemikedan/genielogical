# GenieLogical — Research Assistant Chat Panel

**Date:** March 26, 2026
**Scope:** Phase E addition (or Phase 2 if Phase E scope is already full)
**Depends on:** Phase D (person detail panel), Phase E (AI agent modes, era context engine)
**Purpose:** A context-aware chat interface for conversational tree exploration, guided research, and natural-language source input.

---

## Why a Chat — and Why It's Not the Primary UI

The structured UI (tree navigator, person detail, health dashboard, story cards) handles known workflows: inspect a person, add a source, review a flag, view a proof ladder. These are button-and-form interactions and they should stay that way.

The chat handles what structured UI can't:

- **Exploratory questions** the user doesn't know how to frame as a button click: "Are there any interesting patterns in my German ancestors?" / "Which of my lines might connect to the American Revolution?" / "Is there anything weird about my Cunningham branch?"
- **Natural-language research** where the user describes what they're investigating and the AI conducts a multi-step search: "Help me figure out who Hugh McRee's parents actually were" / "I think two of my ancestors might be the same person — can you compare them?"
- **Conversational source entry** where the user describes a document they found and the AI structures it: "I found on FamilySearch that Joseph Gibson married Mary McRee on 16 Dec 1789 in Cabarrus County" → parsed into a Source object.
- **Historical context** the user wants explained, not just displayed: "Why does the Devereux connection matter?" / "What was the Battle of Sheriffmuir?" / "Explain the Huguenot migration."

The chat is a research partner, not a command line. It doesn't replace any existing UI — it augments it.

---

## Architecture

### Panel Position

Right-side slide-in panel, same position as person detail. They can't both be open simultaneously — clicking a person closes chat and opens detail; opening chat closes detail. Alternatively, chat could be a bottom drawer that coexists with the detail panel. Decision deferred to UI implementation.

The chat panel has:
- Message history (scrollable)
- Input field with send button
- Context indicator showing what the chat currently "sees" (selected person, active view, etc.)
- Cost tracker (running total for the session)
- "Import finding" buttons on AI responses that contain structured data

### Context Injection

Every user message is augmented with current app context before being sent to the API. The user never sees this — it's injected by the app:

```typescript
interface ChatContext {
  // What's currently visible/selected in the app
  selectedPersonId: string | null;
  activeView: "tree" | "health" | "deep_scan" | "priorities";
  
  // Tree summary (always included, ~200 tokens)
  treeSummary: {
    totalPeople: number;
    totalGenerations: number;
    subjectName: string;
    branchCount: number;
    topNotableAncestors: { name: string; category: string; gen: number }[];
    topFlags: { title: string; severity: string }[];
    overallHealthScore: number;
  };
  
  // Selected person detail (included when a person is selected, ~300 tokens)
  selectedPersonContext: {
    name: string;
    dates: string;
    places: string;
    tier: number;
    parents: { name: string; tier: number }[];
    children: { name: string }[];
    flags: { title: string; severity: string }[];
    sources: { title: string; sourceClass: string }[];
    onNotablePaths: string[];  // Notable ancestor names this person connects to
  } | null;
  
  // Recent chat history (last 10 messages, for conversational continuity)
  recentMessages: { role: "user" | "assistant"; content: string }[];
}
```

### System Prompt

```
You are a genealogical research assistant integrated into a family tree application 
called GenieLogical. You have access to the user's tree data through context provided 
with each message.

YOUR CAPABILITIES:
1. Answer questions about the user's tree using the context provided.
2. Search the web for genealogical records and historical information.
3. Suggest structured actions the user can take in the app.
4. Parse natural-language descriptions of sources into structured data.

BEHAVIOR RULES:
- Be direct and specific. Don't hedge or pad responses.
- When you find something, cite the source with a URL.
- When you can't find something, say so clearly — don't fabricate records.
- When the user describes a source they found, parse it into structured fields 
  and present it for confirmation (don't add it silently).
- When you identify an issue with the tree, explain what's wrong AND what to do about it.
- Keep responses concise. The chat panel is narrow — walls of text are unusable.
- Use markdown sparingly: bold for names and emphasis, but no headers or bullet lists 
  unless listing multiple findings.

CURRENT TREE CONTEXT:
{treeSummary}

CURRENTLY SELECTED PERSON:
{selectedPersonContext or "None — user is viewing the tree overview"}

CONVERSATION HISTORY:
{recentMessages}
```

### Tool Configuration

The chat always has web search available:

```typescript
const chatApiCall = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 2048,  // Shorter than research modes — chat responses should be concise
  system: buildChatSystemPrompt(context),
  tools: [
    { type: "web_search_20250305", name: "web_search" }
  ],
  messages: buildChatMessages(context, userMessage)
};
```

---

## Interaction Patterns

### Pattern 1: Tree Questions (No Search)

User: "How many generations deep is my German line?"

The AI answers from the injected tree context. No web search needed. Cost: ~$0.003.

Response example:
> Your German ancestors are concentrated in the **Burkhart/Bosch** branch through your maternal grandfather's line. It reaches 17 generations to **Blasius Bosch** (b. ~1500, Wambach, Baden). You have about 98 ancestors in this branch — it's your shallowest. The deepest German-origin ancestor is **Heinrich Weiler** (b. ~1595).

### Pattern 2: Research Questions (With Search)

User: "Can you find any records for my ancestor Thomas McKenzie born 1709 in Orkney?"

The AI uses web search to look for actual records. Cost: ~$0.01-0.03.

Response example:
> I searched for Thomas McKenzie in Orkney records. Here's what I found:
> 
> **Found:** A "Thomas Mackenzie" appears in the Orkney OPR baptism index on ScotlandsPeople for the parish of Westray, consistent with the Traill connection in your tree. [URL]
> 
> **Not found:** No NC colonial land grant naming a daughter Ann, which is the key record needed to confirm the McKenzie-to-MacKenzie bridge in your tree.
>
> **Next step:** The Orkney Archives in Kirkwall hold pre-1733 baptism records for Westray parish. This would be the primary source to confirm Thomas's parentage.
>
> [Import as research note ↗]

The "Import as research note" button creates a `ResearchStep` or `Source` attached to Thomas McKenzie.

### Pattern 3: Natural-Language Source Entry

User: "I just found on FamilySearch a marriage record — Joseph Gibson married Mary McRee on December 16, 1789 in Cabarrus County, North Carolina."

The AI parses this into a structured Source and presents it for confirmation:

> I've parsed that into a source record:
>
> | Field | Value |
> |---|---|
> | **Title** | Marriage of Joseph Gibson and Mary McRee |
> | **Type** | Church register / vital record |
> | **Class** | Primary |
> | **Date** | 16 Dec 1789 |
> | **Place** | Cabarrus County, North Carolina |
> | **Repository** | FamilySearch |
> | **Proves** | Marriage (Joseph Gibson + Mary McRee) |
> | **Attach to** | Joseph Gibson, Mary Hannah McCree, and their marriage edge |
>
> [Add this source ✓] [Edit before adding ✎] [Cancel ✕]

Clicking "Add this source" dispatches an `ADD_SOURCE` action to the reducer with all fields pre-filled. The confidence scorer re-runs. If this is the first primary source on the edge, the user sees the tier upgrade in real time.

### Pattern 4: Comparative Analysis

User: "I have two Mary Hannah McCrees in my tree. Are they the same person?"

The AI pulls both records from context and compares:

> Your tree has two entries for **Mary Hannah McCree**:
>
> **Entry 1:** b. 1770, Armagh, Ulster, Ireland → d. 1830, Haywood, NC. Parents: Finlay McRae + unknown (via family @F1761@)
> **Entry 2:** b. 1770, Armagh, Ulster, Ireland → d. 1830, Haywood, NC. Parents: Hugh I McRee + unknown (via family @F2314@)
>
> These are almost certainly the same person — identical name, birth year, birthplace, death year, death place. The difference is the parent chain: one routes through Finlay McRae (b. 1741) → Farquhar MacRae, the other through Hugh I McRee (b. 1708) → Finlay McRae (b. 1722).
>
> The second path has an impossible date: Finlay born 1722 cannot father Hugh born 1708. I'd recommend merging these into one entry using the first parent chain, and flagging the McRee path for correction.
>
> [Mark as duplicate ↗] [Open comparison view ↗]

### Pattern 5: Historical Context

User: "Tell me about the Battle of Sheriffmuir and how my ancestors were involved."

The AI uses web search for historical context, then connects it to tree data:

> The **Battle of Sheriffmuir** (13 November 1715) was fought between Jacobite forces under the Earl of Mar and government troops under the Duke of Argyll, during the first major Jacobite rising after the Hanoverian succession.
>
> Your tree connects to this battle through the **MacRae of Inverinate** line. According to the 1899 *History of the Clan MacRae*, the MacRaes and Mathesons held their ground at Sheriffmuir when the rest of Seaforth's men fled — and tradition says the battle made 58 widows in Kintail.
>
> Your ancestor **Hugh MacRae of Inverinate** (Gen 12) was wounded at the battle and appears on a list of "Gentlemen Prisoners" taken to Stirling the following day. He was removed to Perth to recover before returning home to Sallachy.
>
> This is documented in the published clan history, making it one of the stronger connections in your tree.

---

## Structured Action Buttons

When the AI's response contains actionable findings, the app renders inline action buttons. These are NOT rendered by the AI — they're detected by the app's response parser and injected into the chat UI.

### Detection Rules

```typescript
interface ChatAction {
  type: 
    | "import_source"        // AI described a specific source
    | "open_person"          // AI mentioned a person by name/ID
    | "mark_duplicate"       // AI identified duplicate entries
    | "create_flag"          // AI identified a new issue
    | "create_conjecture"    // AI proposed a hypothesis
    | "add_research_step"    // AI suggested a specific next step
    | "run_deep_research"    // AI recommended Mode 3 research
    ;
  label: string;
  data: Record<string, unknown>;  // Payload for the action
}

function extractActionsFromResponse(
  response: string, 
  context: ChatContext
): ChatAction[] {
  const actions: ChatAction[] = [];
  
  // Detect source descriptions (structured table or key details)
  if (containsSourceDescription(response)) {
    actions.push({
      type: "import_source",
      label: "Add this source",
      data: parseSourceFromResponse(response)
    });
  }
  
  // Detect person name mentions that match tree data
  const mentionedPeople = findMentionedPeople(response, context);
  for (const person of mentionedPeople) {
    actions.push({
      type: "open_person",
      label: `View ${person.name}`,
      data: { personId: person.id }
    });
  }
  
  // Detect duplicate identification language
  if (containsDuplicateAnalysis(response)) {
    actions.push({
      type: "mark_duplicate",
      label: "Mark as duplicate",
      data: extractDuplicatePair(response)
    });
  }
  
  // Detect research recommendations
  if (containsResearchRecommendation(response)) {
    actions.push({
      type: "add_research_step",
      label: "Add to research list",
      data: parseResearchStep(response)
    });
  }
  
  return actions;
}
```

### Rendering

Actions appear as pill buttons below the AI's message:

```
[Add this source ✓] [View Thomas McKenzie ↗] [Add to research list +]
```

Clicking an action opens the appropriate confirmation dialog (for mutations) or navigates (for navigation). The chat stays open.

---

## Conversation Memory

### Within a Session

Full conversation history is maintained in React state. The last 10 messages are included in context for each API call (to maintain conversational flow without exploding token costs).

### Across Sessions

Chat history is NOT persisted to IndexedDB by default. Conversations are ephemeral research sessions. However, any **actions taken** (sources added, flags created, research steps noted) ARE persisted through the normal reducer → IndexedDB flow.

Rationale: Chat history is bulky, often repetitive, and not useful to replay. What matters is the outcomes — the sources discovered, the issues identified, the conjectures formed. Those are captured through the action system. If users want to save a conversation for reference, offer a "Save as research note" button that attaches the conversation text to a person as a free-text note.

---

## Cost Management

### Per-Message Estimation

| Message Type | Estimated Cost | Tokens In | Tokens Out |
|---|---|---|---|
| Tree question (no search) | $0.002-0.005 | ~800 (context + question) | ~300 |
| Research question (1-2 searches) | $0.01-0.03 | ~800 + search results | ~500 |
| Source parsing | $0.003-0.005 | ~600 | ~400 |
| Historical context (1-3 searches) | $0.01-0.04 | ~800 + search results | ~800 |
| Complex comparison | $0.005-0.01 | ~1200 (two person contexts) | ~600 |

### Display

- Running session cost shown in the chat panel header: "Session: $0.12"
- Per-message cost shown as a subtle label on each AI response: "~$0.02"
- If the user hasn't set an API key, the chat panel shows a setup prompt instead of the input field

### Budget Guard

Optional setting: "Warn me when session cost exceeds $___" (default: $0.50). When triggered, the chat shows a yellow banner: "You've spent ~$0.50 in this session. Continue?" This prevents runaway costs from enthusiastic research sessions.

---

## What the Chat Does NOT Do

1. **Does not modify the tree without confirmation.** Every mutation (add source, change status, merge duplicate, create flag) requires the user to click a confirmation button. The AI suggests; the user acts.

2. **Does not replace the structured person detail panel.** Changing a person's status, adding a source through the form, reviewing flags — these are all better as direct manipulation in the panel. The chat is for exploration and discovery, not routine data entry.

3. **Does not replace the batch operations.** "Scan all my Tier 4 ancestors" is a batch Mode 1 operation, not a chat conversation. The chat might suggest running a batch scan, but it doesn't execute one message-by-message.

4. **Does not have memory across sessions.** Each chat session starts fresh. The tree data provides continuity — not conversation history.

5. **Does not hallucinate sources.** The system prompt is explicit: if you can't find a record, say so. Don't invent census entries or fabricate citations. The structured response parsing should flag any "source" that doesn't have a URL.

---

## Implementation

### New Files

| File | Purpose |
|---|---|
| `src/ai/chat/chat-context.ts` | Build context object from current app state |
| `src/ai/chat/chat-prompt.ts` | System prompt + message construction |
| `src/ai/chat/action-parser.ts` | Extract structured actions from AI responses |
| `src/ai/chat/chat-session.ts` | Session state management (messages, cost tracking) |
| `src/components/research/ChatPanel.tsx` | Main chat UI component |
| `src/components/research/ChatMessage.tsx` | Individual message rendering (user/assistant) |
| `src/components/research/ChatActions.tsx` | Action button rendering and dispatch |
| `src/components/research/ChatInput.tsx` | Input field with send button |
| `src/components/research/ChatCostTracker.tsx` | Session cost display |

### Modified Files

| File | Changes |
|---|---|
| `src/App.tsx` | Add chat panel toggle, manage chat vs. detail panel state |
| `src/context/tree-state.ts` | No changes — chat actions dispatch existing action types |
| `src/ai/ai-client.ts` | Add `sendChatMessage()` method using existing tool-use infrastructure |

### Phase Placement

**Option A — Part of Phase E:** If scope allows, include the basic chat (Patterns 1-3) in Phase E alongside the structured AI modes. Pattern 4 (comparative analysis) and Pattern 5 (historical context) can follow.

**Option B — Phase 2:** If Phase E is already full with the three research modes + deep scanner + story paths + bridge detector + impact scorer, defer the chat to Phase 2. The structured modes deliver core value without the chat. The chat is highest-value as an enhancement layer on top of working research infrastructure.

**Recommendation: Option B.** The structured modes (Quick Check, Validation, Deep Research) are the foundation. They produce importable, cacheable, reproducible results. The chat is the conversational layer that makes those results discoverable and approachable. Build the engine first, then build the conversational interface on top of it.

---

## Example Session

```
User: "I just imported my tree. What's interesting about it?"

AI: Your tree has 5,720 people across 46 generations. The deepest path 
reaches Lambert of Hesbaye (~700 AD) through a Charlemagne descent. 

Your richest branch is through your maternal grandmother — 1,066 ancestors 
including connections to Welsh princes and French nobility. Your shallowest 
is the Bossung/Hoffman German line at 98 ancestors.

The health dashboard flagged 23 critical issues, mostly chronological 
impossibilities in the deep medieval paths. There are also 2 probable 
duplicate entries.

Want me to walk through the notable ancestors, or should we look at the 
flagged issues first?

[View Health Dashboard ↗] [View Deep Scan ↗]
```

```
User: "What notable ancestors do I have?"

AI: Your tree contains several historically significant figures:

**Strongest connections:**
- **Chief Cornstalk** (Shawnee, d. 1777) — 9 generations, medium confidence
- **Rev. William Guthrie** (Covenanter author, 1620–1665) — 12 generations
- **Sir William Cunningham**, Lord High Chancellor of Scotland — 14 generations

**Through deeper paths (need verification):**
- **Robert Devereux, 2nd Earl of Essex** (Elizabeth I's favorite) — 14 gen
- **Charlemagne** — 43 generations through the Stewart/Traill/Orkney line
- **Sir Richard Lygon, Knight Templar** — 19 generations
- **Fulk V of Anjou, King of Jerusalem** — 32 generations

The Cornstalk and Guthrie connections are the most compact and verifiable. 
The Charlemagne path is long but passes through well-documented Scottish 
nobility. Want me to research any of these?

[View Story Cards ↗] [Research Cornstalk path ↗] [Research Guthrie path ↗]
```

```
User: "I found a marriage record on Ancestry — Gibson, Samuel married 
Blacke, Jane in 1813, Burke County NC, bondsman John Black"

AI: Great find! I've parsed this as:

**Source:** Marriage bond — Samuel Gibson & Jane Black, 1813, Burke County NC
**Type:** Court record (marriage bond)
**Class:** Primary (created at time of event)
**Proves:** Marriage of Samuel Gibson + Jane Black
**Attach to:** Rev. Samuel Baxter Gibson + Elizabeth Jane Black Gibson, 
and their marriage edge

This confirms the Gibson-Black marriage in your tree. If Rev. Samuel Baxter 
Gibson is the same Samuel Gibson in this bond, it also provides a dated 
anchor for his presence in Burke County by 1813.

Note: The bondsman "John Black" is likely Jane's father or brother — 
bondsmen were typically close male relatives of the bride. Your tree lists 
a John Black (b. ~1757) as Jane's father, which fits perfectly.

[Add this source ✓] [Edit before adding ✎]
```
