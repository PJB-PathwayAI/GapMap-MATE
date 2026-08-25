# SMUDGE 5 AAR — Engineering View
## Exercise Date: 25 August 2026
## Engineer: Ash (Chief Engineer)

---

## 1. Exercise Context

SMUDGE 5 was a live human validation exercise conducted by Paul through the Chat.jsx frontend with a fresh test user. The exercise tested the full R1-C.1E pipeline end-to-end: natural conversation → extraction → sufficiency gate → Reflection Moment → confirmation → post-confirmation behaviour.

This Engineering View is based on code trace of the deployed smudgeOrchestrator (commit 0b5ca3b, companionCore v1.2.0). The test profile and ConversationState records created during the exercise are not accessible via user-scoped read_entities (RLS — test user auth context differs from agent auth context). All findings below are from static code analysis of the deployed runtime, not from inspecting persisted state.

**Evidence limitation:** Live engine invocation and persisted-state inspection were not possible due to RLS auth mismatch. This does not block the findings — the code path is deterministic and the branch logic is unambiguous.

---

## 2. Proven Findings

### F1 — tos_phase before confirmation: CONFIRMING

**Proven from code.** The Reflection Moment is only offered when `sufficiency_orchestration === "SUFFICIENT"` (generation prompt line 577). The sufficiency gate sets `SUFFICIENT` only when `runSufficiencyGate` returns `sufficient: true`, which also triggers `EXPLORING → CONFIRMING` in companionCore (line 365). The generation prompt's SUFFICIENT branch includes the Reflection Moment instruction. Therefore, the profile was in CONFIRMING when the Reflection Moment was offered.

### F2 — tos_phase after confirmation: CONFIRMED

**Proven from code trace:**

1. User says "yes" → extraction LLM classifies `user_response_type: "confirming"`
2. `safeUserResponseType` (line 352) passes "confirming" through because `currentPhase === "CONFIRMING"`
3. companionCore receives `userResponseType: "confirming"`, `currentMode: "CONFIRMING"`
4. companionCore line 357: `operational_picture_confirmed = true` (because `userResponseType === "confirming" && profile.tos_phase === "CONFIRMING"`)
5. companionCore line 370: `newPhase = "CONFIRMED"` (because `userResponseType === "confirming" && userConfirmed && profile.tos_phase === "CONFIRMING"`)
6. companionCore line 393-396: `persistencePayload` includes `tos_phase: "CONFIRMED"`, persisted via `base44.asServiceRole.entities.UserProfile.update(id, payload)`

**CONFIRMING → CONFIRMED fired.** This is the designed behaviour from Packet 2B Canonical Lifecycle Contract.

### F3 — Reflection Accuracy Confirmation ≠ User Readiness to Advance

**Proven contract issue.** The current implementation conflates two distinct signals: confirming that Smudge's reflection is accurate, and confirming readiness to advance to the next lifecycle stage. SMUDGE 5 demonstrates why these signals need to remain distinct.

#### What the Reflection Moment asks

The generation prompt (line 577) instructs Smudge:

> "Offer a Reflection Moment: 'Can I tell you what I'm hearing?' Summarise what you know, including what you don't yet know (gaps are fine). Do not fabricate. Let them confirm or correct."

The user is being asked to confirm **the accuracy of Smudge's understanding** — not their readiness to advance. In SMUDGE 5, Smudge asked "Does that sound like a fair summary of where you are at?" and the user said "yes." That "yes" evidences "you've understood me correctly." It does not necessarily evidence "I'm ready to move to the next stage."

#### What the extraction LLM is told about "confirming"

The extraction LLM schema (line 1076) defines:

> `user_response_type: { enum: ["answering", "correcting", "confirming", "rejecting", "none"], description: "Only confirming if explicit unambiguous affirmation" }`

The extraction prompt (line 1014) says:

> "Whether this is an explicit confirmation/rejection (only if unambiguous)"

The extraction LLM receives the current phase, profile context, recent exchanges (last 4 from frontend), and the user's message. It CAN see that Smudge just offered a Reflection Moment (via recent_context). But it is NOT instructed to distinguish between:
- "Yes, you've understood me correctly" (reflection accuracy)
- "Yes, I'm ready to move to the next stage" (readiness to advance)

A "yes" to "Does that sound fair?" is an explicit unambiguous affirmation → classified as `user_response_type: "confirming"`. The classification is correct by the prompt's own definition — but the prompt's definition doesn't distinguish what is being confirmed.

