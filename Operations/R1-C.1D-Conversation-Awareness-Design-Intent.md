# R1-C.1D — CONVERSATION AWARENESS DESIGN INTENT (v2 — CIPHER REFINEMENTS)

**Date:** 23 August 2026  
**Engineer:** Ash  
**Status:** DESIGN INTENT (v2) — NO IMPLEMENTATION AUTHORISED  
**Authority:** Paul (R1-C.1D — Conversational Awareness Design Authority)  
**Predecessor:** R1-C.1D Full Conversational Architecture Diagnostic (67434fe)  
**Cipher Review:** PASS WITH FOUR REQUIRED REFINEMENTS (23 Aug 2026)  
**Refinements applied:** v2 incorporates all four Cipher refinements. Changes marked [C1]-[C4].

---

## 0. Cipher Refinement Summary

| # | Refinement | Where addressed |
|---|---|---|
| C1 | Derive proposed ConversationState BEFORE generation; provide updated state to generation on the same turn; persist after generation. | §5, §3, §17 |
| C2 | Do not automatically return helping → understanding based on undefined "request resolved". Helping persists until an explicit conversational signal changes it. | §5.3 |
| C3 | Lock ConversationState ownership to exactly one state record per authenticated UserProfile; no arbitrary profile lookup/write. | §3, §4 |
| C4 | Tighten privacy treatment of `last_smudge_response`: bounded storage and acknowledge that generated text may reflect user-sensitive content. | §2.5, §11 |

---

## 1. Mission

Design the minimum Conversation Awareness capability that gives Smudge three things:

1. **WHO the user is** → UserProfile / evidence (existing, unchanged)
2. **WHERE they are in transition** → lifecycle / companionCore (existing, unchanged)
3. **WHERE Smudge and the user are in the conversation** → new Conversation Awareness state + recent context (NEW)

This design addresses the P0 and P1 root causes identified in the Full Conversational Architecture Diagnostic. It does not redesign the deterministic layer, the lifecycle model, or the engine contracts.

---

## 2. Proposed State Model

### 2.1 Architecture decision: Dedicated entity

**Decision:** Create a new `ConversationState` entity, separate from UserProfile.

**Rationale:**

Paul's authority states: "Prefer clear separation between evidence about the person and state of the conversation." UserProfile is evidence about the person. ConversationState is state of the conversation. They are architecturally distinct (diagnostic §G1, P0-1).

A JSON field on UserProfile was considered and rejected because:
- companionCore owns UserProfile writes. Conversational state is not companionCore's domain.
- The orchestrator would need to write to UserProfile outside companionCore's ownership boundary, violating the locked ownership model (R1-C.1B-S).
- A separate entity allows clean ownership: companionCore → UserProfile, orchestrator → ConversationState.
- A separate entity can be deleted/reset without touching profile or evidence data.

### 2.2 Entity schema: ConversationState

```
ConversationState
├── user_profile_id        string        // FK to UserProfile.id — ONE record per profile [C3]
├── current_focus          string        // What the conversation is about right now
├── conversation_mode      string        // "understanding" | "helping" | "transitioning"
├── user_objective         string        // What the user is trying to achieve
├── topics_covered         array         // [{topic, summary}] — topics discussed with brief summaries
├── topics_closed          array         // [string] — topics the user explicitly closed
├── last_smudge_response   string        // What Smudge said last turn (BOUNDED — see §2.5) [C4]
├── last_smudge_intent     string        // Smudge's last response_intent
├── last_interaction_date  string        // ISO datetime of last user message
├── session_started_date   string        // ISO datetime of current session start
```

### 2.3 Field justification (every field maps to an evidenced failure)

| Field | SMUDGE 1-3 failure solved | Diagnostic ref |
|---|---|---|
| `current_focus` | "User-directed changes of focus do not reliably persist" | P0-1, D7 |
| `conversation_mode` | "Smudge does not reliably know when sufficient discovery has occurred and it should move from understanding → helping" | P1-3 |
| `user_objective` | "Direct requests for help can be converted back into discovery questions" | P1-3, D7 |
| `topics_covered` | "Repeats questions/information already discussed" | P0-1, D7 |
| `topics_closed` | "Smudge still reopens topics the user has explicitly closed" | P0-1, D7 |
| `last_smudge_response` | "Repeats questions/information already discussed" + "repetitive language" | P0-3, D8 |
| `last_smudge_intent` | "Previous conversational act" not tracked | D7 |
| `last_interaction_date` | "Returning to an existing conversation can feel like restarting" | P2-1 |
| `session_started_date` | Session boundary detection for recovery | P2-1 |

**No field exists "because it might be useful."** Each one solves a specific failure observed in Exercises SMUDGE 1-3.

### 2.4 Fields deliberately NOT persisted

| Not persisted | Why |
|---|---|
| Full conversation transcript | Paul's authority: "This is not a transcript-memory system." The state is a running operational picture, not a log. |
| User's exact words | We store summaries, not transcripts. Exception: `last_smudge_response` (Smudge's own output, needed for continuity — see §2.5 for privacy treatment). |
| Interpretation internals | candidate_discoveries, confidence scores, validation decisions — these are per-turn processing, not conversational state. |
| Emotional states | Transient and inferred, not factual. Storing "user seems frustrated" risks reifying an inference. |
| Analytics (session duration, message count, clicks) | Not conversational state. Pilot Rule 3: measure people, not software. |
| Profile corrections as a separate list | If a correction results in a profile update, the profile already reflects it. If it's a judgment correction, the conductor handles it per-turn. A cumulative correction log was considered and rejected as not solving a specific SMUDGE 1-3 failure. |
| Pending requests as a separate list | `user_objective` captures the current request. `conversation_mode` captures whether we're helping. A separate pending-requests queue is over-engineering for MVP. |

