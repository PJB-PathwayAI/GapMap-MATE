# R1-C.1F — Packet 2 Engineering Challenge: Confirmation Authority Gate

**Date:** 26 August 2026
**Author:** Ash (Chief Engineer)
**Status:** DESIGN CHALLENGE ONLY — ENGINEERING AUTHORITY NOT GRANTED
**Packet 1:** CLOSED / PRESERVE
**Packet 3+:** HOLD
**For review by:** Paul (Product Owner) + Cipher (Doctrine)

---

## 0. Executive Summary

The conflation is real, precisely localised, and fixable with a smaller change than the proposed contract suggests. No new persisted fields on UserProfile are required. The existing `operational_picture_confirmed` and `tos_phase` already represent the correct two concepts — the defect is that a single LLM classification signal (`userResponseType === 'confirming'`) is wired to both. The smallest safe fix is to split that signal into two distinct classifications at the interpretation layer, then gate the lifecycle transition on the progression-specific signal only.

ConversationState already stores `last_smudge_intent` but does not pass it to the interpretation LLM. This is the missing binding mechanism — the system already knows what Smudge's last act was, it just doesn't use that knowledge when classifying the user's response.

---

## 1. Current End-to-End Signal Path (As-Built Trace)

### 1.1 Entry Point

Frontend sends `POST /api/functions/smudgeOrchestrator` with:
- `user_message` — the user's text
- `recent_context` — array of 3-4 recent exchanges `[{role, text}]`

### 1.2 Profile + ConversationState Fetch

Orchestrator fetches:
- `UserProfile` (first profile for authenticated user, deserialised)
- `ConversationState` (by `user_profile_id`, or created if absent)

Both are fetched via service-role (`base44.asServiceRole`) or user-scoped (`base44.entities`) depending on auth context.

### 1.3 Safety Classification (Pre-Interpretation)

If `safety_flags` has a pending state, a separate LLM safety classification call runs first. If `clear_concern` or `ambiguous`, the response is handled via safety pathway — interpretation and companionCore are skipped.

### 1.4 LLM Interpretation Call (First LLM)

The orchestrator constructs `interpretPrompt` containing:
- Profile phase (`currentPhase` — e.g. "CONFIRMING")
- Areas explored / outstanding
- Profile summary (professional_identity, service_branch)
- `recent_context` (last 3-4 exchanges as text)
- User's message