#### What companionCore does with "confirming"

companionCore treats ANY `userResponseType === "confirming"` during CONFIRMING as the CONFIRMING → CONFIRMED trigger:

- Line 357: `operational_picture_confirmed = true` when `userResponseType === "confirming" && profile.tos_phase === "CONFIRMING"`
- Line 370: `newPhase = "CONFIRMED"` — same condition, no additional check

No mechanism checks:
- WHAT the user is confirming (reflection accuracy vs. readiness to advance)
- Whether the confirmation was about the Personal Operational Picture or something else
- Whether the user was asked about accuracy or readiness

#### What `safeUserResponseType` checks

Line 352: `safeUserResponseType` only allows "confirming" through when `mode === "CONFIRMING"`. It does not check what is being confirmed — just that the phase is right.

#### The contract

The current lifecycle contract is: **any affirmative response during CONFIRMING → CONFIRMED. Full stop.**

This means:
1. Sufficiency gate says "Smudge has enough to reflect" → Smudge reflects
2. User says "yes, you got it right" → system interprets as "user is ready to advance"
3. Profile advances to CONFIRMED

These are different questions:
- "Did Smudge understand correctly?" → reflection accuracy
- "Is the user ready to move from understanding to evaluation?" → readiness to advance

The current code treats them as the same thing. A user can agree you understood them without being ready to move on — they might want to add something, correct a nuance, or simply sit with the feeling of being understood before deciding what's next.

**This finding is distinct from F5 (PHASE_OUT_OF_SCOPE dead-end).** F3 is the contract issue: the conflation of two signals. F5 is the consequence: the dead-end encountered after advancement fires. SMUDGE 5 demonstrates both, but they are separate defects.

### F4 — CONFIRMED → EVALUATING: NOT ATTEMPTED

**Proven from code.** Zero references to "EVALUATING" in smudgeOrchestrator entry.ts or companionCore.ts. The CONFIRMED → EVALUATING transition exists only in `engineCapabilityIntelligence` (action: `advance_phase`), which requires an explicit API call from the frontend. The Chat.jsx frontend does not make this call. The chat flow has no mechanism to trigger CONFIRMED → EVALUATING.

The orchestrator's phase routing (line 949) handles exactly two phases: EXPLORING and CONFIRMING. CONFIRMED is not handled.

### F5 — Exact branch generating "I'm still learning..." (Post-confirmation dead-end)

**Proven from code.** entry.ts lines 949-960, `PHASE_OUT_OF_SCOPE` branch:

```
if (currentPhase !== "EXPLORING" && currentPhase !== "CONFIRMING") {
  return new Response(JSON.stringify({
    success: true,
    response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about what's available.",
    response_intent: "ACKNOWLEDGE", asks_question: false,
    tos_phase: currentPhase, state_changed: false,
    candidate_discoveries_count: 0, accepted_discoveries_count: 0,
    companion_result: null, recoverable_error: null,
    orchestration_note: "PHASE_OUT_OF_SCOPE",
    companion_core_version: COMPANION_CORE_VERSION
  }), { headers: cors });
}
```

This is a hardcoded, deterministic response. No LLM, no companionCore, no extraction. It fires for any `tos_phase` that is not EXPLORING or CONFIRMING — including CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, and SETTLED.

**This is the consequence of F3.** The conflation (F3) caused the profile to advance to CONFIRMED prematurely. The PHASE_OUT_OF_SCOPE branch (F5) then terminated the conversation because no handling exists for CONFIRMED in the chat flow. F3 is the contract issue; F5 is the consequence encountered after advancement.

### F6 — Why the dead-end fires for every subsequent message

**Proven from code.** The PHASE_OUT_OF_SCOPE branch is a hard return — it exits the function immediately. No downstream logic executes:

- No extraction LLM call (line 1060+)
- No companionCore call (line 1266+)
- No conversation awareness update (line 1330+)
- No generation LLM call (line 1417+)
- No state transition

The profile was persisted as CONFIRMED (F2). Every subsequent message loads the profile, sees `tos_phase === "CONFIRMED"`, hits PHASE_OUT_OF_SCOPE, and returns the same hardcoded response. The profile stays in CONFIRMED permanently. The branch will fire for every message until the profile's tos_phase is manually changed or the code is updated.

### F7 — User's later messages were short-circuited

**Proven from code.** The PHASE_OUT_OF_SCOPE branch (line 949) executes BEFORE:

- Phase routing for EXPLORING/CONFIRMING (line 960+)
- Operational areas snapshot (line 970+)
- Extraction LLM call (line 1060+)
- companionCore call (line 1266+)
- Conversation awareness derivation (line 1330+)
- Generation LLM call (line 1417+)

ConversationState IS loaded (lines 821-862) but is never updated — the function returns before any write logic. The user's messages ("thanks", direct question, "Smudge I need your help", "smudge") were not processed for extraction, conversation awareness, or companion generation. They were effectively discarded.

---

## 3. Grounding Slips

### G1 — "Network installation work"

**Assessment: Generation LLM inference.**

The user never mentioned network installation. The generation prompt receives `buildProfileContext(profile)` which includes `service_branch`, `personal_context`, `goals`, `user_confidence` — all user-scoped, no cross-user leakage (profile loaded via `base44.entities.UserProfile.list()`, line 803). The generation prompt Rule 1 states: "Only reference what the user actually said and what was understood. NEVER invent capabilities, skills, evidence, or career suitability."

The LLM generated this reference despite Rule 1. The post-generation validation (`validateGeneration`, line 516) only checks for:
- `IDENTITY_VIOLATION_PATTERNS` — first-person military claims ("I served", "I was in the Army")
- `UNGROUNDED_CLAIM_PATTERNS` — premature confidence claims ("I've got a good picture", "I understand your journey")

Neither pattern set catches career-related inferences. "Network installation work" passed validation unchallenged.

**Root cause:** Generation LLM inference. Validation gap — no grounding check for career/role references.

### G2 — "Vehicle mechanic"

**Assessment: Likely extraction LLM inference, possibly generation inference. Cannot definitively determine without test profile access.**

The user said "tanks and vehicles." The extraction LLM schema includes `role` in `service_history` (line 1064): "The user's stated role/trade (e.g. 'Metalsmith')." The extraction LLM may have inferred `role: "vehicle mechanic"` from "tanks and vehicles" and persisted it. Alternatively, the generation LLM may have inferred it from the conversation context.

The user corrected it to "welder," confirming the actual trade was welding/fabrication. Smudge accepted the correction ("I got that wrong, sorry. Thanks for setting me straight on that.") — this is the ACCEPT_CORRECTION authoritative intent working as designed (line 602).

**Root cause:** Either extraction or generation LLM inference from "tanks and vehicles." Without test profile access, cannot definitively determine source. Either way, a grounding slip — the user's evidence did not support "vehicle mechanic."

---

## 4. Positive Findings

### P1 — Reflection Moment: validated

The sufficiency gate (Packet 3) correctly:
1. Assessed sufficient understanding from the conversation
2. Triggered the SUFFICIENT branch in the generation prompt
3. Offered the Reflection Moment ("Can I tell you what I'm hearing?")
4. Synthesised four threads accurately (leaving welding/fab, stability, family/school, one-hour commute)
5. Explicitly invited confirmation

This is the first live human proof point for the Packet 3 sufficiency gate + Chapter 2 Reflection Before Recommendation doctrine working together.

### P2 — Correction handling: validated

When the user corrected "vehicle mechanic" → "welder", Smudge:
1. LLM classified `intent: "correcting"` → `authoritative_intent: "ACCEPT_CORRECTION"`
2. Generation prompt included: "The user is correcting you. Accept it, recalibrate, and move forward. Do NOT defend, reinterpret, or minimise. If you made an error, own it directly: 'I got that wrong.'"
3. Smudge responded: "I got that wrong, sorry. Thanks for setting me straight on that."

Brief, non-defensive, no over-apologizing. Humility Before Certainty doctrine working as designed.

---

## 5. Root Cause Summary

| Finding | Root Cause | Severity |
|---|---|---|
| F3 — Reflection Accuracy ≠ Readiness conflation | companionCore treats ANY `user_response_type: "confirming"` during CONFIRMING as the CONFIRMING → CONFIRMED trigger. No mechanism distinguishes "you understood me correctly" from "I'm ready to advance." | **Critical** — premature lifecycle advancement |
| F5 — Post-confirmation dead-end | PHASE_OUT_OF_SCOPE branch (line 949) hardcodes a static response for all phases beyond CONFIRMING. No conversational handling exists for CONFIRMED or later phases in the chat flow. | **Critical** — complete conversation termination (consequence of F3) |
| F6 — Repeated identical response | PHASE_OUT_OF_SCOPE is deterministic with no variation. No LLM, no state change, no exit path. | Critical — compounding effect |
| F7 — Messages short-circuited | PHASE_OUT_OF_SCOPE returns before extraction, conversation awareness, companionCore, or generation. All user input is discarded. | Critical — no recovery possible |
| G1 — "Network installation" slip | Generation LLM inference despite Rule 1. Validation gap — no grounding check for career/role references. | Moderate — single occurrence, corrected naturally |
| G2 — "Vehicle mechanic" slip | Extraction or generation LLM inference from "tanks and vehicles." | Minor — corrected by user, correction handled well |