### 2.5 Privacy treatment of last_smudge_response [C4]

`last_smudge_response` is the only field that stores generated text rather than a structured summary. Generated text may indirectly reflect user-sensitive content (e.g., "So you mentioned you're struggling with..." or "You said your father passed away during your deployment").

**Bounding:**
- **Max length: 1000 characters.** If the generated response exceeds this, it is truncated for storage. The full response is still returned to the frontend; only the stored copy is bounded.
- **Retention: single-turn only.** Each turn overwrites the previous value. There is no history of previous Smudge responses — only the most recent one.
- **Deletion: cascades with profile.** When a UserProfile is deleted, the associated ConversationState (including `last_smudge_response`) is deleted.
- **No transcript accumulation.** `last_smudge_response` is a single overwrite field, not an append-only log. The system never accumulates a history of Smudge's responses.

**Acknowledgement:** The design acknowledges that `last_smudge_response` may contain user-sensitive content reflected from the conversation. This is a deliberate trade-off: the field is required for conversational continuity (P0-3 fix), and the bounding measures (length cap, single-turn retention, cascade deletion) minimise the exposure surface. The alternative — not storing Smudge's last response — reintroduces the P0-3 failure (repetition, no continuity).

---

## 3. Source of Truth and Ownership

### 3.1 Ownership model

| State | Owner | Writer | Reader |
|---|---|---|---|
| Profile / evidence / lifecycle | companionCore | companionCore (via persist callback) | smudgeOrchestrator, companionService |
| Safety state | smudgeOrchestrator (safety flows) | smudgeOrchestrator (safety_flags on UserProfile) | smudgeOrchestrator |
| **ConversationState** | **smudgeOrchestrator** | **smudgeOrchestrator (derive before generation, persist after)** [C1] | **smudgeOrchestrator (start of turn)** |

**Key principle:** companionCore does NOT read or write ConversationState. The orchestrator does not write UserProfile fields outside companionCore. Clean separation maintained.

### 3.2 Authority boundary [C3]

- The orchestrator may READ ConversationState at the start of each turn (step 1.5, between profile acquisition and interpretation).
- The orchestrator may DERIVE updated ConversationState before generation (step 11.5) and pass it to the generation LLM on the same turn [C1].
- The orchestrator may PERSIST ConversationState after generation (step 12c) — the derived state plus the generated response.
- No other component touches ConversationState.
- ConversationState does NOT influence lifecycle transitions. companionCore continues to own EXPLORING → CONFIRMING → CONFIRMED based on profile substance alone.

### 3.3 One state record per UserProfile [C3]

**Hard constraint:** Exactly ONE ConversationState record exists per UserProfile. No duplicates, no arbitrary lookups.

**Enforcement:**
- **Creation:** Step 1.5 queries `ConversationState.filter({ user_profile_id: profile_id })`. If zero results, create exactly one. If one result, use it. If more than one result (defensive — should never occur), use the most recently updated and log a data integrity warning.
- **No arbitrary profile lookup:** The orchestrator does NOT use `profiles[0]` for ConversationState. It uses the exact `profile_id` obtained in step 1 (profile acquisition). This is the same `profile_id` used for all subsequent operations.
- **No cross-profile writes:** The orchestrator never writes a ConversationState with a `user_profile_id` other than the one obtained in step 1.
- **Deletion:** When a UserProfile is deleted, the associated ConversationState should also be deleted. For MVP, this is a manual step (no cascade delete in the entity model). Post-MVP, an entity automation on UserProfile delete could handle this.

---

## 4. When State Is Created

**On first interaction** — when the orchestrator finds no ConversationState for the current profile.

This happens in a new step (1.5) after profile acquisition:

```
Step 1:   Profile acquisition (existing)
          → profile_id = profiles[0].id (or newly created profile.id)

Step 1.5: ConversationState acquisition (NEW) [C3]
          → query ConversationState.filter({ user_profile_id: profile_id })
          → if exactly 0 results:
              create ONE ConversationState with:
                user_profile_id: profile_id    ← exact ID from step 1
                current_focus: null
                conversation_mode: "understanding"
                user_objective: null
                topics_covered: []
                topics_closed: []
                last_smudge_response: null
                last_smudge_intent: null
                last_interaction_date: now
                session_started_date: now
          → if exactly 1 result:
              deserialize (JSON-string fields → native)
          → if >1 results (defensive — data integrity issue):
              use the most recently updated record
              log _internal warning: "ConversationState: multiple records found for profile_id"
          → determine if this is a new session:
              if (now - last_interaction_date) > 30 minutes → is_returning_user = true
              else → is_returning_user = false
```

**Session boundary:** 30 minutes of inactivity. If the user returns after 30+ minutes, the orchestrator updates `session_started_date` to now and sets `is_returning_user = true` for the generation prompt. If they return within 30 minutes, it's the same session.

This threshold is a heuristic. It can be tuned. The important thing is that the orchestrator can distinguish "user continued talking" from "user came back."

---

## 5. How State Is Updated

### 5.1 Update flow [C1]

**Key change from v1:** The proposed ConversationState is derived BEFORE generation and provided to the generation LLM on the same turn. It is persisted AFTER generation.

