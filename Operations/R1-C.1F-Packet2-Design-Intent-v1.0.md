# R1-C.1F — Packet 2 Design Intent: Confirmation Authority Gate

**Date:** 26 August 2026
**Author:** Ash (Chief Engineer)
**Status:** DESIGN INTENT — ENGINEERING AUTHORITY WITHHELD
**For review by:** Paul (Product Owner) + Cipher (Doctrine)
**Supersedes:** R1-C.1F-Packet2-Engineering-Challenge-v1.0 (key findings incorporated)

---

## 0. Document Purpose

This Design Intent specifies the exact engineering changes required to separate reflection validation from lifecycle progression authority in the GapMap MATE companion system. It resolves the SMUDGE 5 finding (F3: confirmation semantics conflated) and implements the doctrine decisions accepted by Paul and Cipher.

Engineering authority for Packet 2 is NOT granted by this document. It is submitted for three-view review.

---

## 1. Doctrine Decisions (Accepted)

These doctrine decisions from Paul + Cipher's review of the Engineering Challenge govern this Design Intent:

| # | Doctrine | How It Shapes This DI |
|---|---|---|
| 1 | Reflection validation is not progression authority | `confirming` sets `operational_picture_confirmed` only. Does not advance lifecycle. |
| 2 | Progression requires distinct authority | `progressing` advances lifecycle only when OP is validated AND response is bound to a Smudge progression invitation. |
| 3 | Bind authority to the conversational act | Pass `last_smudge_intent` to interpretation LLM. Authority derives from what Smudge asked, not from the user's word choice. |
| 4 | New evidence after validation invalidates | Any new accepted discovery after OP validation sets `operational_picture_confirmed = false`. Conservative rule for MVP. |
| 5 | One utterance may contain two authorities — but only explicitly | `confirming_progressing` classification when both validation and progression are explicit and independently identifiable in the same utterance. Never infer missing authority from momentum. |
| 6 | Preserve the successful Reflection Moment | R1-C.1E Reflection behaviour is unchanged. Only the authority semantics of the user's response change. |
| 7 | Packet 1 remains locked | POST_CONFIRMING_CONVERSATIONAL handler untouched. No PHASE_OUT_OF_SCOPE reintroduction. |
| 8 | Lifecycle remains unchanged | No new `tos_phase` states. CONFIRMING is the activity space for Reflection, validation, invitation, and decision. |
| 9 | Explicit holds remain | No Capability Intelligence, no CONFIRMED → EVALUATING, no Decision Readiness, no engine wiring, no personality work, no Packet 3. |

**Governing rule:** "An affirmation only has the authority of the question it answers."

---

## 2. Resolved Open Questions

### Q1: Combined Validation + Progression in One Utterance

**Question:** Should `progressing` when `operational_picture_confirmed === false` be treated as implied validation + progression, or should the system require separate validation first?