---

## 6. Architectural Assessment

Two distinct architectural gaps were exposed by SMUDGE 5:

### Gap 1 — Confirmation semantics (F3)

The lifecycle contract treats the Reflection Moment as a single-purpose gate: the user confirms, the profile advances. But the Reflection Moment serves a different purpose — it verifies shared understanding. Chapter 2 doctrine says the POP is "earned through shared understanding rather than mere data completion." The current code treats confirmation of the reflection as equivalent to confirmation of the POP, which is then equivalent to readiness to advance.

These are three distinct things:
1. "You understood me correctly" (reflection accuracy)
2. "This is my Personal Operational Picture" (POP confirmation)
3. "I'm ready to move from understanding to evaluation" (readiness to advance)

The current contract collapses all three into one signal: any "yes" during CONFIRMING. SMUDGE 5 shows this is insufficient — a user can confirm reflection accuracy without being ready to advance.

### Gap 2 — Phase coverage (F5–F7)

The dead-end is not a bug — it's a missing feature. The PHASE_OUT_OF_SCOPE branch was designed as a safety gate for phases the chat flow doesn't handle. It was correct for the MVP scope (EXPLORING + CONFIRMING only). The problem is that confirmation works — it successfully transitions to CONFIRMED — but nothing in the chat flow handles what comes next.

The CONFIRMED → EVALUATING transition requires engineCapabilityIntelligence, which is a separate API call the Chat.jsx frontend does not make. The chat flow has no mechanism to:
1. Detect that the profile is in CONFIRMED
2. Trigger capability intelligence evaluation
3. Transition to EVALUATING
4. Provide conversational handling for the EVALUATING phase

This is the architectural gap: the lifecycle contract defines 7 states, but the chat flow only handles 2. The sufficiency gate (Packet 3) successfully advanced the profile through EXPLORING → CONFIRMING → CONFIRMED, then hit a wall.

---

## 7. Recommendations (for AAR discussion, not implementation)

1. **Separate confirmation signals (F3):** The lifecycle needs to distinguish reflection accuracy confirmation from readiness to advance. Options include: a second explicit question ("Are you happy to move on to looking at what you're good at?"), a separate `user_response_type` value for readiness vs. accuracy, or a two-step gate where reflection accuracy confirmation does not immediately trigger CONFIRMED.
2. **CONFIRMED phase handling (F5–F7):** The chat flow needs a conversational behaviour for CONFIRMED — either transition to capability intelligence, or provide a companion-mode response that acknowledges readiness and explains next steps naturally (not a static fallback).
3. **Grounding validation (G1):** `validateGeneration` should check for career/role references that don't appear in profile data or recent context, not just identity violations and confidence claims.
4. **Extraction role inference (G2):** The extraction LLM should not infer a trade title from general context — "tanks and vehicles" should extract as responsibilities, not as `role: "vehicle mechanic"`.

---

## 8. Evidence Limitations

| Limitation | Impact | Blocks SMUDGE 5? |
|---|---|---|
| Test profile not accessible (RLS) | Cannot verify persisted tos_phase, evidence_log, capability_map | No — code trace is deterministic |
| ConversationState not accessible (RLS) | Cannot verify conversation awareness state during exercise | No — code trace proves short-circuit |
| T9 (R1-C.1E) live engine invocation not completed | Evidence-boundary verified via static analysis only | No — does not block SMUDGE 5 |
| Grounding slip source (G2) not definitively proven | Cannot determine if "vehicle mechanic" was persisted or generated | No — either way, it's a grounding slip |
| F3 conflation not observed from persisted state | Cannot prove from persisted data that the user's "yes" was classified as "confirming" | No — code trace proves ANY "yes" during CONFIRMING triggers CONFIRMED. The extraction LLM prompt definition ("explicit unambiguous affirmation") guarantees "yes" → "confirming". |

---

*Ash — Chief Engineer*
*25 August 2026*