```
Step 4:   Interpretation LLM (existing + 4 new signal fields)
          → produces topic_signal, topic_label, help_request, user_objective_signal

Step 11:  companionCore (existing)
          → produces lifecycle_transition, behavioural_notes, areas assessment

Step 11.5: ConversationState derivation (NEW) [C1]
          → read interpretation signals from step 4
          → derive proposed updated ConversationState:
              current_focus = updated if topic_signal == "shifted"
              conversation_mode = updated per transition rules (§5.3)
              user_objective = updated if user_objective_signal non-empty
              topics_covered = append if topic_signal == "covered"
              topics_closed = append if topic_signal == "closed"
              last_interaction_date = now
          → this derived state is passed to genContext (step 12)
          → this derived state is NOT yet persisted

Step 12:  Generation LLM (existing + conversation awareness)
          → genContext includes the DERIVED ConversationState [C1]
          → generation produces response_text, response_intent, asks_question

Step 12c: ConversationState persist (NEW) [C1]
          → take the derived state from step 11.5
          → add the generation results:
              last_smudge_response = truncate(response_text, 1000 chars) [C4]
              last_smudge_intent = response_intent
          → persist via base44.asServiceRole.entities.ConversationState.update(state_id, derived + response)
          → if persist fails: log warning, continue (response already generated)
```

**Why derive before generation?** [C1]

The generation LLM needs to see the CURRENT turn's conversational state, not just the previous turn's. If the user says "that's all on that, let's talk about something else," the interpretation detects `topic_signal: "closed"` + `topic_signal: "shifted"`. The derived state marks the topic as closed and updates `current_focus`. The generation LLM sees this and knows not to revisit the closed topic — in the SAME turn. If we derived after generation, the LLM wouldn't know about the closure until next turn.