**Resolution (per doctrine point #5):** One utterance may carry both authorities only if both intents are explicit and independently identifiable. Add `confirming_progressing` as a distinct classification. When the LLM identifies both explicit validation AND explicit progression in the same utterance (bound to a Smudge progression invitation), it classifies as `confirming_progressing`. This sets `operational_picture_confirmed = true` AND advances to CONFIRMED.

If only `progressing` is classified (without prior validation and without explicit validation in the utterance), the system does NOT advance. The user must validate the reflection first. Never infer missing validation from progression momentum.

### Q2: Decline Classification

**Question:** Is `declining` a necessary new enum value?

**Resolution:** Yes. `declining` is semantically distinct from `rejecting` (which means "your reflection is wrong"). `declining` means "I'm not ready to move forward yet." It preserves `operational_picture_confirmed`, stays in CONFIRMING, and signals the generation layer not to immediately re-issue the progression invitation.

### Q3: Material Evidence Threshold

**Question:** Option A (any new discovery) vs Option B (core areas only)?

**Resolution (per doctrine point #4):** Option A — any new accepted discovery after OP validation makes it stale. Conservative for MVP. The cost of over-invalidation (one extra Reflection) is preferable to progressing against a stale Operational Picture.

### Q4: Progression Invitation Cadence

**Question:** If the user declines progression, how often should Smudge re-invite?

**Resolution:** Do not re-invite on the next turn. Let the conversation flow naturally. If the user raises capability-related topics or signals readiness, Smudge may re-invite. Generation guidance: "The user declined progression. Do not pressure. Do not immediately re-issue the invitation. Continue the conversation naturally."

### Q5: UI Change for Validated-But-Not-Progressed State

**Question:** Should `operational_picture_confirmed = true` with `tos_phase = CONFIRMING` trigger a UI change?

**Resolution:** Out of scope for Packet 2 engineering. The API already returns `tos_phase` and `confirmed` (via `m.confirmed`). The frontend can use these signals if desired. No new API fields required.

---

## 3. Current Signal Path (Summary)

Full trace documented in the Engineering Challenge (v1.0). Key points:

1. **Interpretation LLM** classifies `user_response_type` as one of: `answering | correcting | confirming | rejecting | none`. Prompt instruction: "Only confirming if explicit unambiguous affirmation." Does NOT specify affirmation of what. Does NOT receive `last_smudge_intent`.

2. **`safeUserResponseType`** downgrades `confirming`/`rejecting` to `answering` if not in CONFIRMING.

3. **companionCore** (lines ~354, ~372): `userResponseType === 'confirming'` sets `operational_picture_confirmed = true` AND `tos_phase = CONFIRMED` in the same pass.

4. **ConversationState** stores `last_smudge_intent` (generation `response_intent`) but does NOT pass it to the interpretation LLM.

5. **Generation LLM** produces `response_intent`: `ACKNOWLEDGE | EXPLORE | CLARIFY | REFLECT | CONFIRMATION_PROMPT | TRANSITION_ACKNOWLEDGEMENT`. No specific intent for progression invitation — `EXPLORE` is used for both discovery questions and progression invitations.

---

## 4. Design Changes

This section specifies every code change required. Changes are organised by file and component.

### 4.1 Interpretation LLM Schema (entry.ts)

**Current `user_response_type` enum:**
```
"answering", "correcting", "confirming", "rejecting", "none"
```

**New `user_response_type` enum:**
```
"answering", "correcting", "confirming", "rejecting", "progressing", "confirming_progressing", "declining", "none"
```

**Three new values added:**

| Value | Meaning | Authority |
|---|---|---|
| `progressing` | User explicitly accepts a Smudge progression invitation | Progression only. Requires prior OP validation (`operational_picture_confirmed === true`). |
| `confirming_progressing` | User explicitly validates the reflection AND explicitly accepts progression in the same utterance | Both. Sets `operational_picture_confirmed = true` AND advances to CONFIRMED. |
| `declining` | User explicitly declines a Smudge progression invitation | None. Preserves validation. Stays in CONFIRMING. Signals "do not re-invite immediately." |

**Schema description update:**

Current: `"Only confirming if explicit unambiguous affirmation"`

New:
```
"Classify based on what Smudge just asked or did (see Smudge's last conversational act above):
- 'confirming': User explicitly affirms that Smudge's reflection/summary is accurate. Only valid when Smudge's last act was a Reflection (REFLECT or CONFIRMATION_PROMPT).
- 'rejecting': User explicitly says Smudge's reflection is wrong. Only valid when Smudge's last act was a Reflection.
- 'progressing': User explicitly accepts Smudge's invitation to move forward. Only valid when Smudge's last act was a progression invitation (PROGRESSION_INVITATION) AND the Operational Picture has already been validated.
- 'confirming_progressing': User explicitly validates the reflection AND explicitly accepts progression in the same utterance. Only valid when Smudge's last act was a progression invitation (PROGRESSION_INVITATION). Both intents must be independently identifiable — never infer one from the other.
- 'declining': User explicitly declines Smudge's invitation to move forward. Only valid when Smudge's last act was a progression invitation (PROGRESSION_INVITATION).
- 'correcting': User corrects something Smudge said, at any stage.
- 'answering': None of the above. Normal conversational response.
- 'none': No classification possible.
A vague 'yeah', 'okay', or 'sounds good' inherits ONLY the authority of the Smudge act it responds to. Do not grant progression authority to a vague affirmation unless it is bound to a progression invitation. Do not grant validation authority to a vague affirmation unless it is bound to a reflection."
```

### 4.2 Interpretation LLM Prompt (entry.ts)

**Add `last_smudge_intent` to the interpretation prompt context.**

Current prompt includes `recentContextStr` (last 3-4 exchanges as text) and `currentPhase`. It does NOT include `last_smudge_intent`.

**Add after the recent context string:**

```typescript
const lastActStr = convState?.last_smudge_intent
  ? `\nSmudge's last conversational act: ${convState.last_smudge_intent}\n`
  : "\nSmudge's last conversational act: none (first message or session reset)\n";
```

**Insert `lastActStr` into `interpretPrompt`** between `recentContextStr` and the user's message.

**Add classification instruction:**

```
"Classify the user's response based on what Smudge just asked or did. The user's affirmation only has the authority of the question it answers. See the user_response_type schema description for binding rules.\n"
```

### 4.3 Generation LLM Schema (entry.ts)

**Add `PROGRESSION_INVITATION` to the `response_intent` enum.**

Current:
```
"ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "TRANSITION_ACKNOWLEDGEMENT"
```

New:
```
"ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "PROGRESSION_INVITATION", "TRANSITION_ACKNOWLEDGEMENT"
```

**`PROGRESSION_INVITATION`** = Smudge explicitly invites the user to move forward after the Operational Picture has been validated. Example: "Good. I think we've got a solid picture now. Shall we start looking at what all of that says about the capabilities you've built?"

This is distinct from:
- `CONFIRMATION_PROMPT` = "Can I tell you what I'm hearing?" (Reflection Moment invitation)
- `EXPLORE` = general discovery question
- `TRANSITION_ACKNOWLEDGEMENT` = acknowledging a lifecycle transition that has already occurred

**The generation LLM should only produce `PROGRESSION_INVITATION` when:**
- `operational_picture_confirmed === true`
- `tos_phase === 'CONFIRMING'`
- Smudge has not already issued a progression invitation that was declined

### 4.4 Generation Prompt Guidance (entry.ts)

**Add guidance for the post-validation, pre-progression state.**

When `operational_picture_confirmed === true` AND `tos_phase === 'CONFIRMING'`:

```
"- REFLECTION VALIDATED: The user has confirmed that your understanding is accurate. They have NOT yet chosen to move forward. Naturally invite them to explore their capabilities — something like 'Shall we start looking at what all of that says about what you're good at?' Do not force. If they decline, respect it and continue the conversation naturally."
```

When `operational_picture_confirmed === false` AND `tos_phase === 'CONFIRMING'` AND areas are sufficient (re-reflection after invalidation):

```
"- RE-REFLECTION NEEDED: The user shared new information after their previous validation. Your previous reflection may be stale. When the conversation naturally allows, offer an updated Reflection Moment incorporating the new information."
```

When the user has declined progression (tracked via generation context):

```
"- PROGRESSION DECLINED: The user declined to move forward. Do not pressure. Do not immediately re-issue the invitation. Continue the conversation naturally. You may re-invite if the user later raises capability-related topics or signals readiness."
```

**Add a new `response_intent` instruction:**

```
"14. Use PROGRESSION_INVITATION as your response_intent when you are inviting the user to move forward after their reflection has been validated. This is a natural question like 'Shall we look at what you're good at?' — not a system announcement."
```

### 4.5 `safeUserResponseType` (entry.ts)

**Current:**
```typescript
function safeUserResponseType(raw: string, mode: string): { safe: string; downgraded: boolean } {
  if (mode !== "CONFIRMING" && (raw === "confirming" || raw === "rejecting")) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}
```

**New:**
```typescript
function safeUserResponseType(raw: string, mode: string): { safe: string; downgraded: boolean } {
  // Authority signals only valid in CONFIRMING
  const authoritySignals = ["confirming", "rejecting", "progressing", "confirming_progressing", "declining"];
  if (mode !== "CONFIRMING" && authoritySignals.includes(raw)) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}
```

`correcting` remains valid in any phase (unchanged — users can correct Smudge at any time).

### 4.6 Placeholder Discoveries for Authority Signals (entry.ts)

**Current (line ~1590):**
```typescript
if (currentPhase === "CONFIRMING" && (R === "confirming" || R === "rejecting")) {
  h = { years_served: profile.years_served ?? 0 };
} else {
  m.no_discoveries = true;
  g = true;
}
```

**New:**
```typescript
if (currentPhase === "CONFIRMING" && ["confirming", "rejecting", "progressing", "confirming_progressing", "declining"].includes(R)) {
  h = { years_served: profile.years_served ?? 0 };
} else {
  m.no_discoveries = true;
  g = true;
}
```

This ensures companionCore runs for all authority signals even when no discoveries are present.

### 4.7 companionCore Logic (companionCore.ts)

This is the core change. Three sections:

#### 4.7.1 `operational_picture_confirmed` Setting (line ~354)

**Current:**
```typescript
operational_picture_confirmed: userResponseType === 'rejecting'
  ? false
  : (userResponseType === 'confirming' && profile.tos_phase === 'CONFIRMING'
      ? true
      : (profile.operational_picture_confirmed ?? false)),
```

**New:**
```typescript
// Packet 2: Reflection validation — separated from progression authority
operational_picture_confirmed:
  userResponseType === 'rejecting' || userResponseType === 'correcting'
    ? false
    : (userResponseType === 'confirming' || userResponseType === 'confirming_progressing') && profile.tos_phase === 'CONFIRMING'
      ? true
      : (userResponseType === 'declining' || userResponseType === 'progressing')
        ? (profile.operational_picture_confirmed ?? false) // preserve existing
        : (profile.operational_picture_confirmed ?? false),
```

**And add post-validation invalidation (immediately after the merge object):**

```typescript
// Packet 2: Post-validation invalidation — any new accepted discovery
// after OP validation makes it stale (doctrine point #4, conservative rule)
if (profile.operational_picture_confirmed === true
    && merged.operational_picture_confirmed === true
    && userResponseType !== 'confirming'
    && userResponseType !== 'confirming_progressing'
    && (newDiscoveries && Object.keys(newDiscoveries).length > 0)) {
  // Check that the discoveries are real (not the placeholder)
  const realDiscoveries = Object.keys(newDiscoveries).filter(k => k !== 'years_served');
  if (realDiscoveries.length > 0) {
    merged.operational_picture_confirmed = false;
  }
}
```

This invalidates when:
- OP was confirmed before this turn
- New real discoveries are being merged (not the placeholder)
- The user is NOT validating (not `confirming` or `confirming_progressing`)
- The user is NOT rejecting/correcting (those already set it to `false` above)

The placeholder `years_served: 0` is excluded from the real-discoveries check to prevent false invalidation on authority-only responses.

#### 4.7.2 Lifecycle Transition (line ~372)

**Current:**
```typescript
const userConfirmed = merged.operational_picture_confirmed === true;
const readyForConfirmation = allCoreSubstantive && understandingSubstantive;

if (userResponseType === 'confirming' && userConfirmed && profile.tos_phase === 'CONFIRMING') {
  newPhase = 'CONFIRMED';
}
```

**New:**
```typescript
const userConfirmed = merged.operational_picture_confirmed === true;
const readyForConfirmation = allCoreSubstantive && understandingSubstantive;

// Packet 2: Progression authority — separated from reflection validation
// Only 'progressing' or 'confirming_progressing' may advance CONFIRMING → CONFIRMED
if (profile.tos_phase === 'CONFIRMING') {
  if (userResponseType === 'confirming_progressing') {
    // Both authorities in one utterance — validate + advance
    newPhase = 'CONFIRMED';
  } else if (userResponseType === 'progressing' && userConfirmed) {
    // Progression only — requires prior validation
    newPhase = 'CONFIRMED';
  }
  // 'confirming' alone does NOT advance. User stays in CONFIRMING.
  // 'progressing' without prior validation does NOT advance. User stays in CONFIRMING.
}
```

#### 4.7.3 Mode Setting (line ~408)

**Current:**
```typescript
if (engineResult) {
  if (userResponseType === 'confirming' && engineResult.can_proceed && profile.tos_phase === 'CONFIRMING') {
    mode = 'CONFIRMED';
  } else if (userResponseType === 'rejecting' || userResponseType === 'correcting') {
    mode = 'RE_EXPLORING';
  } else if (engineResult.ready_for_confirmation && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    mode = 'REFLECTING';
  } else if (mode === 'RE_EXPLORING' && engineResult.missing_areas.length === 0) {
    mode = 'REFLECTING';
  }
}
```

**New:**
```typescript
if (engineResult) {
  if ((userResponseType === 'progressing' || userResponseType === 'confirming_progressing')
      && engineResult.can_proceed && profile.tos_phase === 'CONFIRMING') {
    mode = 'CONFIRMED';
  } else if (userResponseType === 'rejecting' || userResponseType === 'correcting') {
    mode = 'RE_EXPLORING';
  } else if (userResponseType === 'confirming') {
    // Reflection validated — stay in CONFIRMING (not CONFIRMED)
    mode = 'CONFIRMING';
  } else if (userResponseType === 'declining') {
    // Progression declined — stay in CONFIRMING
    mode = 'CONFIRMING';
  } else if (engineResult.ready_for_confirmation && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    mode = 'REFLECTING';
  } else if (mode === 'RE_EXPLORING' && engineResult.missing_areas.length === 0) {
    mode = 'REFLECTING';
  }
}
```

#### 4.7.4 `engineResult.can_proceed` (line ~400)

**Current:**
```typescript
can_proceed: userConfirmed && profile.tos_phase === 'CONFIRMING',
```

**New:**
```typescript
can_proceed: userConfirmed && profile.tos_phase === 'CONFIRMING',
// Note: can_proceed now means "OP validated and in CONFIRMING — ready for progression"
// It does NOT mean "will progress." Progression requires 'progressing' or 'confirming_progressing' classification.
```

No structural change to `can_proceed` — its semantic is now "validated and in CONFIRMING" which is the correct precondition for progression. The actual progression is gated by the `userResponseType` check in 4.7.2.

### 4.8 `buildFallbackResponse` (entry.ts)

**Add fallback for progression acknowledgement:**

After the existing `TRANSITION_ACKNOWLEDGEMENT` fallback:

```typescript
// Packet 2: Fallback when reflection validated but not progressed
if (ctx.confirmed && !ctx.lifecycle_transition && ctx.canonical_phase === 'CONFIRMING') {
  return {
    response_text: "Good — I've got that right then. Whenever you're ready, we can start looking at what all of this says about your capabilities. No rush.",
    response_intent: "PROGRESSION_INVITATION",
    asks_question: true
  };
}
```

### 4.9 Generation Context Updates (entry.ts)

**Track progression decline for generation context.**

Add to the `m` metadata object:

```typescript
progression_declined: false as boolean,
```

Set when `userResponseType === 'declining'`:

```typescript
if (R === 'declining') {
  m.progression_declined = true;
}
```

Pass to generation context:

```typescript
const genContext = {
  // ... existing fields ...
  progression_declined: m.progression_declined,
};
```

Add to generation prompt builder:

```typescript
if (ctx.progression_declined) {
  lines.push("- PROGRESSION DECLINED: The user declined to move forward. Do not pressure. Do not immediately re-issue the invitation. Continue the conversation naturally.");
}
```

### 4.10 ConversationState Update (entry.ts)

**No structural changes to ConversationState entity.**

`last_smudge_intent` already stores the generation `response_intent`. The new `PROGRESSION_INVITATION` value will be stored automatically.

The interpretation prompt now reads `convState.last_smudge_intent` (already fetched) and passes it to the interpretation LLM. No new ConversationState fields are needed.

### 4.11 `companionService` (companionService/entry.ts)

companionService uses the same `companionCore` and `safeUserResponseType` logic. If these functions are shared (they should be — the engineering contract requires it), the changes propagate automatically. If companionService has its own copy of `safeUserResponseType`, update it with the same one-line change from §4.5.

**Verify during implementation:** Check whether companionService imports `safeUserResponseType` from a shared location or has its own copy. If it has its own copy, update it identically.

---

## 5. Post-Validation Invalidation Logic

### 5.1 When Invalidation Fires

| Condition | Fires? | Rationale |
|---|---|---|
| `confirming` + new discoveries | No | Discoveries are part of validation |
| `confirming_progressing` + new discoveries | No | Same — validation is happening |
| `answering` + new discoveries + OP was true | **Yes** | New evidence after validation |
| `declining` + new discoveries + OP was true | **Yes** | New evidence after validation |
| `progressing` + new discoveries + OP was true | No | Progression is the response; discoveries are incidental |
| `rejecting` | N/A — already sets `false` | |
| `correcting` | N/A — already sets `false` | |
| Placeholder discoveries only (`years_served`) | No | Not real evidence |

### 5.2 What Happens After Invalidation

1. `operational_picture_confirmed` set to `false`
2. `tos_phase` remains `CONFIRMING`
3. User is NOT told "your validation has been invalidated"
4. Smudge incorporates the new information naturally
5. When the conversation naturally allows, Smudge offers an updated Reflection Moment (generation guidance: "RE-REFLECTION NEEDED")
6. The cycle repeats: Reflect → Validate → Invite → Decide

### 5.3 No New Lifecycle State

The invalidation is a return to the pre-validation state within CONFIRMING. It is not a new state. CONFIRMING is the activity space where Reflection, validation, invalidation, re-reflection, invitation, and decision all occur.

---

## 6. Binding Mechanism: How Authority Is Bound to the Conversational Act

### 6.1 The Binding Chain

```
Generation LLM produces response_intent
  ↓
response_intent persisted as last_smudge_intent in ConversationState
  ↓
Next turn: last_smudge_intent passed to interpretation LLM
  ↓
Interpretation LLM classifies user_response_type based on:
  1. last_smudge_intent (structured: what Smudge just did)
  2. recent_context (textual: the actual conversation)
  3. User's message
  ↓
Classification determines authority:
  - REFLECT/CONFIRMATION_PROMPT → confirming/rejecting/correcting (validation authority)
  - PROGRESSION_INVITATION → progressing/confirming_progressing/declining (progression authority)
  - EXPLORE/ACKNOWLEDGE/CLARIFY → answering (no authority)
```

### 6.2 Reliability

The binding relies on:
1. **`last_smudge_intent`** being accurate (generation LLM produces correct intent) — already proven reliable in R1-C.1D and SMUDGE 5 testing
2. **`recent_context`** being available (frontend passes 3-4 exchanges) — already required by R1-C.1D
3. **Interpretation LLM** correctly binding the user's response to Smudge's act — this is the new capability

**Risk of misclassification:** If the LLM classifies "yeah" as `progressing` when Smudge's last act was `EXPLORE` (discovery question, not progression invitation), the system would attempt progression without a valid invitation. Mitigation: the `safeUserResponseType` gate checks `mode === 'CONFIRMING'`, and the companionCore progression check requires `operational_picture_confirmed === true`. If neither condition is met, progression is blocked. The worst case is `operational_picture_confirmed = true` without progression — safe and recoverable.

**Risk of stale `last_smudge_intent`:** If the user returns after a session break, `last_smudge_intent` from the previous session is still stored. If it was `PROGRESSION_INVITATION` and the user says "yeah" on return, the LLM might classify as `progressing`. This is acceptable — if the OP was validated and Smudge invited progression before the break, the user returning and saying "yeah" to the progression invitation is a valid progression. If the OP was NOT validated, progression is blocked by the `operational_picture_confirmed` check.

---

## 7. Effects on Existing Systems

| System | Effect | Change Required |
|---|---|---|
| R1-C.1E Extraction | None | Untouched |
| R1-C.1E Sufficiency Gate | None | Untouched |
| R1-C.1E Reflection Behaviour | None — Reflection Moment is unchanged | Untouched |
| Packet 1 (POST_CONFIRMING_CONVERSATIONAL) | None — handler is lifecycle-neutral | Untouched |
| engineCapabilityIntelligence | None — gates on `tos_phase` and `operational_picture_confirmed` independently | No change |
| engineDecisionReadiness | None — gates on `tos_phase` only | No change |
| engineUnderstanding | None — assessment-only, doesn't write `tos_phase` | No change |
| engineTransitionPartnership | None — gates on `tos_phase` | No change |
| companionService | Inherits companionCore changes. Check `safeUserResponseType` sharing. | Verify import path |
| ConversationState derivation | None — uses `interpretation.intent`, not `user_response_type` | No change |
| Generation LLM | New `response_intent` value (`PROGRESSION_INVITATION`) + new guidance lines | Prompt + schema update |
| Fallback responses | New fallback for validated-but-not-progressed | One new case |

---

## 8. Acceptance Test Matrix

All tests run against the canonical GapMap MATE runtime with a test profile in CONFIRMING state.

### Test Profiles

| Variable | Value |
|---|---|
| Entity | UserProfile |
| Pre-test state | `tos_phase: CONFIRMING`, `operational_picture_confirmed: false` |
| Post-test | Revert to pre-test state |

### Test Matrix

| Test | Scenario | Pre-conditions | last_smudge_intent | User Input | Expected tos_phase | Expected op_confirmed | Expected orchestration_note | Key Assertion |
|---|---|---|---|---|---|---|---|---|
| T1 | Reflection validation | CONFIRMING, op_confirmed=false | REFLECT | "Yes, that's exactly right." | CONFIRMING (unchanged) | true | CONFIRMING_VALIDATED | OP validated; lifecycle does NOT advance |
| T2 | Explicit progression | CONFIRMING, op_confirmed=true | PROGRESSION_INVITATION | "Yeah, let's do it." | CONFIRMED | true | CONFIRMING_ADVANCED | Progression with prior validation advances |
| T3 | Decline progression | CONFIRMING, op_confirmed=true | PROGRESSION_INVITATION | "Not yet." | CONFIRMING (unchanged) | true (unchanged) | CONFIRMING_DECLINED | Validation preserved; no advance; no re-invite |
| T4 | Additional evidence after validation | CONFIRMING, op_confirmed=true | EXPLORE | "Actually, I'd probably travel further if the right job came up." | CONFIRMING (unchanged) | false (invalidated) | CONFIRMING_REOPENED | New evidence invalidates validation |
| T5 | Correction of reflection | CONFIRMING, op_confirmed=false | REFLECT | "No, you've got the location bit wrong." | CONFIRMING (unchanged) | false | CONFIRMING_CORRECTED | Correction accepted; re-reflect when appropriate |
| T6 | Ambiguous affirmation (discovery context) | CONFIRMING, op_confirmed=false | EXPLORE | "Yeah" | CONFIRMING (unchanged) | unchanged | CONFIRMING_ANSWERING | "Yeah" to discovery question = answering, not confirming |
| T7 | **SMUDGE 5 regression** | CONFIRMING, op_confirmed=false | REFLECT | "Yes." | **CONFIRMING (unchanged)** | **true** | **CONFIRMING_VALIDATED** | **"Yes" to reflection validates OP; lifecycle MUST remain CONFIRMING** |
| T8 | Packet 1 regression | CONFIRMED, op_confirmed=true | (any) | "So what happens now?" | CONFIRMED (unchanged) | unchanged | POST_CONFIRMING_CONVERSATIONAL | Packet 1 handler still works |
| T9 | Combined validation + progression | CONFIRMING, op_confirmed=false | PROGRESSION_INVITATION | "Yeah, you've got that right — let's crack on." | CONFIRMED | true | CONFIRMING_ADVANCED | Both explicit authorities in one utterance |
| T10 | Progression without prior validation | CONFIRMING, op_confirmed=false | PROGRESSION_INVITATION | "Yeah, let's move on." | CONFIRMING (unchanged) | unchanged | CONFIRMING_NOT_VALIDATED | Progression blocked — no prior validation |
| T11 | Decline with new evidence | CONFIRMING, op_confirmed=true | PROGRESSION_INVITATION | "Not yet — actually, I also did a tour in Cyprus." | CONFIRMING (unchanged) | false (invalidated) | CONFIRMING_REOPENED | Decline + new evidence invalidates |
| T12 | Re-reflection after invalidation | CONFIRMING, op_confirmed=false (post-invalidation), sufficient areas | EXPLORE | "That's everything I think." | CONFIRMING (unchanged) | false | CONFIRMING_RE_REFLECT | Smudge offers re-reflection |
| T13 | Vague affirmation to progression invitation | CONFIRMING, op_confirmed=true | PROGRESSION_INVITATION | "Okay" | CONFIRMED | true | CONFIRMING_ADVANCED | Vague affirmation bound to progression invitation carries progression authority |

### Critical Tests

**T7 (SMUDGE 5 regression):** The exact scenario from the live exercise. Reflection asks whether summary is accurate → user answers "Yes" → OP may be validated → lifecycle MUST remain CONFIRMING. This is the test that would have failed under the old code.

**T2 (Progression proof):** Validated OP → Smudge explicitly invites progression → user explicitly accepts → CONFIRMING → CONFIRMED. This proves the progression path works when authority is properly established.

**T10 (Authority gate):** Progression without prior validation is blocked. The user cannot skip reflection validation.

**T13 (Vague affirmation bound to act):** "Okay" in response to a progression invitation carries progression authority. This is correct per the governing rule: "An affirmation only has the authority of the question it answers." The user IS answering the progression invitation — "okay" is sufficient. This is NOT a keyword classifier — the LLM binds the response to the act using `last_smudge_intent`.

### Test Notes

- T9 tests the combined authority case. Both intents must be explicit and independently identifiable. "Yeah, you've got that right" (validation) + "let's crack on" (progression). The LLM must classify as `confirming_progressing`.
- T10 tests that `progressing` without prior validation does NOT advance. The user says "let's move on" but hasn't validated the reflection. The system stays in CONFIRMING.
- T13 tests that vague affirmations inherit the authority of the act they respond to. "Okay" to a progression invitation = progression. "Okay" to a discovery question = answering (T6).

---

## 9. Implementation Sequence

### Phase 1: Interpretation Layer (entry.ts)

1. Add `progressing`, `confirming_progressing`, `declining` to `user_response_type` enum
2. Add `last_smudge_intent` to interpretation prompt context
3. Update interpretation prompt instructions for binding classification
4. Update `safeUserResponseType` to handle new values
5. Update placeholder discoveries condition for new authority signals

### Phase 2: companionCore Logic (companionCore.ts)

1. Update `operational_picture_confirmed` setting logic
2. Add post-validation invalidation check
3. Update lifecycle transition logic (separate `confirming` from `progressing`)
4. Update mode setting logic
5. Update `can_proceed` comment (no structural change)

### Phase 3: Generation Layer (entry.ts)

1. Add `PROGRESSION_INVITATION` to generation `response_intent` enum
2. Add generation guidance for validated-but-not-progressed state
3. Add generation guidance for re-reflection after invalidation
4. Add generation guidance for progression declined
5. Add new rule for `PROGRESSION_INVITATION` usage
6. Update `buildFallbackResponse` with validated-not-progressed fallback
7. Add `progression_declined` tracking to metadata and generation context

### Phase 4: companionService (if needed)

1. Verify `safeUserResponseType` is shared or update copy
2. Verify `companionCore` is shared — changes propagate automatically

### Phase 5: Acceptance Testing

1. Deploy to canonical runtime
2. Run T1-T13 against canonical app with test profile
3. Verify all tests pass
4. Clean up test profile
5. Issue SITREP

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM misclassifies `confirming` vs `progressing` | Medium | Low (safe: validated but not progressed) | `last_smudge_intent` context + prompt instructions |
| LLM never classifies as `progressing` | Medium | Medium (user stuck in CONFIRMING) | Generation guidance for PROGRESSION_INVITATION + fallback |
| LLM classifies `confirming_progressing` too eagerly | Low | Medium (skips validation step) | Doctrine: "both intents must be independently identifiable" — prompt is strict |
| Post-validation invalidation too aggressive | Low | Low (one extra Reflection) | Accepted by doctrine — conservative is preferable |
| `declining` not classified correctly | Low | Low (falls to `answering`, user stays CONFIRMING) | Safe fallback |
| Generation LLM never produces `PROGRESSION_INVITATION` | Low | Medium (user stuck in CONFIRMING) | Fallback response + guidance |
| `last_smudge_intent` stale across sessions | Low | Low (progression requires OP validation) | OP validation check is the backstop |
| companionService `safeUserResponseType` not shared | Low | Low (update copy if needed) | Verify in Phase 4 |

**Overall risk: LOW.** The change is additive (new enum values, new routing) not subtractive. Every misclassification falls to a safe state (stay in CONFIRMING).

---

## 10. What This DI Does NOT Do

- Does NOT add new persisted fields to UserProfile or ConversationState
- Does NOT change the R1-C.1E extraction, sufficiency, or Reflection behaviour
- Does NOT change the lifecycle state model (no new `tos_phase` values)
- Does NOT wire any engine into the Smudge conversation path
- Does NOT change the POST_CONFIRMING_CONVERSATIONAL handler (Packet 1)
- Does NOT introduce Capability Intelligence, Decision Readiness, or Transition Partnership
- Does NOT change the EXPLORING → CONFIRMING boundary
- Does NOT introduce personality work or voice changes
- Does NOT include Packet 3 engineering

---

## 11. Summary

Packet 2 separates reflection validation from lifecycle progression authority by:

1. **Splitting the classification signal** — `confirming` (validation only), `progressing` (progression only), `confirming_progressing` (both, explicitly), `declining` (preserve, don't re-invite)
2. **Binding authority to the conversational act** — passing `last_smudge_intent` to the interpretation LLM so it knows what Smudge just asked
3. **Adding `PROGRESSION_INVITATION` to the generation schema** — so the system can distinguish a progression invitation from a discovery question
4. **Invalidating on new evidence** — any new accepted discovery after validation makes it stale
5. **No new persisted fields** — the existing `operational_picture_confirmed` and `tos_phase` keep their semantics; only the signal routing changes

The SMUDGE 5 failure mode ("Yes" to a reflection → CONFIRMED) is eliminated. The progression proof (validated → invited → accepted → CONFIRMED) is established. The companion relationship is preserved throughout.

---

**END OF DESIGN INTENT.**

**Engineering authority for Packet 2 has NOT been granted. This document is for Paul + Cipher review only.**

**STOP.**
