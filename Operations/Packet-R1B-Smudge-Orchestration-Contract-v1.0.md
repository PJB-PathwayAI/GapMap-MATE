# Packet R1-B — Smudge Orchestration Contract

**Operation:** PROOF — Human Test Readiness Gate R1  
**Packet:** R1-B — Smudge Orchestration Contract  
**Authority:** DESIGN / CONTRACT ONLY — No implementation, no deployment, no schema changes  
**Date:** 18 August 2026  
**Author:** Ash (Chief Engineer)  
**Governing metaphor:** Smudge is the conductor, not the orchestra.  

---

## Classification Key

- **LOCKED** — inherited from proven doctrine (Packets 1–2, Experience Blueprint, Commander's Intent)  
- **PROPOSED** — R1-B design recommendation  
- **UNKNOWN** — requires implementation/runtime proof  

---

## A. Smudge Orchestration Architecture

### Conceptual Flow

```
Human → Chat.jsx (thin) → smudgeOrchestrator (backend) → Appropriate Engine → Structured Result → smudgeOrchestrator → Chat.jsx → Human
                                    ↑                          ↑
                              LLM (server-side)          Engine contract
                              interpret + generate       (unchanged)
```

### Architecture

**Chat.jsx (thin client)** [LOCKED — Paul's directive §4]

Chat.jsx provides:
- Authenticated user/session context
- Current user message (raw text)
- Bounded conversation context (from localStorage)

Chat.jsx receives:
- Smudge response text
- Current canonical phase
- Whether state changed
- Optional UI cue
- Optional recoverable error state

Chat.jsx does NOT contain: lifecycle logic, engine-selection rules, OCI reasoning, evidence rules, LLM system doctrine, or duplicated backend contracts. [LOCKED]

**smudgeOrchestrator (new backend function)** [PROPOSED]

A single new backend function that:
1. Establishes authenticated profile context (calls profileBootstrap)
2. Reads canonical lifecycle state (UserProfile.get → tos_phase)
3. Receives user expression + bounded conversation context
4. Uses LLM to interpret expression (extract candidate discoveries, classify intent, detect safety)
5. Routes to the appropriate engine based on tos_phase [LOCKED — lifecycle drives routing]
6. Constructs and invokes the engine action per its locked contract
7. Handles engine success/rejection without bypassing it [LOCKED]
8. Uses LLM to convert engine result into conversational response
9. Returns response + bounded UI metadata to Chat.jsx

**LLM (server-side, behind orchestration boundary)** [LOCKED — Paul's directive §6]

The LLM sits inside smudgeOrchestrator, not in Chat.jsx. It is called twice per turn:
1. **Interpret** — natural language → structured candidate data
2. **Generate** — engine output → natural language Smudge response

The LLM is a tool used by the orchestrator. It does not own state. It does not persist. It does not decide. [LOCKED]

**Engines (unchanged)** [LOCKED — Packet 1 & 2 contracts]

All five engines remain exactly as deployed. The orchestrator calls them through their existing action interfaces. No engine is modified, expanded, or bypassed.

### Key Architectural Rules

1. The orchestrator is routing, not authority. [LOCKED — §2]
2. The orchestrator may not become a sixth decision engine. [LOCKED — §2]
3. Chat.jsx is thin. All intelligence lives server-side. [LOCKED — §4]
4. The LLM sits behind the orchestration boundary, not in the browser. [LOCKED — §6]
5. tos_phase drives engine selection. Conversation does not drive lifecycle. [LOCKED — §9]
6. The individual experiences one continuous companion, not seven different bots. [LOCKED — §9]

---

## B. Authority Boundary Matrix

### Human Owns [LOCKED — §3]

| Authority | Description |
|-----------|-------------|
| Their story | What they share, how they share it, when they share it |
| Their goals | What they want to achieve |
| Their preferences | What matters to them |
| Their evidence | What they have done, proven by their own expression |
| Confirmation of operational picture | Whether the reflected picture is correct |
| Their decisions | Whether to proceed, what direction, when to act |
| Whether direction feels appropriate | Whether a suggested pathway resonates |
| Whether active MATE support is still required | Whether to conclude the partnership |

### Smudge (Orchestrator) May [LOCKED — §3]

| Authority | Description |
|-----------|-------------|
| Listen | Receive user expression without judgment |
| Ask | Pose questions to deepen understanding |
| Clarify | Check interpretation against what was meant |
| Reflect | "Can I tell you what I'm hearing?" |
| Summarise | Condense what has been shared |
| Identify candidate discoveries | Extract structured information from user expression |
| Maintain conversational context | Bounded recent messages for continuity |
| Inspect authorised profile/lifecycle context | Read tos_phase, profile state, engine results |
| Determine which engine is relevant | Route based on tos_phase |
| Propose a valid engine action | Construct action per engine contract |
| Invoke an engine where contract permits | Call engine through action interface |
| Interpret structured results conversationally | Convert engine output to natural language |
| Explain uncertainty | "I'm not sure I've got that right yet" |
| Ask for explicit confirmation where required | "Does that sound like you?" |
| Signpost when appropriate | Direct to external resources/services |

### Smudge Must NOT [LOCKED — §3]

| Prohibition | Rationale |
|-------------|-----------|
| Invent evidence | Evidence Rule (LOCKED) |
| Silently create facts about the user | Understand Before Advising (LOCKED) |
| Infer an explicit decision the user did not express | User Decides (LOCKED) |
| Write tos_phase directly | Canonical lifecycle ownership (LOCKED) |
| Bypass engine preconditions | Packet 1 ownership (LOCKED) |
| Bypass ownership controls | Packet 1 ownership (LOCKED) |
| Manufacture evidence_ref | Evidence Rule (LOCKED) |
| Treat engine output as a user decision | User Decides (LOCKED) |
| Mark an individual CONFIRMED, READY_TO_ACT, IN_TRANSITION or SETTLED independently | Lifecycle ownership (LOCKED) |
| Turn lifecycle progression into a target | Commander's Intent (LOCKED) |
| Pressure the user to progress | Walk beside, don't carry (LOCKED) |
| Equate successful transition with employment | Commander's Intent (LOCKED) |
| Override deterministic engine rejection | Engine authority (LOCKED) |

### LLM May [LOCKED — §6]

| Authority | Description |
|-----------|-------------|
| Interpret natural language | Extract meaning from user expression |
| Extract candidate structured information | Identify potential discoveries |
| Classify conversational intent | Determine what the user is doing (answering, correcting, confirming, rejecting) |
| Identify ambiguity | Flag uncertain interpretations |
| Propose clarification questions | Suggest what to ask next |
| Convert structured engine output into natural language | Generate Smudge's response |
| Maintain Smudge's tone and conversational continuity | Warm, grounded, walk-beside |

### LLM May NOT [LOCKED — §6]

| Prohibition | Rationale |
|-------------|-----------|
| Become the authoritative data store | UserProfile is the single source of truth |
| Determine persisted lifecycle state | Engines own lifecycle transitions |
| Override deterministic validation | Engine authority |
| Invent missing evidence | Evidence Rule |
| Fabricate engine results | Engine authority |
| Convert ambiguity into confirmation | User Decides |
| Claim an engine action succeeded unless the engine returned success | Engine authority |

### Engines Own [LOCKED — Packets 1 & 2]

| Engine | Owns |
|--------|------|
| companionService | EXPLORING→CONFIRMING, CONFIRMING→CONFIRMED transitions |
| engineCapabilityIntelligence | CONFIRMED→EVALUATING transition, capability validation |
| engineDecisionReadiness | EVALUATING→READY_TO_ACT transition, soak period, pathway matching |
| engineTransitionPartnership | READY_TO_ACT→IN_TRANSITION, IN_TRANSITION→SETTLED transitions, journey management |
| engineUnderstanding | Assessment only (no lifecycle writes) |

### UI (Chat.jsx) Owns [LOCKED — §4]

| Authority | Description |
|-----------|-------------|
| Render Smudge response | Display text to user |
| Render current phase indicator | Display tos_phase (if shown) |
| Send user message | Pass raw text + context to orchestrator |
| Send explicit UI action (optional) | Pass button signal to orchestrator |
| Persist conversation to localStorage | Client-side continuity (proven, accepted) |

---

## C. Proposed Orchestrator Request/Response Contract

### Request (Chat.jsx → smudgeOrchestrator) [PROPOSED]

```typescript
POST /api/functions/smudgeOrchestrator

{
  // Authentication
  user_id: string,               // authenticated user ID (from Base44 auth context)

  // User expression
  user_message: string,          // raw user message text

  // Conversation continuity
  conversation_context: Array<{
    role: 'user' | 'smudge',
    content: string,
    timestamp: string
  }>,                             // bounded recent messages (max 10) from localStorage

  // Optional explicit UI signal
  explicit_action?: string        // 'confirm' | 'start_journey' | 'conclude' | null
}
```

### Response (smudgeOrchestrator → Chat.jsx) [PROPOSED]

```typescript
{
  // Conversational response
  response_text: string,          // Smudge's natural language response

  // Lifecycle state
  phase: string,                  // current tos_phase (canonical, from UserProfile)
  state_changed: boolean,         // did lifecycle state change this turn?

  // Optional UI cues
  ui_cue?: string,                // 'show_confirm_button' | 'show_start_button' | 'show_conclude_button' | null

  // Error handling
  error?: {
    type: 'llm_unavailable' | 'engine_timeout' | 'engine_rejected' | 'stale_state' | 'unexpected_error',
    message: string,              // user-safe error description
    retry_recommended: boolean
  }
}
```

### Contract Rules [PROPOSED]

1. Chat.jsx sends exactly this contract. Nothing more, nothing less.
2. Chat.jsx does not interpret `phase` to make decisions. It may display it.
3. Chat.jsx does not interpret `ui_cue` to drive lifecycle. It may show a button if cued.
4. If `explicit_action` is provided, the orchestrator validates it against the current tos_phase before acting. If the action is not valid for the current phase, the orchestrator ignores it and responds naturally.
5. `error` is always recoverable. The user's lifecycle state is never corrupted by an error.

---

## D. LLM Structured Output Contract

### LLM Call 1: Interpret [PROPOSED]

**Input to LLM:**
```typescript
{
  system_prompt: string,          // Smudge persona + current phase behavioural intent
  user_message: string,           // raw user message
  conversation_context: array,    // bounded recent messages
  profile_context: {              // bounded profile summary (NOT full profile)
    tos_phase: string,
    areas_explored: string[],
    areas_outstanding: string[],
    capability_count: number,
    journey_active: boolean,
    partnership_state: string | null
  },
  phase_behavioural_intent: string // what Smudge is trying to do in this phase
}
```

**Required output from LLM (validated by deterministic code):**
```typescript
{
  // Candidate discoveries
  candidate_discoveries: Array<{
    field: string,                // UserProfile field name (e.g., 'professional_identity', 'service_branch')
    value: string,                // extracted value
    source_type: 'direct_statement' | 'reasonable_interpretation' | 'uncertain',
    source_text: string,          // user's actual words that led to this extraction
    confidence: 'high' | 'moderate' | 'low'
  }>,

  // Conversational intent
  intent: 'answering' | 'correcting' | 'asking_question' | 'seeking_reassurance' | 'expressing_frustration' | 'sharing_milestone' | 'reporting_blocker' | 'other',
  user_response_type: 'answering' | 'correcting' | 'confirming' | 'rejecting' | null,

  // Confidence and ambiguity
  interpretation_confidence: 'high' | 'moderate' | 'low',
  ambiguity_flag: boolean,
  clarification_needed: string | null,   // question to ask if ambiguous

  // Safety
  safety_flag: boolean,                  // true if distress/crisis indicators detected
  safety_category: string | null         // 'self_harm' | 'crisis' | 'bereavement_distress' | null
}
```

**Validation by deterministic code:** [PROPOSED]
1. If `safety_flag === true` → orchestrator does NOT call any engine. Proceeds to safety response path (§13).
2. If `ambiguity_flag === true` → orchestrator does NOT call any engine. Smudge asks the clarification question.
3. If `user_response_type === 'confirming'` → deterministic code checks `interpretation_confidence === 'high'` AND `ambiguity_flag === false`. If either fails, downgrade to 'answering'.
4. `candidate_discoveries` with `source_type === 'uncertain'` → NOT passed to engine. Smudge confirms with user first.
5. If LLM output does not match schema → retry once with stricter instruction. If still invalid → graceful failure (§15).

### LLM Call 2: Generate [PROPOSED]

**Input to LLM:**
```typescript
{
  system_prompt: string,          // Smudge persona + tone guidelines
  engine_result: object,          // structured engine response (or null if no engine called)
  flow_guidance: object | null,    // companionService flow_guidance (or null)
  phase_behavioural_intent: string,
  conversation_context: array,    // bounded recent messages
  user_message: string            // original user message (for continuity)
}
```

**Required output from LLM:**
```typescript
{
  response_text: string,          // natural language Smudge response (max 500 chars)
  tone_check: string              // self-assessed: 'warm' | 'neutral' | 'cautious' | 'signposting'
}
```

**Validation:** [PROPOSED]
1. `response_text` must not exceed 500 characters.
2. `response_text` must not contain lifecycle state assertions the engine did not return (e.g., "You're now confirmed!" if engine did not return CONFIRMED).
3. If `engine_result` contains rejection → `response_text` must acknowledge the limitation, not claim success.
4. If `tone_check === 'signposting'` → orchestrator verifies safety_flag was true. If not, regenerates.

### LLM Boundary Enforcement [LOCKED — §6]

The LLM output is ALWAYS validated by deterministic code before any action is taken. The LLM never directly:
- Writes to UserProfile
- Calls an engine
- Determines tos_phase
- Persists anything

The deterministic orchestration code is the gate between LLM output and engine invocation. [LOCKED]

---

## E. Discovery & Provenance Contract

### Principle [LOCKED — Understand Before Advising]

A candidate discovery must remain traceable to what the individual actually expressed. Smudge should ask rather than silently upgrade uncertain interpretation into fact.

### Discovery Classification [PROPOSED]

| Classification | Definition | Orchestrator Action |
|----------------|------------|---------------------|
| `direct_statement` | User explicitly stated this (e.g., "I was in the infantry for 8 years") | Pass to engine as structured input |
| `reasonable_interpretation` | Strong inference from user expression (e.g., "I led patrols" → leadership capability) | Smudge confirms with user before passing: "It sounds like you've had leadership experience — is that right?" |
| `uncertain` | Weak inference or guess | Smudge asks for clarification. NOT passed to engine. |

### Provenance Structure [PROPOSED]

Every discovery that reaches an engine carries:

```typescript
{
  field: string,            // UserProfile field name
  value: string,            // extracted value
  source_type: string,      // 'direct_statement' | 'reasonable_interpretation'
  source_text: string,      // user's actual words (verbatim or near-verbatim excerpt)
  confidence: string        // 'high' | 'moderate' | 'low'
}
```

### Evidence Audit Trail [LOCKED + PROPOSED]

LOCKED: Every evidence_log entry must trace to a source. [Packet 1 Evidence Rule]

PROPOSED: The `source_text` from the discovery provenance is stored alongside the evidence_log entry. This ensures that when an engine validates evidence, the original user expression is retrievable.

### What This Prevents [LOCKED]

- Smudge cannot invent evidence — every discovery traces to user words
- Smudge cannot upgrade uncertainty to fact — `uncertain` discoveries are never passed to engines
- Smudge cannot silently create facts — `reasonable_interpretation` discoveries are confirmed with the user first
- Later engine evidence remains auditable — source_text is preserved

---

## F. Explicit Decision Contract

### HARD BOUNDARY [LOCKED — §8, §3]

The orchestration layer must distinguish ordinary conversational understanding from explicit user expression. The LLM classifies intent, but the deterministic code enforces the boundary.

### CONFIRMING → CONFIRMED [LOCKED + PROPOSED]

**LOCKED:** companionService requires `user_response_type: 'confirming'` AND `tos_phase === 'CONFIRMING'` AND `readyForConfirmation === true`.

**PROPOSED — LLM classification rules:**

| User says | LLM classifies as | Why |
|-----------|-------------------|-----|
| "Yes, that's me." | confirming (high confidence) | Unambiguous affirmation |
| "That sounds right." | confirming (high confidence) | Clear agreement |
| "That's exactly it." | confirming (high confidence) | Explicit affirmation |
| "Yep, that's it." | confirming (high confidence) | Clear affirmation |
| "Mostly." | answering (not confirming) | Qualified — something is incomplete |
| "I suppose so." | answering (not confirming) | Hesitant — not explicit |
| "I'm not sure about the leadership bit." | correcting | Active correction — needs exploration |
| "I guess." | answering (not confirming) | Non-committal — needs exploration |
| "Yeah, but..." | answering (not confirming) | Qualification follows — needs exploration |

**Deterministic enforcement:** [PROPOSED]

1. LLM returns `user_response_type: 'confirming'` with `interpretation_confidence: 'high'` AND `ambiguity_flag: false`
2. If `interpretation_confidence !== 'high'` OR `ambiguity_flag === true` → downgrade to 'answering'
3. Only if downgraded to 'answering' → Smudge explores the qualification naturally
4. If `explicit_action === 'confirm'` from UI button → treated as high-confidence confirming (user explicitly clicked)

**What Smudge does when the user qualifies:** [PROPOSED]

Smudge does NOT ask "So can I confirm?" (that pressures). Smudge explores the qualification: "What feels off about the leadership bit?" The user's response may resolve the qualification, leading to a clean confirmation later.

### IN_TRANSITION → SETTLED [LOCKED + PROPOSED]

**LOCKED:** engineTransitionPartnership requires `conclude_journey` (summary ≥15 chars) OR `update_partnership_state` (new_state: INDEPENDENT, reason ≥15 chars).

**PROPOSED — Smudge must establish substantive expression of independence:**

The user must substantively express that they no longer require active MATE transition support. This is NOT:
- "I'm doing well" (status update, not independence)
- "Things are going fine" (status update, not independence)
- "Got a job" (employment is not required for settlement)

This IS:
- "I think I'm okay to go on my own now" (explicit independence)
- "I don't think I need this anymore" (explicit independence)
- "I've got a handle on things — I'll reach out if I need to" (explicit independence with door open)

**Smudge's approach:** [PROPOSED]

1. Smudge does NOT initiate settlement. The user must express it.
2. When the user expresses something that sounds like independence, Smudge clarifies: "Are you telling me you're ready to go on without me?" or "It sounds like you're feeling ready to do this on your own — is that right?"
3. Only on explicit confirmation → Smudge proposes `conclude_journey` with the user's own words as the summary.
4. The ≥15-character summary is the user's expression, not Smudge's interpretation.

**What does NOT trigger settlement:** [LOCKED]
- Employment (LOCKED — Commander's Intent: successful transition ≠ employment)
- Open commitments (LOCKED — NOT automatically disqualifying)
- Active blockers (LOCKED — NOT automatically disqualifying)
- Time elapsed since journey start (LOCKED — not a factor)

### General Explicit Decision Pattern [PROPOSED]

For ALL explicit decisions (confirmation, soak initiation/completion, journey start, settlement):

1. User expresses something in conversation
2. LLM classifies intent and confidence
3. If confidence is high and ambiguity is false → orchestrator constructs the engine action
4. If confidence is moderate or ambiguity is true → Smudge clarifies with the user
5. If confidence is low → Smudge does NOT propose the action; continues natural conversation
6. The engine validates the action against its own preconditions (final gate)
7. If the engine rejects → Smudge explains naturally (§I)

**The pattern is always: LLM classifies → deterministic code validates → engine decides. Never: LLM decides.** [LOCKED]

---

## G. Lifecycle Behaviour Matrix

### Principle [LOCKED — §9]

The individual should experience one continuous companion, not seven different bots. Phase influences what Smudge is trying to understand/help with, but must not turn Smudge into a scripted wizard.

tos_phase must come from UserProfile, never from: LLM memory, Chat local state, inferred conversation stage, or hard-coded frontend progress. [LOCKED]

### Behavioural Intent by Phase [PROPOSED]

| Phase | Smudge's Intent | What Smudge Is Doing | What Smudge Is NOT Doing |
|-------|-----------------|---------------------|-------------------------|
| **EXPLORING** | Discover | Listening, asking, building understanding. "Tell me about yourself." Exploring the six areas naturally. No advice. No capability claims. No pathway suggestions. | Advising, suggesting careers, judging, rushing to fill fields |
| **CONFIRMING** | Reflect | "Can I tell you what I'm hearing?" Reflecting the picture back in the user's own language. Awaiting confirmation. Open to correction. | Adding new information, pressuring confirmation, moving to capability |
| **CONFIRMED** | Reveal capability | Transitioning to "what are you actually good at?" Calling capability intelligence. Presenting capabilities as observations, not identity claims. "One capability keeps appearing..." | Inventing capabilities, pressuring identity, claiming "you are a leader" |
| **EVALUATING** | Explore options | Pathways, decision factors, soak period. "Let's see what's out there." Presenting matched pathways as possibilities, not prescriptions. Supporting the user's reflection. | Prescribing a path, rushing the soak, bypassing reflection without reason |
| **READY_TO_ACT** | Prepare for action | "What would you like to do first?" Journey start. Helping the user articulate their first commitment. | Choosing for the user, creating commitments without user expression |
| **IN_TRANSITION** | Walk beside | Recording commitments, blockers, milestones. Ongoing partnership. "How's it going?" Acknowledging setbacks as part of the journey. | Solving problems for the user, pressuring progress, equating success with employment |
| **SETTLED** | Close with dignity | "You've got this." Read-only journey status. Door remains open. "I'm here if things change." | Reopening the journey without user request, pretending the relationship continues at the same intensity |

### SOAKING [LOCKED]

SOAKING is a sub-state of EVALUATING, stored in `soak_period.state`. It is NOT a top-level tos_phase value. [LOCKED — Packet 2B v1.1]

During SOAKING, Smudge's intent is: "Let this settle." Not pushing for action. Available if the user wants to talk. Respecting the reflection period.

### Continuity Principle [LOCKED]

Smudge's personality, warmth, and voice do NOT change between phases. What changes is the intent — what Smudge is trying to help with. The user experiences the same companion throughout, one who naturally shifts focus as understanding deepens.

---

## H. Five-Engine Routing Matrix

### Routing Rule [LOCKED]

tos_phase drives engine selection. The orchestrator reads tos_phase from UserProfile and routes to the appropriate engine. The orchestrator does NOT infer which engine to call from conversation content. [LOCKED — §10]

### Matrix [PROPOSED routing; LOCKED engine contracts]

| tos_phase | Engine | Actions Smudge May Invoke | Preconditions (checked by engine) | Evidence Required | Read-Only / State-Changing | Explicit User Expression Required |
|-----------|--------|--------------------------|----------------------------------|-------------------|---------------------------|----------------------------------|
| EXPLORING | companionService | (implicit — process discoveries) | Active profile | 15-char substance per area | State-changing (EXPLORING→CONFIRMING when ready) | No (auto-advance) |
| CONFIRMING | companionService | (implicit — process discoveries + response type) | tos_phase=CONFIRMING | All areas substantive | State-changing (CONFIRMING→CONFIRMED on confirming) | YES (user_response_type='confirming') |
| CONFIRMED | engineCapabilityIntelligence | validate_preconditions | opc=true, assessment≥MODERATE, branch+history, evidence_log | — | Read-only | No |
| CONFIRMED | engineCapabilityIntelligence | seed_evidence | None (if evidence_log empty) | — | State-changing (populates evidence_log) | No |
| CONFIRMED | engineCapabilityIntelligence | submit_capabilities | Preconditions met; tos_phase in CONFIRMED/EVALUATING | evidence_ref per capability | State-changing (tos_phase→EVALUATING) | No (Smudge submits from user expression) |
| CONFIRMED | engineCapabilityIntelligence | get_capability_picture | Preconditions met | — | Read-only | No |
| CONFIRMED | engineCapabilityIntelligence | advance_phase | Preconditions met, capability_map non-empty | — | State-changing (tos_phase→EVALUATING) | YES (authorisation to begin evaluation) |
| EVALUATING | engineDecisionReadiness | get_status | tos_phase=EVALUATING/READY_TO_ACT, capability_map non-empty | — | Read-only | No |
| EVALUATING | engineDecisionReadiness | record_decision_factor | tos_phase=EVALUATING/READY_TO_ACT | evidence_ref if expressed=true | State-changing (decision_factors) | YES (user expresses priorities) |
| EVALUATING | engineDecisionReadiness | evaluate_pathways | tos_phase=EVALUATING/READY_TO_ACT | — | State-changing (recommended_pathways) | No (algorithmic) |
| EVALUATING | engineDecisionReadiness | initiate_soak | soak_period.state=NOT_STARTED | — | State-changing (soak→SOAKING) | YES (user decides to enter soak) |
| EVALUATING | engineDecisionReadiness | complete_soak | soak_period.state=SOAKING, pathways non-empty, ≥1 factor | reflection_notes ≥15 chars | State-changing (soak→COMPLETED, tos_phase→READY_TO_ACT) | YES (user completes reflection) |
| EVALUATING | engineDecisionReadiness | bypass_soak | soak_period.state=SOAKING, pathways non-empty, ≥1 factor | soak_bypass_reason ≥10 chars | State-changing (soak→BYPASSED, tos_phase→READY_TO_ACT) | YES (user decides to bypass) |
| READY_TO_ACT | engineTransitionPartnership | start_journey | tos_phase=READY_TO_ACT, soak completed/bypassed, capability_map non-empty | — | State-changing (tos_phase→IN_TRANSITION) | YES (user decides to start) |
| IN_TRANSITION | engineTransitionPartnership | get_journey_status | Journey exists | — | Read-only | No |
| IN_TRANSITION | engineTransitionPartnership | record_commitment | Active journey | description (non-empty) | State-changing (appends commitment) | YES (user articulates commitment) |
| IN_TRANSITION | engineTransitionPartnership | update_commitment | Active journey, commitment exists | — | State-changing (updates status, auto-checkpoint) | YES (user updates status) |
| IN_TRANSITION | engineTransitionPartnership | record_blocker | Active journey | blocker (non-empty) | State-changing (appends, auto-checkpoint) | YES (user identifies blocker) |
| IN_TRANSITION | engineTransitionPartnership | resolve_blocker | Active journey | — | State-changing (removes, auto-checkpoint) | YES (user confirms resolved) |
| IN_TRANSITION | engineTransitionPartnership | record_milestone | Active journey | milestone_text (non-empty) | State-changing (appends milestone) | YES (user reports achievement) |
| IN_TRANSITION | engineTransitionPartnership | record_referral | Active journey | organisation, reason | State-changing (appends, auto-checkpoint) | No (partner judgment) |
| IN_TRANSITION | engineTransitionPartnership | update_confidence | Active journey | — | State-changing (updates, auto-checkpoint on shift) | No (behavioural observation) |
| IN_TRANSITION | engineTransitionPartnership | update_wellbeing | Active journey | observation (non-empty) | State-changing (sets awareness, auto-checkpoint if new) | YES (user shares) |
| IN_TRANSITION | engineTransitionPartnership | update_partnership_state | Active journey, valid transition | reason ≥15 chars if INDEPENDENT | State-changing (tos_phase→SETTLED if INDEPENDENT) | YES (explicit independence) |
| IN_TRANSITION | engineTransitionPartnership | update_operational_readiness | Active journey | — | State-changing | No (assessment) |
| IN_TRANSITION | engineTransitionPartnership | conclude_journey | Active journey, valid for INDEPENDENT | summary ≥15 chars | State-changing (tos_phase→SETTLED) | YES (explicit conclusion) |
| IN_TRANSITION | engineTransitionPartnership | update_direction | Active journey | new_direction (non-empty) | State-changing (auto-checkpoint on change) | YES (user shifts direction) |
| IN_TRANSITION | engineTransitionPartnership | update_transition_status | Active journey | — | State-changing | YES (user reports status) |
| SETTLED | engineTransitionPartnership | get_journey_status | Journey exists | — | Read-only | No |

### Routing Constraints [LOCKED]

1. Smudge may only invoke engines listed for the current tos_phase. [LOCKED]
2. Smudge may only invoke actions that the engine's contract permits. [LOCKED]
3. The engine validates all preconditions independently. Smudge cannot bypass them. [LOCKED]
4. State-changing actions require explicit user expression where indicated. [LOCKED]
5. Read-only actions may be called by Smudge for context without user expression. [PROPOSED]
6. The orchestrator constructs the engine request from LLM-extracted candidates + user expression. The engine validates and decides. [LOCKED]

---

## I. Failure / Rejection Behaviour

### Engine Rejection [LOCKED principle + PROPOSED behaviour]

**LOCKED:** Smudge must NOT retry with invented data or weaken the request. The rejection is information, not an obstacle to circumvent.

**PROPOSED behaviour:**

```
Engine returns rejection (400)
  → Orchestrator reads rejection message
  → Orchestrator passes rejection to LLM (Call 2) with instruction:
    "The system returned: [rejection message]. Generate a natural response
     that acknowledges what's missing without blaming the user or
     pretending success. Ask for what's needed."
  → Smudge explains naturally, asks for missing information
  → User provides information in next turn
  → Orchestrator re-attempts with legitimate data
```

**Examples:**

| Engine rejection | Smudge response (conceptual) |
|-----------------|------------------------------|
| "Preconditions not met: Operational Picture not confirmed" | "Before we look at what you're good at, I want to make sure I've got the full picture right. Can I tell you what I'm hearing?" |
| "Evidence Log not available (empty)" | "Let me build up a record of what you've told me first, so we can point to real evidence when we talk about your capabilities." |
| "Capability rejected: evidence_ref does not resolve to evidence_log entry" | "I don't have enough evidence for that yet. Can you tell me about a specific time when you demonstrated that?" |
| "soak_period.state must be SOAKING before bypass" | "We haven't started the reflection period yet. Would you like to take some time to think about your options first?" |
| "tos_phase must be READY_TO_ACT to start journey" | "There are a couple of things to sort out before we start your action plan. Let's finish looking at your options first." |

### Failure Modes [PROPOSED]

| Failure | Orchestrator Behaviour | User Sees |
|---------|----------------------|-----------|
| LLM unavailable (API error) | Do NOT call engine. Return graceful error. | "I'm having trouble processing that right now. Could you try again?" |
| LLM malformed output (schema validation fails) | Retry LLM once with stricter instruction. If still fails, graceful failure. | "I didn't quite catch that. Could you say that a different way?" |
| Engine timeout | Retry once after 5s. If still fails, graceful failure. | "Something's taking longer than expected. Give me a moment." |
| Engine 400 (rejection) | Read rejection, explain naturally (above). | Natural explanation of what's needed. |
| Engine 500 (server error) | Log error. Do NOT retry automatically. Graceful failure. | "I'm having a technical issue. Let's try again in a moment." |
| Stale profile state (tos_phase changed since read) | Re-read UserProfile. Re-route. Do NOT proceed with stale state. | (Invisible to user — routing adjusts automatically.) |
| Duplicate submission (idempotent engine returns same result) | Respond normally. Do NOT error. | (Invisible to user.) |
| Chat refresh / navigation | localStorage preserves conversation. Orchestrator re-reads tos_phase on next message. | Conversation resumes from current lifecycle state. |
| Unexpected lifecycle state (unknown tos_phase value) | Log warning. Return neutral response. Do NOT assume. | "Where would you like to pick up?" |
| Orchestrator function failure | Log error. Return 500 with error object. Chat.jsx displays graceful message. | "I'm having trouble connecting. Please try again." |

### Core Principle [LOCKED]

**Fail without corrupting the user's transition state.** Smudge should never pretend a successful action occurred when backend confirmation is absent. [LOCKED — §15]

---

## J. Audit / Observability Minimum

### Principle [LOCKED — §14]

The objective is explainability of consequential actions, not surveillance of the user. Avoid excessive logging of sensitive conversation where structured evidence is sufficient.

### What Is Logged [PROPOSED]

For every **state-changing** engine call only (not read-only calls, not turns where no engine was called):

```typescript
{
  timestamp: string,                  // ISO 8601
  user_id: string,                    // authenticated user
  profile_id: string,                 // canonical profile
  phase_at_start: string,             // tos_phase before engine call
  phase_at_end: string,               // tos_phase after engine call
  engine_called: string,              // 'companionService' | 'engineCapabilityIntelligence' | etc.
  action_called: string,              // 'submit_capabilities' | 'complete_soak' | etc.
  user_expression_excerpt: string,    // first 100 chars of user message (provenance)
  llm_interpretation: {               // LLM Call 1 output (structured)
    candidate_discoveries: array,
    intent: string,
    user_response_type: string | null,
    interpretation_confidence: string,
    ambiguity_flag: boolean
  },
  engine_request: object,             // what was sent to the engine
  engine_response: object,            // what the engine returned
  state_changed: boolean,             // did tos_phase change?
  smudge_response_excerpt: string     // first 100 chars of Smudge response
}
```

### What Is NOT Logged [PROPOSED]

- Full conversation history (localStorage handles that, client-side only)
- Personal details beyond what's in the engine request/response
- Read-only engine calls (no state change = no audit needed)
- Turns where no engine was called (ambiguity clarification, safety signposting, etc.)
- Emotional analysis or sentiment scoring

### Storage [PROPOSED — needs Paul's decision]

Options:
- **A) New entity:** `OrchestratorAudit` — dedicated audit trail, RLS-enabled
- **B) Extend evidence_log:** Add orchestrator audit entries to UserProfile.evidence_log
- **C) Structured log file:** Non-entity storage (if Base44 supports it)

**Recommendation:** Option A (new entity) — cleanest separation, does not pollute evidence_log with operational metadata, supports independent querying.

### Audit Trail Purpose [LOCKED]

The audit trail exists to answer: "What happened, and why?" for every consequential action. It does NOT exist to monitor the user's emotional state, conversation patterns, or engagement metrics. [LOCKED — §14]

---

## K. Answers to Design Questions

### DQ-1: What exact backend component should perform orchestration? [PROPOSED]

**Recommendation:** A new Base44 backend function named `smudgeOrchestrator`.

- Single function, TypeScript/Deno, deployed to Base44 platform
- Receives Chat.jsx request (user_id, user_message, conversation_context, explicit_action)
- Calls profileBootstrap to establish/confirm profile_id
- Reads UserProfile to obtain canonical tos_phase and profile state
- Calls LLM API (HTTPS) to interpret user expression
- Routes to appropriate engine based on tos_phase
- Calls engine through existing action interface (no engine changes)
- Calls LLM API to generate conversational response
- Returns response + bounded UI metadata to Chat.jsx

**Why a new function:** companionService is the Phase 2 orchestrator (discovery + confirmation). It cannot be expanded to route across all five engines without violating Packet 1 ownership boundaries and bloating the function. A separate orchestration layer that CALLS companionService (and the other engines) is the correct architectural boundary. [PROPOSED]

**Why not expand companionService:** companionService owns EXPLORING→CONFIRMING→CONFIRMED. Expanding it to route to capability, decision, and partnership engines would make it a god-object and violate the single-responsibility principle established in Packet 1. [PROPOSED]

### DQ-2: What Base44/LLM mechanism should provide natural-language interpretation and response generation? [PROPOSED]

**Recommendation:** External LLM API called from within smudgeOrchestrator via HTTPS fetch().

- Recommended provider: OpenAI (GPT-4) or Anthropic (Claude) — both support structured output
- The orchestrator function calls the LLM API with structured system prompts
- Two calls per turn: interpret + generate
- LLM API key stored as a Base44 secret (not in code, not in frontend)

**UNKNOWN — requires verification:** Whether Base44 backend functions can make external HTTPS API calls. The platform documentation should confirm this. If not, an alternative mechanism (e.g., Base44's built-in AI capabilities, if available for backend functions) would be needed.

### DQ-3: What structured contract should exist between the LLM and deterministic orchestration code? [PROPOSED]

See §D above. Two LLM calls, each with a strict input/output contract:

1. **Interpret:** user_message + profile_context + conversation_context → structured JSON (candidate_discoveries, intent, user_response_type, confidence, ambiguity_flag, safety_flag)
2. **Generate:** engine_result + flow_guidance + conversation_context → natural language response text

The deterministic code validates every LLM output against the schema before acting. Invalid output → retry once → graceful failure. [PROPOSED]

The LLM never directly calls engines, writes to UserProfile, or determines lifecycle state. The deterministic code is the gate. [LOCKED]

### DQ-4: How is user-expression provenance represented? [PROPOSED]

See §E above. Each candidate discovery carries:
- `source_text` (user's actual words)
- `source_type` ('direct_statement' | 'reasonable_interpretation' | 'uncertain')
- `confidence` ('high' | 'moderate' | 'low')

When discoveries are persisted via engine calls, the `source_text` is preserved alongside the evidence_log entry. This ensures traceability from engine evidence back to what the user actually said. [PROPOSED]

**LOCKED foundation:** The Evidence Rule (Packet 1) requires that every capability traces to an evidence_log entry. The provenance contract extends this by ensuring every evidence_log entry traces to user expression.

### DQ-5: How are explicit decisions distinguished from ordinary positive language? [PROPOSED]

See §F above. Three-layer defence:

1. **LLM classification:** The LLM classifies `user_response_type` with `interpretation_confidence` and `ambiguity_flag`.
2. **Deterministic validation:** If `interpretation_confidence !== 'high'` OR `ambiguity_flag === true` → downgrade to 'answering'. No exceptions.
3. **Engine guard:** The engine validates against its own preconditions (tos_phase, readyForConfirmation, etc.). Even if the orchestrator passes 'confirming', the engine checks tos_phase === 'CONFIRMING'.

A qualified response ("Mostly", "I suppose so") is classified as 'answering' by the LLM, not 'confirming'. The deterministic code does not upgrade it. The engine does not see it as confirmation. Smudge explores the qualification naturally. [PROPOSED]

### DQ-6: What minimum conversation context is supplied each turn? [PROPOSED]

- Last 10 messages (approximately 5 user + 5 Smudge) from localStorage
- Current tos_phase (from UserProfile, read fresh each turn)
- Bounded profile summary (areas_explored, capability_count, journey_active, partnership_state) — NOT the full UserProfile
- Current user message

**NOT supplied:**
- Full chat history (unnecessary, expensive, creates a second profile)
- Full UserProfile (the engine reads this; the LLM gets a summary)
- LLM memory across turns (each turn is stateless for the LLM; context is supplied explicitly)

**Rationale:** 10 messages provide sufficient continuity for a natural conversation without creating a shadow profile or inflating LLM costs. The canonical state lives in UserProfile, not in conversation history. [PROPOSED]

### DQ-7: What does Chat.jsx send and receive? [PROPOSED]

See §C above.

**Sends:** user_id, user_message (raw text), conversation_context (bounded array), explicit_action (optional)

**Receives:** response_text, phase, state_changed, ui_cue (optional), error (optional)

Chat.jsx is thin. It does not interpret phase to make decisions. It does not interpret ui_cue to drive lifecycle. It renders the response and optionally shows a button if cued. [LOCKED]

### DQ-8: How are engine errors/rejections represented conversationally? [PROPOSED]

See §I above. The orchestrator reads the engine's rejection message and passes it to the LLM (Call 2) with instructions to generate a natural, non-blaming, non-fabricating response. Smudge explains what's missing, asks for what's needed, and continues the conversation. The user never sees raw error codes. The user never feels blamed. The system never pretends success.

### DQ-9: What minimum audit trail is required for consequential actions? [PROPOSED]

See §J above. For every state-changing engine call: timestamp, user_id, profile_id, phase_before, phase_after, engine, action, user_expression_excerpt (100 chars), llm_interpretation (structured), engine_request, engine_response, state_changed, smudge_response_excerpt (100 chars).

NOT: full conversation, personal details beyond engine I/O, read-only calls, turns without engine calls, emotional analysis. [PROPOSED]

### DQ-10: Can the bridge be implemented without changing any of the five proven engine contracts? [LOCKED]

**YES.** The orchestrator calls each engine through its existing action interface. No engine needs modification. The orchestrator is a new function that sits between Chat.jsx and the existing engines. It constructs requests in the format each engine already accepts and consumes responses in the format each engine already returns.

**Proof:** The R1-A smoke tests confirmed that all five engines respond correctly to their documented action interfaces. The orchestrator will use exactly those interfaces. [LOCKED — proven by R1-A]

---

## L. Minimum Proposed R1-C Implementation Scope

**NOT AUTHORISED — design only. Requires Paul + Cipher + Ash sign-off.**

### Phase 1: Orchestrator Foundation [PROPOSED]
- Create smudgeOrchestrator backend function (skeleton)
- Implement profile context acquisition (profileBootstrap → profile_id → UserProfile → tos_phase)
- Implement LLM interpret call (with schema validation)
- Implement LLM generate call (with validation)
- No engine calls yet — orchestrator reads state and generates conversational responses only

**Gate:** Orchestrator returns natural language responses based on profile state, without calling engines.

### Phase 2: CompanionService Integration [PROPOSED]
- Wire orchestrator → companionService for EXPLORING/CONFIRMING
- Implement candidate_discoveries → new_discoveries mapping
- Implement user_response_type routing (with deterministic validation)
- Implement flow_guidance consumption for response generation

**Gate:** Full EXPLORING → CONFIRMING → CONFIRMED lifecycle through conversation.

### Phase 3: Capability Intelligence Integration [PROPOSED]
- Wire orchestrator → engineCapabilityIntelligence for CONFIRMED
- Implement validate_preconditions → seed_evidence → submit_capabilities → get_capability_picture flow
- Implement capability presentation guidance consumption

**Gate:** CONFIRMED → EVALUATING through conversation with evidence-backed capabilities.

### Phase 4: Decision Readiness Integration [PROPOSED]
- Wire orchestrator → engineDecisionReadiness for EVALUATING
- Implement decision factor recording, pathway evaluation, soak period management
- Implement reflection notes extraction

**Gate:** EVALUATING → READY_TO_ACT through conversation with soak period.

### Phase 5: Transition Partnership Integration [PROPOSED]
- Wire orchestrator → engineTransitionPartnership for READY_TO_ACT/IN_TRANSITION/SETTLED
- Implement journey start, commitment recording, blocker/milestone tracking
- Implement partnership state management and journey conclusion

**Gate:** READY_TO_ACT → IN_TRANSITION → SETTLED through conversation.

### Phase 6: Chat.jsx Wiring [PROPOSED]
- Replace hard-coded SMUDGE_RESPONSES with smudgeOrchestrator call
- Implement request/response contract from §C
- Implement conversation_context from localStorage
- Remove all lifecycle logic from Chat.jsx (there should be none)

**Gate:** User sends a message → receives Smudge response from orchestrator → conversation persists.

### Phase 7: Verification [PROPOSED]
- Fresh-profile E2E: new user → full MATE journey through conversation → SETTLED
- Disruption exercise: failed interview → confidence drop → pause → return → recovery
- Bodge regression baseline verification

**Gate:** R1-C Test Receipt — "Would we be happy introducing Bodge to Smudge tomorrow?"

---

## M. Risks / Unresolved Decisions

### Architectural [UNKNOWN]

| # | Risk / Decision | Status |
|---|----------------|--------|
| R-1 | Whether Base44 backend functions can make external HTTPS API calls | UNKNOWN — needs platform verification |
| R-2 | LLM cost per turn (two API calls per message) | UNKNOWN — needs cost model |
| R-3 | Latency: orchestrator → LLM interpret → engine → LLM generate → response (potentially 3-5s per turn) | UNKNOWN — needs runtime measurement |
| R-4 | LLM reliability for structured output extraction (hallucination risk) | PROPOSED — mitigated by deterministic validation, but real-world accuracy unknown |
| R-5 | Whether audit log should be a new entity or extend existing | PROPOSED — recommend new entity, needs Paul's decision |
| R-6 | Whether explicit_action UI buttons are needed or everything goes through natural language | PROPOSED — recommend both paths, needs Paul's decision |
| R-7 | Conversation context size — 10 messages might be too much (cost) or too little (continuity) | PROPOSED — start with 10, tune during testing |

### Doctrinal [PROPOSED — for Cipher review]

| # | Risk / Decision | Status |
|---|----------------|--------|
| R-8 | Does the orchestrator violate Smudge-as-companion philosophy by adding a mechanical layer between conversation and engines? | PROPOSED — the orchestrator is invisible to the user; Smudge's voice is preserved through LLM generation. But the mechanical routing is real. Needs Cipher's doctrine review. |
| R-9 | Does the LLM classification of user_response_type introduce a risk of the system "deciding" for the user? | PROPOSED — mitigated by three-layer defence (LLM classify → deterministic validate → engine guard). But the LLM's classification does influence what happens. Needs Cipher's review. |
| R-10 | Does the provenance contract adequately preserve "Understand Before Advising" when the LLM is extracting discoveries automatically? | PROPOSED — mitigated by source_type classification (uncertain discoveries are NOT passed to engines). But the LLM's extraction is invisible to the user unless Smudge chooses to surface it. Needs Cipher's review. |

### Safety [PROPOSED — for R2]

| # | Risk / Decision | Status |
|---|----------------|--------|
| R-11 | Safety detection accuracy — LLM-based safety_flag may have false negatives | PROPOSED — minimum boundary for MVP, detailed behavioural proof belongs to R2 |
| R-12 | Safety signposting content — what services to signpost, how to phrase | PROPOSED — deferred to R2 |

---

## 13. Safety Boundary (§13 of brief)

### Principle [LOCKED]

Preserve existing MATE safety doctrine. The orchestrator recognises when normal transition conversation should stop and safety/signposting behaviour takes precedence. The orchestrator does NOT attempt clinical or crisis management.

### Detection [PROPOSED]

The LLM interpret step includes `safety_flag` and `safety_category`:
- `safety_flag: true` → orchestrator does NOT call any engine
- `safety_category`: 'self_harm' | 'crisis' | 'bereavement_distress' | null

### Response [PROPOSED]

When `safety_flag === true`:
1. Orchestrator does NOT call any engine
2. Orchestrator generates a signposting response (via LLM Call 2 with safety-specific system prompt)
3. Response is warm, not clinical. "I'm here. That sounds really difficult."
4. Response signposts to appropriate services (Samaritans, NHS 111, GP, crisis line)
5. Smudge does NOT represent itself as a clinician, emergency service, or substitute for professional support
6. Smudge does NOT diagnose, analyse, or attempt to "fix" the distress
7. Smudge remains present — the door stays open

### Boundary [LOCKED]

This packet defines the detection + signposting boundary only. Detailed behavioural proof (what words trigger it, how Smudge phrases signposting, how to handle ongoing distress, when to escalate) belongs to R2. [LOCKED — §13]

---

## 16. Minimum UI Contract (§16 of brief)

### Chat.jsx Receives [PROPOSED]

```typescript
{
  response_text: string,    // Smudge's conversational response (max 500 chars)
  phase: string,            // current tos_phase (for display only, NOT for logic)
  state_changed: boolean,   // did lifecycle change? (for UI refresh, NOT for logic)
  ui_cue?: string,          // optional: 'show_confirm_button' | 'show_start_button' | 'show_conclude_button'
  error?: {                 // optional: recoverable error
    type: string,
    message: string,
    retry_recommended: boolean
  }
}
```

### What Chat.jsx Does With This [LOCKED]

- Renders `response_text` as Smudge's message
- Optionally displays `phase` as a progress indicator (but does NOT use it for logic)
- Optionally displays `ui_cue` as a button (but does NOT interpret it for lifecycle)
- If `error`, displays `message` and optionally shows retry option
- Does NOT expose internal reasoning, chain-of-thought, or engine internals
- Does NOT interpret backend doctrine
- Does NOT make decisions based on `phase` or `state_changed`

### What Chat.jsx Does NOT Receive [LOCKED]

- Engine internal responses (only Smudge's interpretation)
- LLM chain-of-thought or reasoning
- Candidate discoveries or provenance data
- Audit trail information
- Safety classification (safety is handled server-side; user just sees Smudge's response)

---

## Acceptance Test

**The R1-B design passes only if we can truthfully say:**

> Smudge can be connected to MATE without becoming an uncontrolled decision engine, without moving lifecycle authority into the LLM/frontend, and without weakening the evidence, ownership or user-decision boundaries already proven.

### Verification

1. **Without becoming an uncontrolled decision engine?** ✅ The orchestrator routes and interprets. Engines decide. The LLM is a tool, not an authority. Three-layer defence on every decision.

2. **Without moving lifecycle authority into the LLM/frontend?** ✅ tos_phase is read from UserProfile by the orchestrator. The LLM never writes tos_phase. Chat.jsx never reads tos_phase for logic. Engines own all lifecycle transitions.

3. **Without weakening evidence boundaries?** ✅ Every discovery carries provenance. Uncertain discoveries are never passed to engines. Engines validate all evidence. The LLM cannot invent evidence.

4. **Without weakening ownership boundaries?** ✅ Each engine owns its domain. The orchestrator calls engines through their existing action interfaces. No engine is modified. No engine is bypassed.

5. **Without weakening user-decision boundaries?** ✅ Explicit decisions require explicit user expression. LLM classifies, deterministic code validates, engine guards. Qualified language is not confirmation. Settlement requires substantive independence expression.

---

## Verdict

### R1-B CONTRACT READY FOR APPROVAL

The Smudge Orchestration Contract defines a minimum safe orchestration boundary that:
- Preserves all seven governing principles (LOCKED)
- Keeps Chat.jsx thin (LOCKED)
- Places the LLM behind the orchestration boundary (LOCKED)
- Routes to engines based on tos_phase, not conversation content (LOCKED)
- Validates every LLM output through deterministic code (PROPOSED)
- Protects evidence, ownership, and user-decision boundaries (LOCKED)
- Requires no changes to any of the five proven engine contracts (LOCKED)

Three UNKNOWNs require platform verification before implementation:
1. Whether Base44 backend functions can make external HTTPS API calls (R-1)
2. LLM cost and latency per turn (R-2, R-3)
3. LLM structured-output reliability in real-world conversation (R-4)

Three doctrinal items require Cipher's review:
1. Whether the mechanical orchestration layer is compatible with Smudge-as-companion (R-8)
2. Whether LLM classification of user_response_type is acceptable (R-9)
3. Whether automatic discovery extraction preserves Understand Before Advising (R-10)

---

## Document Control

**Status:** R1-B Smudge Orchestration Contract — DESIGN ONLY  
**Verdict:** R1-B CONTRACT READY FOR APPROVAL  
**Authority:** Design / Contract only. No implementation, no deployment, no schema changes.  
**Next:** Paul + Cipher review. Resolve R-1 through R-12. Define R1-C implementation scope.  
**Prerequisite:** R1-A v1.2 COMPLETE (frontend evidence complete)  

---

*SMUDGE CONDUCTS THE ORCHESTRA; HE DOES NOT PLAY EVERY INSTRUMENT.*  
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