This means the generation LLM receives the state as it SHOULD be at the end of this turn (minus `last_smudge_response`, which isn't known until generation completes). The prompt should make this clear: "The conversation state below reflects the user's current message, including any topic closures or focus changes they just signaled."

### 5.2 Signal extraction from interpretation

The interpretation LLM (step 4) already processes the user message + recent_context. It is the best-positioned component to detect conversational signals. The interpretation response schema is extended with 4 new fields:

```
// NEW fields added to interpretSchema
topic_signal: {
  type: "string",
  enum: ["none", "covered", "closed", "shifted"],
  description: "Conversational topic signal. 'none' = no signal. 'covered' = user seems to have finished discussing a topic naturally. 'closed' = user explicitly said they're done with a topic ('that's all', 'moving on'). 'shifted' = user changed focus to a different topic."
},
topic_label: {
  type: "string",
  description: "Brief label for the topic being discussed, if detectable. 'service history', 'current circumstances', 'goals', 'CV help', etc. Empty string if unclear."
},
help_request: {
  type: "string",
  description: "If the user is asking for help, advice, or guidance (not just providing information), what they're asking for. Empty string if not a help request. Example: 'help with CV' or 'what jobs could I do'."
},
user_objective_signal: {
  type: "string",
  description: "If the user expresses a goal or objective for this conversation. Empty string if not expressed. Example: 'figure out what civilian jobs I could do' or 'understand what I'm good at'."
}
```

These 4 fields are **additions** to the existing interpretation schema. They do not replace or modify any existing field. The interpretation LLM already has `recent_context` (last 3-4 exchanges) and the current message, so it has the information to detect these signals without additional context.

### 5.3 Deterministic state transitions [C2]

The orchestrator applies these updates deterministically based on the interpretation signals:

| Signal | State update |
|---|---|
| `topic_signal: "covered"` + `topic_label: "X"` | Append `{topic: "X", summary: "(derived from discoveries this turn)"}` to `topics_covered` |
| `topic_signal: "closed"` + `topic_label: "X"` | Append `"X"` to `topics_closed` |
| `topic_signal: "shifted"` + `topic_label: "X"` | Set `current_focus = "X"` |
| `help_request` non-empty | Set `conversation_mode = "helping"`, set `user_objective = help_request value` |
| `user_objective_signal` non-empty | Set `user_objective = user_objective_signal value` |
| Lifecycle reached CONFIRMED (from companionCore) | Set `conversation_mode = "transitioning"` |

**Mode transition rules [C2]:**

- `understanding → helping`: when `help_request` is non-empty (user asked for help)
- `understanding → transitioning`: when lifecycle reaches CONFIRMED (understanding complete)
- `helping → understanding`: **ONLY when an explicit conversational signal indicates it.** Valid signals:
  - User explicitly says they want to return to discovery: "actually, let's go back to..." or "what else do you need to know about me?"
  - User explicitly closes the help topic AND expresses a new objective that is discovery-oriented
  - Interpretation `help_request` is empty AND `topic_signal` is "closed" for the help topic AND `user_objective_signal` expresses a discovery goal
- `transitioning → helping`: when user asks for help with next-phase activities

**What was removed [C2]:** The v1 design had "No help request + mode was 'helping' + topic resolved → return to understanding." Cipher correctly identified that "topic resolved" is undefined. This automatic return is REMOVED. Helping persists until an explicit conversational signal changes it. The generation LLM in "helping" mode will not ask discovery questions — if the user wants to return to discovery, they signal it, and the interpretation detects it.

**Safety valve:** If `conversation_mode` has been "helping" for more than 10 consecutive turns without a mode-change signal, the orchestrator may include a gentle behavioural note: "The user has been in helping mode for N turns. Consider whether they might benefit from returning to discovery." This is a NOTE to the generation LLM, not an automatic mode change. The mode only changes on explicit signal.

---

## 6. What Generation Receives Each Turn

### 6.1 Extended genContext

The genContext object (step 12) is extended with conversation awareness fields. The conversation awareness fields reflect the DERIVED state from step 11.5 [C1]:

```typescript
const genContext = {
  // ─── EXISTING (unchanged) ───
  user_message,
  accepted_discoveries: m.accepted_discoveries,
  rejected_discoveries: m.rejected_discoveries,
  areas_explored: m.areas_explored,
  areas_outstanding: m.areas_outstanding,
  confirmed: m.confirmed,
  ready_to_confirm: m.ready_to_confirm,
  lifecycle_transition: m.lifecycle_transition,
  clarification_needed: m.clarification_needed,
  companion_error: m.companion_error,
  no_discoveries: m.no_discoveries,
  behavioural_notes: T?.guidance?.behavioural_notes || [],
  canonical_phase: m.tos_phase_after,
  profile_content: buildProfileContext(profile),
  evidence_sufficient: m.ready_to_confirm || m.confirmed,
  authoritative_intent: m.authoritative_intent,

  // ─── NEW: Conversation awareness (derived state from step 11.5) [C1] ───
  recent_context,                    // Last 3-4 exchanges (from frontend, already available)
  last_smudge_response,             // What Smudge said LAST turn (from persisted ConversationState)
  last_smudge_intent,               // What Smudge's last conversational act was
  conversation_mode,                 // DERIVED for this turn: "understanding" | "helping" | "transitioning"
  current_focus,                     // DERIVED for this turn: what the conversation is about
  user_objective,                   // DERIVED for this turn: what the user is trying to achieve
  topics_covered,                   // DERIVED for this turn (including any new topic from this turn's signal)
  topics_closed,                    // DERIVED for this turn (including any topic closed THIS turn)
  is_returning_user                 // Boolean — is this a new session?
};
```

**Note on `last_smudge_response` in genContext:** This is the PREVIOUS turn's Smudge response (read from the persisted ConversationState at step 1.5). The current turn's response is not known until generation completes. The generation LLM sees what it said last, not what it's about to say.

### 6.2 Generation prompt additions

The `buildGenerationPrompt()` function is extended with a new section inserted after the profile content:

```
- What you said last: "${last_smudge_response || '(first message)'}"
- Your last conversational act: ${last_smudge_intent || "none"}
- What the conversation is about right now: ${current_focus || "getting to know each other"}
- What the user is trying to achieve: ${user_objective || "not yet expressed"}
- Topics you've already covered: ${topics_covered.length > 0 ? topics_covered.map(t => t.topic).join(", ") : "none yet"}
- Topics the user has closed (do NOT reopen these without reason): ${topics_closed.length > 0 ? topics_closed.join(", ") : "none"}
- Conversation mode: ${conversation_mode}
${is_returning_user ? "- The user is returning after a break. They may need a brief, natural recap of where you were." : ""}
```

**Important note for generation:** The conversation state above reflects the user's CURRENT message, including any topic closures or focus changes they just signaled. If a topic is listed as closed, the user closed it in this message or a previous one — do not reopen it.

And two new rules added to the rules section:

```
23. You can see what you said last turn and what topics you've covered. Do NOT repeat information from previous turns. Do NOT reopen topics the user has closed. If the user is returning after a break, briefly and naturally acknowledge where you were — do not restart from scratch.
24. If the conversation mode is "helping", the user has asked for help with something. Help them. Do not ask another discovery question unless they explicitly invite it. If the mode is "understanding", continue building understanding — but do not ask about topics already covered or closed.
```

### 6.3 recent_context in generation

`recent_context` is already available in the orchestrator (received from the frontend at line 397). It is currently used ONLY in the interpretation prompt. This design adds it to genContext so the generation LLM also sees the last 3-4 exchanges.

This is the single highest-impact, lowest-cost change in the design. No schema change, no new entity, no new LLM call. Just one field added to genContext and one section added to the generation prompt.

---

## 7. Restart / Session Recovery

### 7.1 Scenario: User returns after closing MATE (same device)

1. Frontend has conversation in localStorage → sends `recent_context` (last 3-4 exchanges)
2. Backend reads ConversationState → has `last_smudge_response`, `current_focus`, `topics_covered`, `user_objective`, `conversation_mode`
3. `is_returning_user = true` (if > 30 minutes since last interaction)
4. Generation receives both: recent exchanges (immediate context) + stored state (broader continuity)
5. Generation prompt includes: "The user is returning after a break. They may need a brief, natural recap of where you were."
6. Smudge can say: "Right, so we were talking about your time in signals and you wanted to figure out what civilian jobs might fit. Where do you want to pick up?"

### 7.2 Scenario: User returns on a new device (no localStorage)

1. Frontend has no conversation history → sends `recent_context = null` or empty
2. Backend reads ConversationState → has the stored state
3. `is_returning_user = true`
4. Generation receives stored state but no recent exchanges
5. Generation prompt includes the returning-user note
6. Smudge can still recap: "Last time we talked, you were looking at what you're good at from your signals background. Want to pick up from there?"

### 7.3 Scenario: User returns after a long break (weeks)

1. Backend reads ConversationState → `last_interaction_date` is weeks ago
2. `is_returning_user = true`
3. `topics_covered` and `topics_closed` still hold the history
4. `conversation_mode` may be stale — the orchestrator resets it to "understanding" if the last interaction was > 7 days ago (long break = fresh start on mode, but topics covered/closed are retained)
5. Smudge can say: "It's been a while. Last time, we'd covered your service history and you were thinking about what jobs might suit you. Want to carry on from there, or have things changed?"

### 7.4 Scenario: First-time user

1. No ConversationState exists → orchestrator creates one (step 1.5) [C3]
2. All fields are null/empty/default
3. `is_returning_user = false`
4. Generation sees: "first message", no topics covered, no focus, mode = "understanding"
5. Smudge starts fresh — no change from current behaviour

---

## 8. Interaction with Conductor

### 8.1 Current conductor (unchanged)

The conductor (`mapAuthoritativeIntent`) continues to map 3 interpretation intents to authoritative overrides:
- `expressing_frustration` → `STOP_EXPLORING`
- `asking_orientation` → `EXPLAIN`
- `correcting` → `ACCEPT_CORRECTION`

These remain unchanged and take priority over everything else in the generation prompt.

### 8.2 Conversation mode as conductor extension

`conversation_mode` acts as a **persistent conductor signal**. While the existing conductor handles per-turn signals (this message is frustration), `conversation_mode` handles persistent intent (this conversation is in helping mode):

| conversation_mode | Generation instruction |
|---|---|
| `understanding` | Normal generation — continue building understanding. Respect areas_outstanding but don't be a checklist. |
| `helping` | The user asked for help. Help them. Do NOT ask another discovery question unless they explicitly invite it. [C2] |
| `transitioning` | Understanding is complete (CONFIRMED). Acknowledge the transition. Don't restart discovery. |

### 8.3 Priority order in generation prompt

1. **Safety** (if pending) — short-circuits everything
2. **Authoritative intent** (conductor) — per-turn override (STOP_EXPLORING, EXPLAIN, ACCEPT_CORRECTION)
3. **Conversation mode** — persistent mode override (helping > understanding)
4. **Areas outstanding / behavioural notes** — context only, not a checklist

This priority order ensures that per-turn signals (frustration, correction) can interrupt a persistent mode (helping), but the persistent mode prevents the default-to-discovery pressure when no per-turn signal fires.

---

## 9. Interaction with companionCore / Evidence / Lifecycle

### 9.1 companionCore (NO CHANGES)

companionCore continues to:
- Assess the 6 areas for substance
- Merge discoveries into the profile
- Transition lifecycle (EXPLORING → CONFIRMING → CONFIRMED)
- Generate behavioural notes and flow guidance
- Persist via the narrow callback

companionCore does NOT:
- Read ConversationState
- Write ConversationState
- Know that ConversationState exists

### 9.2 Evidence gate (NO CHANGES)

The evidence gate continues to operate as before. Candidate discoveries are still validated, filtered, and persisted to UserProfile fields with source tracking. ConversationState does not store evidence — it stores conversational summaries.

### 9.3 Lifecycle (NO CHANGES)

Lifecycle transitions remain owned by companionCore. The `conversation_mode` field is NOT a lifecycle state. It is a conversational state that is independent of `tos_phase`:

| tos_phase (lifecycle) | conversation_mode (conversational) | Example |
|---|---|---|
| EXPLORING | understanding | Normal discovery — building the picture |
| EXPLORING | helping | User asked "what jobs could I do?" before completing discovery |
| CONFIRMING | understanding | Confirming the reflected picture |
| CONFIRMED | transitioning | Picture confirmed — ready for next phase |
| EVALUATING+ | helping | User wants help with next-phase activities (not yet supported in MVP) |

The key insight: a user in EXPLORING can be in "helping" mode. They haven't completed discovery, but they asked a specific question. Smudge should answer the question, then remain in helping mode until the user explicitly signals they want to return to discovery [C2]. The lifecycle tracks data completeness; the conversation mode tracks what the user wants right now.

---

## 10. Failure / Fallback Behaviour

### 10.1 ConversationState read failure

If the orchestrator cannot read or create ConversationState (e.g., entity not yet provisioned, network error):

- Set all conversation awareness fields to defaults (null, empty arrays, "understanding", `is_returning_user = false`)
- Log the failure in `_internal`
- Continue processing — the turn proceeds without conversation awareness
- Generation falls back to current behaviour (no conversation context)
- **Impact:** Same as today. No regression.

### 10.2 ConversationState write failure [C1]

If the orchestrator cannot persist ConversationState after generation (step 12c):

- The response is still returned to the user (generation already completed using the derived state)
- Log the failure in `_internal`
- Next turn reads stale ConversationState (last successful write — does not include this turn's derived state)
- **Impact:** One turn of stale conversation state. Self-heals on next successful write.

### 10.3 ConversationState derivation failure [C1]

If the derivation step (11.5) fails (e.g., interpretation didn't return signal fields):

- Derivation defaults: no state changes, `conversation_mode` retains previous value
- Generation proceeds with existing (pre-derivation) ConversationState values
- Persist step (12c) writes `last_smudge_response` and `last_smudge_intent` only
- **Impact:** No conversation state update this turn. Self-heals when signals are available.

### 10.4 Interpretation signal extraction failure

If the interpretation LLM does not return the new conversation awareness fields (e.g., schema not deployed, LLM ignores them):

- Default all signals to "none" / empty string
- No state update for that turn
- ConversationState retains previous values
- **Impact:** No conversation awareness update this turn. Self-heals when the schema is deployed.

### 10.5 Generation with conversation awareness fields missing

If genContext is built without conversation awareness fields (e.g., partial deployment):

- The generation prompt builder checks for null/undefined and omits the conversation awareness section
- Generation proceeds with existing context only
- **Impact:** Same as current behaviour. No regression.

**Principle:** Conversation awareness is additive. Every failure path degrades gracefully to the current behaviour. It cannot make the system worse than it is today.

---

## 11. Privacy / Data-Growth Considerations

### 11.1 Data growth

| Field | Growth pattern | Bounded? |
|---|---|---|
| `current_focus` | Overwritten each turn | Fixed size |
| `conversation_mode` | Overwritten each turn | Fixed size |
| `user_objective` | Overwritten when new objective expressed | Fixed size |
| `topics_covered` | Appended when topic covered | Bounded by conversation topics (typically 6-12 per journey) |
| `topics_closed` | Appended when user closes topic | Bounded (typically 3-8 per journey) |
| `last_smudge_response` | Overwritten each turn, max 1000 chars [C4] | Bounded — 1000 chars max |
| `last_smudge_intent` | Overwritten each turn | Fixed size (enum) |
| `last_interaction_date` | Overwritten each turn | Fixed size |
| `session_started_date` | Overwritten on new session | Fixed size |

**No unbounded growth.** The ConversationState is a fixed-overhead-plus-small-list structure. It will not grow unboundedly over a user's entire journey.

### 11.2 Privacy [C4]

- ConversationState stores conversational summaries, not full transcripts
- It is scoped to the user via `user_profile_id` with RLS
- It can be deleted independently of UserProfile (clean separation)
- **`last_smudge_response` may contain user-sensitive content reflected from the conversation.** Generated text can echo or reference what the user shared (e.g., "you mentioned your father passed away during deployment" or "you said you're struggling with..."). This is acknowledged as a deliberate trade-off [C4]:
  - The field is capped at 1000 characters
  - It is overwritten each turn (single-turn retention — no history accumulates)
  - It is deleted when the ConversationState is deleted
  - It is never transmitted outside the orchestrator → generation → persist cycle
  - It is NOT included in the response to the frontend (the frontend already has the full response from this turn; it only needs it NEXT turn)
- `topics_covered` summaries are derived from discoveries (which are already in the profile)
- No additional PII is introduced beyond what the system already holds in UserProfile

### 11.3 Data retention

For MVP pilot: ConversationState persists for the duration of the user's journey. If a user requests deletion, both UserProfile and ConversationState can be deleted.

Post-MVP: Consider a retention policy (e.g., ConversationState archived after journey concludes). Not required for MVP.

---

## 12. Migration / Compatibility for Existing Profiles

### 12.1 No migration required

- Existing profiles have no ConversationState. The orchestrator creates one on the next interaction (step 1.5) [C3].
- No data needs to be migrated. ConversationState starts empty for all existing users.
- The first interaction after deployment will create a ConversationState with default values. The generation LLM will see "first message, no topics covered, understanding mode" — same as a new user.
- Subsequent interactions build the state naturally.

### 12.2 No breaking changes

- UserProfile schema: unchanged
- companionCore: unchanged
- companionService: unchanged
- Engines: unchanged
- Chat.jsx: unchanged (already sends recent_context)
- Safety flows: unchanged
- Lifecycle: unchanged

The ONLY changes are:
1. New entity: ConversationState
2. smudgeOrchestrator: read ConversationState (step 1.5), derive state (step 11.5), pass fields to genContext, persist (step 12c), add fields to interpretation schema, add sections to generation prompt
3. No other file is touched

---

## 13. Minimum Engineering Surface

### 13.1 Changes required

| # | File | Change | Lines (est.) |
|---|---|---|---|
| 1 | Base44 entity | Create `ConversationState` entity | Schema definition |
| 2 | smudgeOrchestrator.ts | Step 1.5: Read/create ConversationState (one record per profile) [C3] | ~25 lines |
| 3 | smudgeOrchestrator.ts | Extend interpretSchema with 4 conversation signal fields | ~15 lines |
| 4 | smudgeOrchestrator.ts | Step 11.5: Derive updated ConversationState before generation [C1] | ~30 lines |
| 5 | smudgeOrchestrator.ts | Add `recent_context` to genContext | 1 line |
| 6 | smudgeOrchestrator.ts | Add conversation awareness fields to genContext (from derived state) [C1] | ~10 lines |
| 7 | smudgeOrchestrator.ts | Add conversation awareness section to buildGenerationPrompt() | ~15 lines |
| 8 | smudgeOrchestrator.ts | Add rules 23-24 to generation prompt | ~5 lines |
| 9 | smudgeOrchestrator.ts | Step 12c: Persist ConversationState after generation [C1] | ~20 lines |
| 10 | smudgeOrchestrator.ts | Deserialize ConversationState fields (JSON strings) | ~10 lines |
| 11 | smudgeOrchestrator.ts | Session boundary detection (30-min heuristic) + 7-day mode reset | ~8 lines |

**Total: ~139 lines of new code in smudgeOrchestrator.ts + 1 new entity.**

### 13.2 Files NOT changed

| File | Status |
|---|---|
| shared/companionCore.ts | UNCHANGED |
| functions/companionService.ts | UNCHANGED |
| functions/engineUnderstanding.ts | UNCHANGED |
| functions/engineCapabilityIntelligence.ts | UNCHANGED |
| functions/engineDecisionReadiness.ts | UNCHANGED |
| functions/engineTransitionPartnership.ts | UNCHANGED |
| entities/UserProfile.json | UNCHANGED |
| Chat.jsx | UNCHANGED |
| Safety flows | UNCHANGED |

### 13.3 LLM call count

No additional LLM call. The 4 new interpretation fields are extracted in the existing interpretation call (step 4). The generation call (step 12) remains a single call (plus retry on validation failure, same as today).

**Cost impact:** Marginally longer prompts (interpretation prompt +4 fields in response schema, generation prompt +~15 lines of context). Estimated +200-400 tokens per turn. No additional API calls.

---

## 14. Acceptance Tests for SMUDGE 4

### 14.1 Test structure

SMUDGE 4 tests conversation awareness through natural conversation. The tester (Paul) interacts with Smudge through Chat.jsx as a fresh test user. All tests are behavioural — no API inspection required.

### 14.2 Tests

**T1 — No repetition across turns**
- Send a message sharing service branch
- Next turn, send a different message
- PASS: Smudge does NOT re-ask about service branch or repeat the same information

**T2 — Topic closure respected (same turn) [C1]**
- Discuss a topic (e.g., current circumstances)
- Say "that's all on that for now" or "let's move on"
- PASS: Smudge does NOT revisit the closed topic in its response to THIS message. The closure is detected and reflected in the same turn, not next turn.

**T3 — Focus change persists (same turn) [C1]**
- Be discussing one topic
- Change focus: "actually, can I ask you something about..."
- PASS: Smudge follows the new focus in its response to THIS message. The focus change is detected and reflected in the same turn.

**T4 — Help request recognised (same turn) [C1]**
- During discovery, ask: "can you help me understand what jobs I might be suited for?"
- PASS: Smudge provides help or signposting in its response to THIS message. Does NOT convert the request into another discovery question. The mode transition to "helping" happens this turn.

**T5 — Helping persists until explicit signal [C2]**
- Ask for help (T4)
- Continue the conversation for 2-3 turns about the help topic
- PASS: Smudge stays in helping mode. Does NOT revert to discovery questions without the user signaling a return.

**T6 — Returning user continuity**
- Have a conversation for 5+ turns
- Close MATE. Wait 30+ minutes (or simulate by clearing localStorage)
- Return and send "where were we?"
- PASS: Smudge gives a grounded recap referencing specific topics discussed. Does NOT say "I don't have any previous context" or restart from scratch

**T7 — Correction does not repeat**
- Smudge makes an assumption about something (e.g., implies a specific role)
- Correct: "no, I wasn't doing that — I was actually doing..."
- Next turn, send a related message
- PASS: Smudge does NOT repeat the corrected assumption. Uses the corrected information

**T8 — Natural progression to helping**
- Complete enough discovery for Smudge to have a picture
- Ask: "so what do you think I should do next?"
- PASS: Smudge provides guidance or suggestions. Does NOT ask another discovery question

**T9 — Non-regression (safety)**
- Send a message containing ambiguous safety language
- PASS: Safety classification fires correctly. ConversationState is not corrupted. After safety resolution, conversation continues normally

**T10 — Non-regression (lifecycle)**
- Complete discovery to EXPLORING → CONFIRMING transition
- PASS: Lifecycle transition fires correctly. ConversationState shows mode = "understanding" during CONFIRMING. Does not interfere with confirmation flow

**T11 — Non-regression (evidence gate)**
- Send a message with a reasonable_interpretation (not direct statement)
- PASS: Evidence gate still rejects uncertain interpretations. ConversationState does not bypass the gate

**T12 — One state record per profile [C3]**
- Start a new test user session
- Have 5+ turns of conversation
- PASS: Only ONE ConversationState record exists for the profile. No duplicate records created.

### 14.3 Test profile

Tests use a fresh test profile (created by Chat.jsx auto-bootstrap). ConversationState is created on first interaction. No pre-seeding required.

After testing, the test profile AND its ConversationState are deleted.

---

## 15. Explicit Question: Will this design allow Smudge to know when it has enough information to stop interviewing and start helping?

**YES.**

The mechanism is `conversation_mode`, which is independent of `tos_phase`:

1. **User-driven transition:** When the user sends a help request (detected by the interpretation LLM's `help_request` field), the orchestrator derives `conversation_mode = "helping"` BEFORE generation (step 11.5) [C1]. The generation LLM receives: "The user has asked for help with X. Help them. Do not ask another discovery question." This works even if areas_outstanding is non-empty — the user asked for help, so Smudge helps.

2. **Lifecycle-driven transition:** When companionCore transitions the lifecycle to CONFIRMED (all 6 areas substantive + user confirmed), the orchestrator sets `conversation_mode = "transitioning"`. The generation LLM receives: "Understanding is complete. Acknowledge the transition. Don't restart discovery."

3. **No premature return [C2]:** Helping mode persists until the user explicitly signals a return to discovery. There is no automatic "request resolved" transition. This prevents Smudge from slipping back into discovery mode mid-help.

4. **Explicit return [C2]:** `helping → understanding` only when the user explicitly signals it (e.g., "what else do you need to know about me?" or "let's go back to..."). The interpretation LLM detects this as `user_objective_signal` expressing a discovery goal + `help_request` empty. The orchestrator then transitions mode.

5. **No premature lifecycle transition:** `conversation_mode` does NOT override the lifecycle. A user in "helping" mode is still in EXPLORING or CONFIRMING lifecycle. The lifecycle transitions only when companionCore's substance checks pass. The conversation mode only affects what the generation LLM does THIS turn, not where the user is in their journey.

**The key architectural insight:** The current system conflates "data completeness" (lifecycle) with "what the user wants right now" (conversation mode). By separating them, Smudge can help when asked AND continue discovery when appropriate, without the lifecycle forcing one behaviour or the other.

---

## 16. Explicit Question: What information should deliberately NOT be persisted?

1. **Full conversation transcripts.** This is a running operational picture, not a chat log. We store summaries, not sentences. Paul's authority: "This is not a transcript-memory system."

2. **The user's exact words.** We store what was understood (topics, summaries, objectives), not what was said. The exception is `last_smudge_response` — Smudge's own output, needed for immediate continuity. This field is bounded (1000 chars max), single-turn retention, and acknowledged as potentially reflecting user-sensitive content [C4]. See §2.5.

3. **Interpretation internals.** Candidate discoveries, confidence scores, validation decisions, ambiguity flags — these are per-turn processing artifacts, not conversational state. They are already available in the response `_internal` for diagnostics.

4. **Emotional states.** "User seems frustrated" or "user appears anxious" are inferences, not facts. Storing them risks reifying an interpretation and causing Smudge to treat a transient emotion as a persistent trait. The conductor handles frustration per-turn; it does not need to persist.

5. **Analytics.** Session duration, message count, response time, click patterns. These are software metrics, not conversational state. Pilot Rule 3: "The pilot measures people, not software."

6. **Profile corrections as a separate list.** If a correction results in a profile update (e.g., "actually, I was in signals" → `service_branch` updated), the profile already reflects the correction. A separate correction log duplicates profile state and adds no behavioural value. If the correction is about Smudge's judgment (not a profile field), the conductor handles it per-turn with `ACCEPT_CORRECTION`. Storing "user said I was wrong about X" doesn't help future turns unless the same judgment error would recur — and the generation prompt already receives `topics_covered` and `current_focus`, which provide enough context to avoid repeating the error.

7. **Pending requests as a queue.** A request for help is captured by `user_objective` + `conversation_mode = "helping"`. A separate pending-requests queue implies Smudge has a task list, which it does not. The user asks, Smudge responds, the request is resolved. If the user asks for something that can't be resolved in one turn, `user_objective` retains it until explicitly changed.

---

## 17. Design Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                    smudgeOrchestrator                             │
│                                                                  │
│  Step 1:    Profile acquisition (UserProfile)       [existing]  │
│  Step 1.5:  ConversationState acquisition            [NEW] [C3] │
│             → read ONE ConversationState for profile_id          │
│             → create if none exists (exactly one)                │
│             → detect returning user                              │
│                                                                  │
│  Step 2:    Phase routing                            [existing]  │
│  Step 3:    Areas snapshot                           [existing]  │
│  Step 4:    Interpretation LLM                       [MODIFIED]  │
│             → +4 conversation signal fields in schema             │
│             → recent_context already included                   │
│  Step 5:    Validation                                [existing]  │
│  Step 6:    Safety classification                     [existing]  │
│  Steps 7-11: Conductor, ambiguity, validation,      [existing]  │
│              downgrade, companionCore                            │
│  Step 11.5: ConversationState derivation             [NEW] [C1] │
│             → extract signals from interpretation                 │
│             → derive updated state (mode, focus, topics, etc.)   │
│             → pass derived state to genContext                   │
│             → DO NOT persist yet                                  │
│  Step 12:   Generation LLM                           [MODIFIED]  │
│             → +recent_context in genContext                      │
│             → +conversation awareness fields (derived) [C1]      │
│             → +conversation awareness section in prompt          │
│             → +rules 23-24 in prompt                             │
│  Step 12c:  ConversationState persist                [NEW] [C1] │
│             → take derived state from step 11.5                  │
│             → add last_smudge_response (bounded 1000 chars) [C4]│
│             → add last_smudge_intent                              │
│             → persist via ConversationState.update()              │
│  Step 13:   Response                                 [existing]  │
│                                                                  │
│  companionCore:    UNCHANGED                                     │
│  companionService: UNCHANGED                                     │
│  Engines:          UNCHANGED                                     │
│  UserProfile:       UNCHANGED                                     │
│  Chat.jsx:          UNCHANGED                                     │
│  Safety flows:      UNCHANGED                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 18. Engineering Surface Summary

| Component | Change |
|---|---|
| ConversationState entity | NEW — 10 fields, 1 FK, one record per profile [C3] |
| smudgeOrchestrator.ts | MODIFIED — ~139 new lines, 0 existing lines changed |
| Interpretation schema | EXTENDED — 4 new output fields |
| Generation prompt | EXTENDED — 2 new sections, 2 new rules |
| genContext | EXTENDED — 8 new fields (from derived state) [C1] |
| Everything else | UNCHANGED |

---

## 19. Cipher Refinement Disposition

| # | Refinement | Disposition | Where |
|---|---|---|---|
| C1 | Derive before generation, persist after | APPLIED — Step 11.5 derives, step 12c persists. genContext receives derived state. | §5.1, §6.1, §17 |
| C2 | No automatic helping → understanding | APPLIED — Helping persists until explicit conversational signal. Removed "topic resolved" auto-return. Added safety valve (10-turn note). | §5.3, §8.2, §15 |
| C3 | One state record per profile | APPLIED — Step 1.5 enforces one record. No arbitrary lookup. Uses exact profile_id from step 1. | §3.2, §3.3, §4 |
| C4 | Bounded last_smudge_response + sensitive content acknowledgement | APPLIED — 1000 char cap, single-turn retention, cascade deletion, explicit privacy acknowledgement. | §2.5, §11.2 |

---

END OF DESIGN INTENT (v2).

STOP.

Awaiting final three-view approval (Paul + Cipher + Ash).