**NOT included in the interpretation prompt:**
- `last_smudge_intent` (Smudge's last conversational act type)
- `last_smudge_response` (Smudge's last response text — though it appears in recent_context)
- `operational_picture_confirmed` state
- Whether a Reflection Moment has been offered

The LLM classifies (among other things):
- `user_response_type`: `"answering" | "correcting" | "confirming" | "rejecting" | "none"`
- Schema description: `"Only confirming if explicit unambiguous affirmation"`

**Critical observation:** The LLM is told to classify as "confirming" if the user gives "explicit unambiguous affirmation" — but the prompt does not specify *affirmation of what*. The LLM has `recent_context` and can see Smudge's last message, but the classification instruction is not bound to Smudge's preceding act.

### 1.5 user_response_type Downgrade (Lifecycle-Aware Gate)

```typescript
function safeUserResponseType(raw: string, mode: string) {
  if (mode !== "CONFIRMING" && (raw === "confirming" || raw === "rejecting")) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}
```

If the profile is NOT in `CONFIRMING` phase, any `confirming` or `rejecting` classification is downgraded to `answering`. This prevents confirmation signals from firing outside CONFIRMING — but it does not distinguish between reflection validation and progression authority WITHIN CONFIRMING.

### 1.6 companionCore (Deterministic Domain Logic)

Receives `userResponseType` (post-downgrade) and processes:

```typescript
// Line ~354: operational_picture_confirmed is set
operational_picture_confirmed: userResponseType === 'rejecting'
  ? false
  : (userResponseType === 'confirming' && profile.tos_phase === 'CONFIRMING'
      ? true
      : (profile.operational_picture_confirmed ?? false)),

// Line ~372: lifecycle transition — SAME signal
const userConfirmed = merged.operational_picture_confirmed === true;
if (userResponseType === 'confirming' && userConfirmed && profile.tos_phase === 'CONFIRMING') {
  newPhase = 'CONFIRMED';
}
```

**This is the exact point of conflation.** A single `userResponseType === 'confirming'`:

1. Sets `operational_picture_confirmed = true` (reflection validation)
2. Sets `newPhase = 'CONFIRMED'` (lifecycle progression)

Both happen in the same code block, triggered by the same signal, in the same execution pass. There is no separate progression authority signal.

### 1.7 Persistence

The merged profile (including `operational_picture_confirmed` and `tos_phase`) is persisted via `base44.asServiceRole.entities.UserProfile.update()`.

### 1.8 Generation (Second LLM)

The generation LLM produces a response with `response_intent` — one of: `ACKNOWLEDGE`, `EXPLORE`, `CLARIFY`, `REFLECT`, `CONFIRMATION_PROMPT`, `TRANSITION_ACKNOWLEDGEMENT`.

The `response_intent` is persisted to ConversationState as `last_smudge_intent`.

### 1.9 ConversationState Persist

`last_smudge_response` (truncated to 1000 chars) and `last_smudge_intent` are persisted to ConversationState.

---

## 2. Exact Point of Conflation

**File:** `companionCore.ts`
**Lines:** ~354 and ~372

The conflation occurs because `userResponseType === 'confirming'` is the sole authority for two semantically distinct acts:

| Act | What it means | Current trigger | What it should require |
|---|---|---|---|
| Reflection validation | "Smudge understood me correctly" | `userResponseType === 'confirming'` | User affirming the accuracy of a reflection |
| Progression authority | "I choose to move forward" | `userResponseType === 'confirming'` (same signal) | User responding to an explicit progression invitation |

The system has no concept of "what question is being answered." The LLM classification is generic: "confirming if explicit unambiguous affirmation." The `safeUserResponseType` gate ensures this only fires in CONFIRMING, but within CONFIRMING, any affirmative response carries both authorities.

### The SMUDGE 5 failure mode

1. Sufficiency gate fires → Smudge enters CONFIRMING
2. Generation LLM produces a Reflection Moment (response_intent: `REFLECT` or `CONFIRMATION_PROMPT`)
3. User says "Yes" (meaning: "you understood me correctly")
4. Interpretation LLM classifies as `confirming` (because it's an unambiguous affirmation)
5. companionCore sets `operational_picture_confirmed = true` AND `tos_phase = CONFIRMED`
6. User is now in CONFIRMED without ever being invited to progress

---

## 3. Smallest Safe Architectural Separation

### 3.1 Proposed Approach: Split the Classification Signal

Add one new value to the `user_response_type` enum:

| Value | Meaning | Authority |
|---|---|---|
| `confirming` | "Yes, your reflection is accurate" | Reflection validation only. Sets `operational_picture_confirmed = true`. Does NOT advance lifecycle. |
| `progressing` | "Yes, I'm ready to move forward" | Progression authority. Advances `tos_phase` from CONFIRMING to CONFIRMED. Requires `operational_picture_confirmed === true` as precondition. |

### 3.2 Why This Is the Smallest Change

| Dimension | Impact |
|---|---|
| New persisted fields on UserProfile | **None.** `operational_picture_confirmed` and `tos_phase` keep their current semantics. |
| New persisted fields on ConversationState | **None.** `last_smudge_intent` already exists and stores the binding context. |
| Interpretation LLM schema change | **One enum value added.** `"progressing"` added to `user_response_type`. |
| Interpretation LLM prompt change | **Prompt instruction added.** Tell the LLM to distinguish reflection validation from progression based on what Smudge just asked. Pass `last_smudge_intent` into the prompt. |
| companionCore logic change | **Two lines.** Split the current `confirming` handler: `confirming` sets `operational_picture_confirmed` only; `progressing` transitions lifecycle (gated on `operational_picture_confirmed === true`). |
| `safeUserResponseType` change | **One line.** Accept `progressing` alongside `confirming` in CONFIRMING phase. |
| Engine changes | **None.** Engines already gate on `tos_phase` and `operational_picture_confirmed` independently. |
| Packet 1 invariant | **Preserved.** POST_CONFIRMING_CONVERSATIONAL handler is untouched. |
| R1-C.1E extraction/sufficiency | **Untouched.** Extraction, sufficiency gate, and Reflection behaviour are unchanged. |

### 3.3 Why No New Persisted Fields Are Required

The proposed contract asks whether separate persisted signals are needed. The answer is **no** — the existing fields already represent the right concepts:

- `operational_picture_confirmed` (boolean) = "Has the user validated Smudge's reflection?" This is the correct semantic for reflection validation.
- `tos_phase` (enum) = "Where is the user in the lifecycle?" This is the correct semantic for lifecycle position.

The defect is not in the persisted fields — it's in the **signal routing**. One LLM classification triggers both writes. Splitting the classification into `confirming` (reflection validation) and `progressing` (progression authority) fixes the routing without changing the persistence model.

### 3.4 How `operational_picture_confirmed` Changes

Currently: `operational_picture_confirmed = true` ⟹ `tos_phase = CONFIRMED` (in the same pass).

After: `operational_picture_confirmed = true` ⟹ user stays in CONFIRMING. Progression to CONFIRMED requires a separate `progressing` signal.

This means `operational_picture_confirmed = true` with `tos_phase = CONFIRMING` becomes a **valid and expected state** — the user has validated the reflection but hasn't yet chosen to advance.

### 3.5 Downstream Engine Impact

**engineCapabilityIntelligence:**
- Precondition check (line 83): `operational_picture_confirmed === true` — unchanged. This would now pass while `tos_phase === CONFIRMING`, which is correct: the picture is confirmed, capability work can begin when the user chooses to advance.
- Lifecycle guard (line 136): requires `tos_phase === 'CONFIRMED' || 'EVALUATING'` — unchanged. This is the correct gate: capability work requires the user to have chosen to advance, not just validated the reflection.
- **No change needed.** The two checks already serve their correct purposes independently.

**engineDecisionReadiness:**
- Checks `tos_phase` only — does not check `operational_picture_confirmed`. Unchanged.

**engineUnderstanding:**
- Assessment-only, does not write `tos_phase` or `operational_picture_confirmed`. Unchanged.

**engineTransitionPartnership:**
- Checks `tos_phase`. Unchanged.

---

## 4. Binding a Response to Smudge's Preceding Act

### 4.1 What ConversationState Already Stores

| Field | Type | Purpose |
|---|---|---|
| `last_smudge_response` | string (≤1000 chars) | Smudge's last response text |
| `last_smudge_intent` | string enum | Smudge's last conversational act: ACKNOWLEDGE, EXPLORE, CLARIFY, REFLECT, CONFIRMATION_PROMPT, TRANSITION_ACKNOWLEDGEMENT |

### 4.2 Current Gap

`last_smudge_intent` is persisted to ConversationState but is **NOT passed to the interpretation LLM**. The interpretation prompt includes:
- `recent_context` (3-4 exchanges as text) — the LLM can see Smudge's last words but not the structured intent
- `currentPhase` — the lifecycle phase

The LLM classifies `user_response_type` without explicit knowledge of whether Smudge's last act was a Reflection, a Confirmation Prompt, a progression invitation, or a discovery question.

### 4.3 Proposed Binding Mechanism

Pass `last_smudge_intent` into the interpretation prompt as structured context:

```
Smudge's last conversational act: {last_smudge_intent}
```

Then instruct the LLM:

```
Classify the user's response based on what Smudge just asked or did:
- If Smudge offered a reflection or asked "does that sound right?" and the user affirms → "confirming" (reflection validation)
- If Smudge invited the user to move forward (e.g. "shall we look at what you're good at?") and the user agrees → "progressing" (progression authority)
- If the user's affirmation is ambiguous or not responding to a specific Smudge act → "answering"
```

### 4.4 Reliability Assessment

**Strengths:**
- `last_smudge_intent` is a structured enum, not free text — deterministic and unambiguous
- The `recent_context` already provides the conversation text for the LLM to reason about
- The LLM is already classifying intent — this adds context, not complexity

**Weaknesses:**
- `last_smudge_intent` tells us what Smudge intended, but not the exact wording. A `CONFIRMATION_PROMPT` could be "Does that sound right?" or "Is that a fair summary?" — the LLM needs to match the user's response to the specific question asked, not just the intent category.
- If `recent_context` is missing or stale (frontend doesn't pass it), the LLM has less context. But `last_smudge_intent` is always available from ConversationState.
- If Smudge generates a response that doesn't match its declared `response_intent` (LLM classified it as REFLECT but the text was actually a discovery question), the binding is wrong. This is a generation-layer reliability issue, not a classification issue.

**Mitigation:**
- `last_smudge_intent` + `recent_context` together provide both structured and textual context
- The `response_intent` enum is small and well-defined — the LLM is already producing it reliably
- If `last_smudge_intent` is null or unknown (first message, session reset), no progression invitation has been made — "confirming" defaults to reflection validation only

**Verdict:** The binding is reliable enough for the authority separation. The combination of `last_smudge_intent` (structured) + `recent_context` (textual) gives the interpretation LLM sufficient context to distinguish reflection validation from progression. The system does not need a new generic keyword/intent classifier — it needs to pass the existing context to the existing classifier.

---

## 5. Material New Evidence After Validation

### 5.1 Proposed Doctrine

> Material new evidence or correction after Reflection validation must invalidate or reopen that validation where appropriate before progression can occur.

### 5.2 How This Should Work Against the Existing Architecture

**Current behaviour:** When new discoveries are extracted (regardless of `operational_picture_confirmed` state), companionCore merges them into the profile. The `operational_picture_confirmed` field is only modified by `userResponseType` — it's set to `true` by `confirming`, `false` by `rejecting`, and preserved otherwise.

**Proposed behaviour:** When material new evidence is accepted after `operational_picture_confirmed === true`:

1. **Deterministic check:** If new discoveries are accepted AND `operational_picture_confirmed === true`, set `operational_picture_confirmed = false` (invalidate the validation).
2. **Conversation continues:** Smudge remains in CONFIRMING. The user is not told "your validation has been invalidated" — Smudge simply incorporates the new information and, when appropriate, offers a new Reflection.
3. **No new lifecycle state:** The user stays in CONFIRMING. The invalidation is a return to the pre-validation state within CONFIRMING, not a new state.
4. **Re-reflection:** When sufficiency is re-established (or the user signals they've finished adding), Smudge offers a new Reflection Moment. The cycle repeats.

### 5.3 What Counts as "Material"

This is the hardest design question. Options:

**Option A — Any new discovery invalidates:** Simplest. Any accepted discovery after confirmation reopens validation. Risk: over-invalidating on minor additions.

**Option B — New discoveries in core areas invalidate:** Only new evidence in the 4 core areas (Who/What/Where/Where going) invalidates. More nuanced but requires a deterministic check that maps discoveries to areas.

**Option C — LLM judgment:** The interpretation LLM or a separate judgment call determines whether the new evidence is "material." More flexible but adds LLM dependency to the invalidation path.

**Recommendation:** Option A for MVP simplicity, with a note that Option B is a refinement if over-invalidation becomes a problem in pilot. The doctrine says "where appropriate" — Option A treats all post-confirmation evidence as appropriate to reopen, which is conservative and safe. The cost of over-invalidation is low (user gets a new Reflection Moment, which is a natural conversational act). The cost of under-invalidation is high (user progresses with a stale picture).

### 5.4 Correction After Validation

If the user says "No, you've got the location bit wrong" after previously confirming:

- `userResponseType === 'correcting'` — already handled
- `operational_picture_confirmed` is set to `false` (via `rejecting` path or explicitly)
- Smudge accepts the correction, remains in CONFIRMING
- Re-reflects when appropriate

This already works in the current architecture for `rejecting` and `correcting` responses. The only new behaviour needed is that `operational_picture_confirmed` is also invalidated when **new evidence** arrives after confirmation (not just when the user explicitly rejects or corrects).

---

## 6. Effects on Existing Systems

### 6.1 R1-C.1E Extraction

**Untouched.** The extraction layer decomposes user messages into candidate discoveries, validates provenance, and passes them to companionCore. The extraction logic does not reference `user_response_type` or `operational_picture_confirmed`.

### 6.2 R1-C.1E Sufficiency Gate

**Untouched.** The sufficiency gate fires in EXPLORING only, determining when to transition to CONFIRMING. It does not interact with `operational_picture_confirmed` or the CONFIRMING→CONFIRMED transition.

### 6.3 R1-C.1E Reflection Behaviour

**Untouched.** The generation LLM produces Reflection Moments based on sufficiency context and behavioural guidance. The Reflection is a generation-layer act — it doesn't depend on `user_response_type`.

**One new generation consideration:** After reflection validation (without progression), Smudge needs to know it can invite progression. The generation context already includes `ready_to_confirm` and `confirmed` — these signals need to be updated:
- `confirmed = true` when `operational_picture_confirmed === true` (reflection validated)
- Generation guidance should instruct Smudge to naturally invite progression when `confirmed && tos_phase === 'CONFIRMING'`
- This is a prompt/guidance change, not a structural change

### 6.4 Packet 1 (POST_CONFIRMING_CONVERSATIONAL)

**Preserved.** The POST_CONFIRMING handler runs for all phases ≥ CONFIRMED. It is lifecycle-neutral and does not reference `user_response_type` or `operational_picture_confirmed`. No change needed.

### 6.5 companionService (Standalone API)

companionService is a thin wrapper around the same companionCore. If companionCore is updated, companionService inherits the change. The `safeUserResponseType` function in companionService would need the same one-line update (accept `progressing` in CONFIRMING).

### 6.6 ConversationState Derivation

`deriveConversationState` does not reference `user_response_type` directly. It uses `interpretation.intent`, `topic_signal`, `topic_label`, `help_request`, and `user_objective_signal`. No change needed.

---

## 7. Edge Cases, Race Conditions, and Authority Ambiguities

### 7.1 "Yes" to a Non-Reflection Question in CONFIRMING

**Scenario:** Smudge is in CONFIRMING and asks a discovery question (e.g. "Tell me more about your leadership role"). User says "Yeah, so I had 12 lads under me."

**Current behaviour:** "Yeah" could be classified as `confirming` → lifecycle transition.
**After fix:** "Yeah" in response to a discovery question is `answering`, not `confirming` or `progressing`. The interpretation LLM, with `last_smudge_intent` context, should classify this as `answering` because Smudge's last act was `EXPLORE`, not `REFLECT` or `CONFIRMATION_PROMPT`.

**Risk:** LLM misclassifies. Mitigation: `last_smudge_intent` provides structured context. If the LLM still classifies as `confirming`, the worst case is `operational_picture_confirmed = true` without lifecycle progression — which is safe and recoverable.

### 7.2 User Validates Reflection Then Immediately Says "Let's Move On"

**Scenario:** Smudge reflects → User: "Yes, that's exactly right. So what's next?"

**Current behaviour:** "confirming" fires → both validation and progression.
**After fix:** This could be classified as `confirming` (for "that's exactly right") with `progressing` intent (for "what's next?"). Or the LLM might classify the whole message as `progressing`.

**Design question:** Can one message carry both authorities? If the LLM classifies as `progressing`, we set `operational_picture_confirmed = true` AND transition to CONFIRMED — but `progressing` should be gated on `operational_picture_confirmed === true`.

**Resolution:** If `progressing` is received and `operational_picture_confirmed === false`, the system should:
1. Set `operational_picture_confirmed = true` (the user's affirmation validates the reflection)
2. Transition to CONFIRMED (the user has explicitly chosen to progress)

This treats `progressing` as carrying implied reflection validation when the reflection hasn't been validated yet. This is safe because the user IS affirming — they're just also choosing to move forward in the same breath.

**Alternative:** Require two separate turns — first validate, then progress. This is more strict but less natural. **Recommendation:** Allow implied validation from `progressing` — it's more natural and the user's intent is clear.

### 7.3 User Declines Progression Invitation

**Scenario:** Smudge invites → User: "Not yet."

**Current behaviour:** Classified as `rejecting` → `operational_picture_confirmed = false`.
**After fix:** This should be classified as a new type — neither `confirming`, `rejecting`, nor `progressing`. It's a decline of progression, not a rejection of the reflection.

**Design question:** Should declining progression invalidate the reflection validation?

**Recommendation:** No. The user is saying "not yet" to moving forward, not "your reflection is wrong." `operational_picture_confirmed` should remain `true`. The system should:
1. Accept the decline
2. Keep `operational_picture_confirmed = true`
3. Keep `tos_phase = CONFIRMING`
4. Continue the conversation normally
5. Not immediately re-issue the progression invitation

**Classification:** Add `declining` as a new `user_response_type` value, or classify as `answering` with a specific intent. The `declining` value is cleaner — it's semantically distinct from `rejecting` (which means "your reflection is wrong").

**Impact on enum:** `user_response_type` would become: `answering | correcting | confirming | rejecting | progressing | declining | none`

This is the one place where the proposed contract may need a third new value, not just two.

### 7.4 Session Boundary — User Returns After Validation

**Scenario:** User validated the reflection (operational_picture_confirmed = true, tos_phase = CONFIRMING) and left. Returns next day.

**Current behaviour:** Profile still has `operational_picture_confirmed = true` and `tos_phase = CONFIRMING`. If the user says "yeah" to anything, it could fire `confirming` → CONFIRMED.
**After fix:** `operational_picture_confirmed = true` with `tos_phase = CONFIRMING` is the correct persisted state. The user returns, conversation resumes. Smudge should naturally re-engage — the generation context should show that the reflection was validated but the user hasn't progressed. Smudge can re-invite progression when the conversation flows naturally.

**Risk:** `last_smudge_intent` from the previous session may be stale. If the last act was `CONFIRMATION_PROMPT`, and the user returns with "yes," the LLM might classify as `confirming` (reflection validation — which has already happened). This is safe: `operational_picture_confirmed` is already `true`, so setting it again is idempotent. No lifecycle progression occurs without `progressing`.

### 7.5 Concurrent Requests (Race Condition)

**Scenario:** Two messages arrive simultaneously while in CONFIRMING.

**Current behaviour:** Both pass through companionCore. Last write wins on `tos_phase` and `operational_picture_confirmed`.
**After fix:** Same behaviour. The race condition is not introduced by Packet 2 — it exists in the current architecture. The fix doesn't make it worse because `confirming` and `progressing` are now separate signals; two concurrent `confirming` signals can't trigger progression.

### 7.6 Profile in CONFIRMED Without Progression (Legacy State)

**Scenario:** Existing profiles that were transitioned to CONFIRMED under the old code (reflection validation = progression). These profiles have `tos_phase = CONFIRMED` and `operational_picture_confirmed = true`.

**After fix:** These profiles are already past the gate. The fix only affects future CONFIRMING → CONFIRMED transitions. No migration needed.

### 7.7 Smudge Never Issues a Progression Invitation

**Scenario:** The user validates the reflection, but Smudge never explicitly invites progression (generation LLM doesn't produce an invitation).

**After fix:** The user stays in CONFIRMING with `operational_picture_confirmed = true`. This is the correct state — the user hasn't been invited to progress. Smudge should eventually offer a progression invitation based on generation guidance. If it doesn't, the user is stuck in CONFIRMING — but this is a generation quality issue, not an authority issue.

**Mitigation:** Generation guidance should include: "If the reflection has been validated, naturally invite the user to explore their capabilities. Do not force, but do not avoid the invitation."

---

## 8. Proposed Acceptance-Test Matrix

| Test | Scenario | Pre-conditions | User Input | Expected tos_phase | Expected operational_picture_confirmed | Expected orchestration_note |
|---|---|---|---|---|---|---|
| T1 | Reflection validation | CONFIRMING, last_smudge_intent = REFLECT | "Yes, that's exactly right." | CONFIRMING (unchanged) | true | CONFIRMING_VALIDATED |
| T2 | Explicit progression | CONFIRMING, op_confirmed = true, last_smudge_intent = EXPLORE (post-reflection invite) | "Yeah, let's do it." | CONFIRMED | true | CONFIRMING_ADVANCED |
| T3 | Decline progression | CONFIRMING, op_confirmed = true, last_smudge_intent = EXPLORE (post-reflection invite) | "Not yet." | CONFIRMING (unchanged) | true (unchanged) | CONFIRMING_DECLINED |
| T4 | Additional evidence after validation | CONFIRMING, op_confirmed = true | "Actually, I'd probably travel further if the right job came up." | CONFIRMING (unchanged) | false (invalidated) | CONFIRMING_REOPENED |
| T5 | Correction of reflection | CONFIRMING, last_smudge_intent = REFLECT | "No, you've got the location bit wrong." | CONFIRMING (unchanged) | false | CONFIRMING_CORRECTED |
| T6 | Ambiguous affirmation | CONFIRMING, last_smudge_intent = EXPLORE (discovery question) | "Yeah" | CONFIRMING (unchanged) | unchanged | CONFIRMING_ANSWERING |
| T7 | SMUDGE 5 regression | CONFIRMING, last_smudge_intent = REFLECT | "Yes." | CONFIRMING (unchanged) | true | CONFIRMING_VALIDATED |
| T8 | Packet 1 regression | CONFIRMED | "So what happens now?" | CONFIRMED (unchanged) | unchanged | POST_CONFIRMING_CONVERSATIONAL |
| T9 | Implied validation + progression | CONFIRMING, op_confirmed = false, last_smudge_intent = REFLECT | "Yes, that's right. Let's move on." | CONFIRMED | true | CONFIRMING_ADVANCED |
| T10 | Progression without prior validation | CONFIRMING, op_confirmed = false, last_smudge_intent = EXPLORE | "Yeah, let's move on." | CONFIRMING (unchanged) | unchanged | CONFIRMING_NOT_VALIDATED |
| T11 | Re-reflection after invalidation | CONFIRMING, op_confirmed = false (post-invalidation), sufficient areas | (user signals done adding) | CONFIRMING (unchanged) | false | CONFIRMING_RE_REFLECT |

**T7 is the SMUDGE 5 regression test.** The exact scenario from the live exercise must NOT transition to CONFIRMED.

**T9 is the combined validation + progression case** — one message carries both authorities. The system should accept this as implied validation + explicit progression.

**T10 is the authority gate test** — progression without prior validation is blocked. The user must validate the reflection before progressing.

---

## 9. Recommended Implementation Sequence

### Phase 1: Classification Split (Interpretation Layer)

1. Add `progressing` and `declining` to `user_response_type` enum in interpretation schema
2. Pass `last_smudge_intent` into interpretation prompt
3. Update interpretation prompt instructions to distinguish reflection validation from progression based on Smudge's last act
4. Update `safeUserResponseType` to accept `progressing` and `declining` in CONFIRMING

### Phase 2: companionCore Logic Split

1. `confirming` → set `operational_picture_confirmed = true` only. Do NOT transition lifecycle.
2. `progressing` → if `operational_picture_confirmed === true`: transition to CONFIRMED. If `operational_picture_confirmed === false`: set it to `true` (implied validation) then transition to CONFIRMED.
3. `declining` → do nothing. Preserve `operational_picture_confirmed`. Stay in CONFIRMING.
4. `rejecting` → set `operational_picture_confirmed = false`. Stay in CONFIRMING. (unchanged)
5. `correcting` → set `operational_picture_confirmed = false`. Stay in CONFIRMING. (unchanged)

### Phase 3: Post-Validation Invalidation

1. In companionCore, when new discoveries are accepted AND `operational_picture_confirmed === true`: set `operational_picture_confirmed = false`.
2. This is a one-line check in the existing merge logic.

### Phase 4: Generation Guidance Update

1. When `operational_picture_confirmed === true` AND `tos_phase === CONFIRMING`: add generation guidance to naturally invite progression.
2. When `operational_picture_confirmed === false` AND `tos_phase === CONFIRMING` AND sufficient areas: add generation guidance to offer re-reflection.

### Phase 5: Acceptance Testing

Run T1-T11 against the canonical runtime with a test profile.

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM misclassifies `confirming` vs `progressing` | Medium | Low (safe state: validated but not progressed) | `last_smudge_intent` context + prompt instructions |
| LLM never classifies as `progressing` | Medium | Medium (user stuck in CONFIRMING) | Generation guidance to invite progression; user can still trigger via natural language |
| Post-validation invalidation too aggressive | Low | Low (user gets new Reflection, which is natural) | Start with Option A (any new evidence), refine to Option B if needed |
| `declining` not classified correctly | Low | Low (user stays in CONFIRMING, conversation continues) | Falls through to `answering` which is safe |
| Existing profiles in CONFIRMED (legacy) | N/A | None | No migration needed — fix only affects future transitions |

**Overall risk: LOW.** The change is additive (new enum values, new routing) not subtractive (no existing signals are removed). The worst case for any misclassification is that the user stays in CONFIRMING — which is safe and recoverable.

---

## 10. Summary of Recommendations

1. **No new persisted fields.** `operational_picture_confirmed` and `tos_phase` already represent the correct concepts.
2. **Split `user_response_type` classification** into `confirming` (reflection validation) and `progressing` (progression authority). Add `declining` for decline of progression invitation.
3. **Pass `last_smudge_intent` to the interpretation LLM.** This is the binding mechanism — it's already stored, just not used.
4. **Gate lifecycle progression on `progressing` signal**, not `confirming`. Allow implied validation from `progressing` when reflection hasn't been validated.
5. **Invalidate `operational_picture_confirmed` on material new evidence.** Option A (any new discovery) for MVP simplicity.
6. **Update generation guidance** to invite progression after validation and re-reflect after invalidation.
7. **No engine changes.** Engines already gate on `tos_phase` and `operational_picture_confirmed` independently.
8. **No Packet 2 changes.** Packet 1 invariant preserved. R1-C.1E untouched.

---

## 11. Open Questions for Paul + Cipher

1. **T9 — Implied validation + progression:** Should `progressing` when `operational_picture_confirmed === false` be treated as implied validation + progression (one step), or should the system ask the user to validate the reflection first (two steps)? Recommendation: one step — the user's intent is clear.

2. **Decline classification:** Is `declining` a necessary new enum value, or can decline be handled as `answering` with a specific `intent`? Recommendation: separate value — it's semantically distinct and needs different companionCore handling (preserve `operational_picture_confirmed`).

3. **Material evidence threshold:** Option A (any new discovery) vs Option B (core areas only). Recommendation: Option A for MVP, refine if over-invalidation is observed in pilot.

4. **Progression invitation cadence:** If the user declines progression, how often should Smudge re-invite? Recommendation: not on the next turn. Let the conversation flow naturally. If the user raises capability-related topics, Smudge can re-invite. Do not mechanically re-invite.

5. **Should `operational_picture_confirmed = true` with `tos_phase = CONFIRMING` trigger any UI change?** This is a new valid state. The frontend may need to know it (e.g. to show "Reflection validated — ready when you are"). But this is a UI question, not an engineering one.

---

**END OF ENGINEERING CHALLENGE.**

**Engineering authority for Packet 2 has NOT been granted. This document is for Paul + Cipher review only.**

**STOP.**
