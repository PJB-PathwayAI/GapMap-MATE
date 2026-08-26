# R1-C.1F — Packet 2 Design Intent Addendum v1.0

**Date:** 26 August 2026
**Author:** Ash (Chief Engineer)
**Status:** ADDENDUM TO DI v1.0 — ENGINEERING AUTHORITY WITHHELD
**For review by:** Paul (Product Owner) + Cipher (Doctrine)
**Addresses:** Two clarifications from Cipher's doctrine review of DI v1.0

---

## 1. Clarification 1: last_smudge_intent Must Represent the Actual Rendered Act

### Cipher's Requirement

> last_smudge_intent must represent the conversational act actually presented to the user. A planned/generated intent must not carry lifecycle authority if the rendered Smudge response did not actually perform that act.

### Problem Statement

The generation LLM produces `response_intent` and `response_text` in the same call. `response_intent` is persisted as `last_smudge_intent`. There is no deterministic check that the declared intent matches the actual rendered text.

If the LLM declares `response_intent: PROGRESSION_INVITATION` but the actual text is "Tell me more about your time in the signals" (a discovery question), then `last_smudge_intent` would carry a false progression invitation. On the next turn, the interpretation LLM would see `last_smudge_intent: PROGRESSION_INVITATION` and might classify "yeah" as `progressing` — granting lifecycle authority based on an act that was never actually performed.

### How the DI Guarantees Fidelity

Three layers of protection, in order of determinism:

#### Layer 1: Post-Generation Deterministic Check (NEW)

After the generation LLM returns, before persisting `last_smudge_intent`, add a deterministic validation:

```typescript
// Packet 2 Cipher #1: Intent fidelity check
// PROGRESSION_INVITATION must be a question addressed to the user.
// If the LLM declared PROGRESSION_INVITATION but did not ask a question,
// the rendered response did not actually perform a progression invitation.
if (responseIntent === 'PROGRESSION_INVITATION' && asksQuestion !== true) {
  responseIntent = 'EXPLORE'; // downgrade — the act was not performed
}
```

**Rationale:** A progression invitation is inherently a question ("Shall we look at what you're good at?"). If the generation didn't ask a question, it didn't perform an invitation. This is a minimal, deterministic, binary check — no LLM judgment required.

**Location:** In the generation result processing block (entry.ts, after the generation LLM returns and before ConversationState persist), alongside the existing `validateGeneration` checks.

**Also applies to fallback responses:** The `buildFallbackResponse` for validated-but-not-progressed state (§4.8 of DI v1.0) already sets `asks_question: true` for the `PROGRESSION_INVITATION` fallback. No change needed — the fallback is consistent by construction.

#### Layer 2: Interpretation LLM Cross-Check (NEW prompt instruction)

The interpretation LLM receives both:
- `last_smudge_intent` (the structured intent)
- `recent_context` (the actual text of Smudge's last response)

Add instruction to the interpretation prompt:

```
"IMPORTANT: If Smudge's declared last conversational act (above) does not match what Smudge actually said in the recent conversation, classify the user's response based on the ACTUAL conversation text, not the declared act. The declared act is a hint; the actual text is the authority."
```

**Rationale:** Even if Layer 1 passes (the LLM asked a question), the question might not actually be a progression invitation (e.g., "What did you do in the signals?" is a question but not a progression invitation). The interpretation LLM, seeing both the declared intent and the actual text, can cross-check. This is an LLM-level check, not deterministic — but it provides a second line of defence.

#### Layer 3: CompanionCore Authority Gate (already in DI v1.0)

Even if both Layer 1 and Layer 2 fail (the false `PROGRESSION_INVITATION` is persisted and the interpretation LLM classifies as `progressing`), the companionCore logic blocks progression unless `operational_picture_confirmed === true`. If the OP has not been validated, progression is blocked regardless of the classification.

This is the final backstop: no validation, no progression — regardless of intent fidelity.

### Summary of Guarantee

| Layer | Check | Determinism | Catches |
|---|---|---|---|
| 1 | `asks_question` for PROGRESSION_INVITATION | Deterministic | LLM didn't ask a question |
| 2 | Interpretation LLM cross-checks text vs declared intent | LLM judgment | LLM asked a question but not a progression invitation |
| 3 | companionCore requires `operational_picture_confirmed` | Deterministic | False progression invitation when OP not validated |

**Net effect:** `last_smudge_intent` is reliable enough to carry lifecycle authority. The combination of deterministic checks (Layers 1 and 3) and LLM cross-check (Layer 2) ensures that a mismatch between declared intent and actual rendered text cannot grant lifecycle authority that wasn't earned.

---

## 2. Clarification 2: Independently Volunteered Progression Authority

### Cipher's Requirement

> Progression authority must either answer a genuine progression invitation OR be independently and explicitly volunteered by the user.

### Current DI v1.0 Position (TO BE REVISED)

DI v1.0 §4.1 states that `confirming_progressing` is "Only valid when Smudge's last act was a progression invitation (PROGRESSION_INVITATION)." This is too restrictive. It would block the case where the user independently and explicitly volunteers progression after validating the reflection, without Smudge having issued an invitation.

### Revised Classification Rules

#### `progressing`

The user explicitly chooses to move forward. This may occur when:

**(a) Answering a progression invitation:** Smudge's last act was `PROGRESSION_INVITATION`, and the user accepts.

**(b) Independently volunteered:** The user explicitly and independently states readiness to move forward, without Smudge having issued an invitation. Example: "I'm ready to move on to the next part."

In both cases, companionCore gates on `operational_picture_confirmed === true`. No prior validation, no progression.

**What is NOT `progressing`:**
- "Yeah" — vague, no explicit progression intent
- "Okay" — vague, no explicit progression intent
- "Let's go" — ambiguous, could mean "continue the conversation"
- Any phrase whose progression meaning depends on an invitation that was never actually made

#### `confirming_progressing`

The user explicitly validates the reflection AND explicitly volunteers or accepts progression in the same utterance. Both intents must be independently identifiable.

This may occur when:

**(a) After a progression invitation:** Smudge's last act was `PROGRESSION_INVITATION`. User: "Yeah, you've got it — let's crack on."

**(b) After a reflection, independently volunteered:** Smudge's last act was `REFLECT` or `CONFIRMATION_PROMPT`. User: "Yeah, you've got it — I'm ready to move on to the next part."

In both cases, the progression must be explicit and independently identifiable. The validation must also be explicit.

**What is NOT `confirming_progressing`:**
- "Yeah, you've got it — let's go" — "let's go" is not explicit progression
- "Yeah, sounds good" — "sounds good" is vague, not explicit progression
- "Yeah, you've got it" — validation only, no progression (classify as `confirming`)

#### `declining`

User explicitly declines a progression invitation. Only valid when Smudge's last act was `PROGRESSION_INVITATION` — you can only decline something that was offered.

### Revised Interpretation LLM Schema Description

Replace the `user_response_type` description from DI v1.0 §4.1 with:

```
"Classify based on what Smudge just asked or did (see Smudge's last conversational act above) AND what the user explicitly expressed:
- 'confirming': User explicitly affirms that Smudge's reflection/summary is accurate.
- 'rejecting': User explicitly says Smudge's reflection is wrong.
- 'progressing': User explicitly chooses to move forward to the next stage. This may be in response to a Smudge progression invitation (PROGRESSION_INVITATION) OR independently and explicitly volunteered by the user. Must be a clear, explicit statement of readiness to move on — not a vague affirmation or conversational momentum.
- 'confirming_progressing': User explicitly validates the reflection AND explicitly chooses to progress in the same utterance. Both intents must be independently identifiable in the text — never infer one from the other. The progression may be in response to a Smudge invitation OR independently volunteered.
- 'declining': User explicitly declines a Smudge progression invitation. Only valid when Smudge's last act was PROGRESSION_INVITATION.
- 'correcting': User corrects something Smudge said, at any stage.
- 'answering': None of the above. Normal conversational response.
- 'none': No classification possible.

Key rules:
- An affirmation only has the authority of the question it answers.
- A vague 'yeah', 'okay', or 'sounds good' inherits ONLY the authority of the Smudge act it responds to. Do not grant progression authority to a vague affirmation unless the user has explicitly stated readiness to move forward.
- 'Let's go', 'carry on', or similar vague phrases are NOT explicit progression. 'I'm ready to move on', 'let's look at what I'm good at', or 'let's start the next part' ARE explicit progression.
- If Smudge's declared last act does not match the actual conversation text in recent context, classify based on the actual text, not the declared act.
- Never infer progression authority from conversational momentum."
```

### Impact on Acceptance Tests

Two tests from DI v1.0 need updating:

**T9 (Combined validation + progression) — UPDATED:**

| Field | Value |
|---|---|
| Pre-conditions | CONFIRMING, op_confirmed=false, last_smudge_intent = REFLECT (not PROGRESSION_INVITATION) |
| User Input | "Yeah, you've got that right — I'm ready to move on to the next part." |
| Expected tos_phase | CONFIRMED |
| Expected op_confirmed | true |
| Expected orchestration_note | CONFIRMING_ADVANCED |
| Key Assertion | User independently volunteers explicit progression after reflection validation. Both intents explicit. Advances without a preceding PROGRESSION_INVITATION. |

**Rationale for change:** T9 now tests the independently volunteered case specifically. The user is responding to a Reflection (REFLECT), not a progression invitation, but explicitly volunteers progression. This is the case Cipher's clarification enables.

**T9a (Combined after progression invitation) — NEW:**

| Field | Value |
|---|---|
| Pre-conditions | CONFIRMING, op_confirmed=false, last_smudge_intent = PROGRESSION_INVITATION |
| User Input | "Yeah, you've got that right — let's crack on." |
| Expected tos_phase | CONFIRMED |
| Expected op_confirmed | true |
| Expected orchestration_note | CONFIRMING_ADVANCED |
| Key Assertion | Both authorities after a genuine progression invitation. Both explicit. |

**T13 (Vague affirmation) — UPDATED:**

T13 from DI v1.0 tested "Okay" in response to a PROGRESSION_INVITATION as `progressing`. This is still correct — "okay" answering a progression invitation carries progression authority per the governing rule. But T13 now also implicitly tests that "okay" answering a Reflection (not a progression invitation) would be `confirming`, not `progressing` — because "okay" doesn't independently volunteer progression.

**New T14 (Volunteered progression without validation) — NEW:**

| Field | Value |
|---|---|
| Pre-conditions | CONFIRMING, op_confirmed=false, last_smudge_intent = EXPLORE |
| User Input | "I'm ready to move on to the next part." |
| Expected tos_phase | CONFIRMING (unchanged) |
| Expected op_confirmed | unchanged |
| Expected orchestration_note | CONFIRMING_NOT_VALIDATED |
| Key Assertion | Explicit volunteered progression but OP not validated. Progression blocked. |

**New T15 (Vague phrase is not progression) — NEW:**

| Field | Value |
|---|---|
| Pre-conditions | CONFIRMING, op_confirmed=true, last_smudge_intent = REFLECT |
| User Input | "Yeah, you've got it — let's go." |
| Expected tos_phase | CONFIRMING (unchanged) |
| Expected op_confirmed | true |
| Expected orchestration_note | CONFIRMING_VALIDATED |
| Key Assertion | "Let's go" is vague, not explicit progression. Reflection validated; no progression. |

### Updated Acceptance Test Matrix

| Test | Scenario | Pre-conditions | last_smudge_intent | User Input | Expected tos_phase | Expected op_confirmed | Expected orchestration_note | Key Assertion |
|---|---|---|---|---|---|---|---|---|
| T1 | Reflection validation | CONFIRMING, op=false | REFLECT | "Yes, that's exactly right." | CONFIRMING | true | CONFIRMING_VALIDATED | OP validated; no advance |
| T2 | Explicit progression (answer to invitation) | CONFIRMING, op=true | PROGRESSION_INVITATION | "Yeah, let's do it." | CONFIRMED | true | CONFIRMING_ADVANCED | Progression with prior validation |
| T3 | Decline progression | CONFIRMING, op=true | PROGRESSION_INVITATION | "Not yet." | CONFIRMING | true | CONFIRMING_DECLINED | Validation preserved; no advance |
| T4 | Additional evidence after validation | CONFIRMING, op=true | EXPLORE | "Actually, I'd probably travel further if the right job came up." | CONFIRMING | false | CONFIRMING_REOPENED | New evidence invalidates |
| T5 | Correction of reflection | CONFIRMING, op=false | REFLECT | "No, you've got the location bit wrong." | CONFIRMING | false | CONFIRMING_CORRECTED | Correction accepted |
| T6 | Ambiguous affirmation (discovery context) | CONFIRMING, op=false | EXPLORE | "Yeah" | CONFIRMING | unchanged | CONFIRMING_ANSWERING | "Yeah" to discovery = answering |
| T7 | **SMUDGE 5 regression** | CONFIRMING, op=false | REFLECT | "Yes." | **CONFIRMING** | **true** | **CONFIRMING_VALIDATED** | **"Yes" validates OP; lifecycle stays CONFIRMING** |
| T8 | Packet 1 regression | CONFIRMED, op=true | (any) | "So what happens now?" | CONFIRMED | unchanged | POST_CONFIRMING_CONVERSATIONAL | Packet 1 intact |
| T9 | **Combined — independently volunteered** | CONFIRMING, op=false | **REFLECT** | "Yeah, you've got that right — I'm ready to move on to the next part." | **CONFIRMED** | **true** | **CONFIRMING_ADVANCED** | **Both explicit; progression volunteered without preceding invitation** |
| T9a | Combined — after progression invitation | CONFIRMING, op=false | PROGRESSION_INVITATION | "Yeah, you've got that right — let's crack on." | CONFIRMED | true | CONFIRMING_ADVANCED | Both explicit after genuine invitation |
| T10 | Progression without prior validation | CONFIRMING, op=false | PROGRESSION_INVITATION | "Yeah, let's move on." | CONFIRMING | unchanged | CONFIRMING_NOT_VALIDATED | Progression blocked — no validation |
| T11 | Decline with new evidence | CONFIRMING, op=true | PROGRESSION_INVITATION | "Not yet — actually, I also did a tour in Cyprus." | CONFIRMING | false | CONFIRMING_REOPENED | Decline + evidence invalidates |
| T12 | Re-reflection after invalidation | CONFIRMING, op=false, sufficient | EXPLORE | "That's everything I think." | CONFIRMING | false | CONFIRMING_RE_REFLECT | Smudge offers re-reflection |
| T13 | Vague affirmation to progression invitation | CONFIRMING, op=true | PROGRESSION_INVITATION | "Okay" | CONFIRMED | true | CONFIRMING_ADVANCED | "Okay" answers invitation = progression |
| T14 | Volunteered progression without validation | CONFIRMING, op=false | EXPLORE | "I'm ready to move on to the next part." | CONFIRMING | unchanged | CONFIRMING_NOT_VALIDATED | Explicit progression but OP not validated — blocked |
| T15 | Vague phrase is not progression | CONFIRMING, op=true | REFLECT | "Yeah, you've got it — let's go." | CONFIRMING | true | CONFIRMING_VALIDATED | "Let's go" is vague; validation only |

---

## 3. Confirmation Summary

### Point 1: Intent Fidelity

**Confirmed:** The DI guarantees that `last_smudge_intent` represents the actual rendered act through three layers:
1. **Deterministic post-generation check** — `PROGRESSION_INVITATION` requires `asks_question === true` or the intent is downgraded to `EXPLORE`
2. **Interpretation LLM cross-check** — instructed to classify based on actual conversation text if it contradicts the declared intent
3. **CompanionCore authority gate** — progression requires `operational_picture_confirmed === true` regardless of classification

A mismatch between declared intent and actual rendered text cannot grant lifecycle authority that wasn't earned.

### Point 2: Volunteered Progression

**Confirmed:** `progressing` and `confirming_progressing` do not strictly require a preceding `PROGRESSION_INVITATION`. The user may independently and explicitly volunteer progression authority. The distinction is between explicit volunteered progression ("I'm ready to move on to the next part") and vague momentum ("let's go", "carry on"). The interpretation LLM, with `last_smudge_intent` + `recent_context`, classifies based on whether progression is explicitly stated, not inferred.

---

## 4. Changes to DI v1.0

This addendum modifies the following sections of DI v1.0:

| Section | Change |
|---|---|
| §4.1 (Interpretation schema description) | Updated — `progressing`/`confirming_progressing` no longer require PROGRESSION_INVITATION. Volunteered progression accepted. Added cross-check instruction. |
| §4.4 (Generation prompt guidance) | No change — PROGRESSION_INVITATION guidance still applies when OP is validated |
| §4.7.2 (companionCore lifecycle transition) | No structural change — `confirming_progressing` and `progressing` still advance. The gate on `operational_picture_confirmed` still applies. |
| §8 (Acceptance test matrix) | Updated — T9 changed, T9a/T14/T15 added |
| NEW §4.3a (Post-generation intent fidelity check) | Added — deterministic check for PROGRESSION_INVITATION |

---

**END OF ADDENDUM.**

**Engineering authority for Packet 2 remains withheld. This addendum is for Paul + Cipher review.**

**STOP.**
