# R1-C.1D Conductor Wiring SITREP

**Date:** 21 August 2026
**Engineer:** Ash
**Commit:** c4ba808
**Status:** PASS

---

## Root Cause

The interpretation LLM call (step 4) computes `interpretation.intent` with values like `expressing_frustration`, `asking_orientation`, `correcting` — but this field was never read by any downstream step. The generation LLM call (step 12) had to re-derive the conversational act from raw message text alone, competing against two structural signals that always pointed at EXPLORE: `areas_outstanding` (populated on nearly every turn) and companionCore's `behavioural_notes` (which independently suggests a next area to explore). Advisory prose rules (20-22) asking the LLM to notice frustration itself lost against this structural pressure. The system structurally defaulted to another discovery question.

## Implementation

7 surgical additions to `smudgeOrchestrator.ts` only. 44 insertions, 2 modifications. No removals. No new LLM call.

| # | Change | Location |
|---|--------|----------|
| 1 | `mapAuthoritativeIntent()` function | Before `buildGenerationPrompt` |
| 2 | `authoritative_intent` field in metadata `m` | Step 7, flow control |
| 3 | Compute authoritative intent after interpretation | Step 7, before ambiguity check |
| 4 | `authoritative_intent` in genContext | Step 12, generation |
| 5 | Authoritative intent block in `buildGenerationPrompt` | Before rules section |
| 6 | Authoritative intent handling in `buildFallbackResponse` | Top of function |
| 7 | Telemetry in `_internal` | Final return |

### Intent Mapping

| interpretation.intent | Authoritative Intent | Generation Behaviour |
|---|---|---|
| `expressing_frustration` | `STOP_EXPLORING` | No discovery question. Acknowledge frustration, change approach, give space. |
| `asking_orientation` | `EXPLAIN` | Answer directly what MATE/Smudge is. No pivot to discovery. |
| `correcting` | `ACCEPT_CORRECTION` | Accept correction, recalibrate. No defence or reinterpretation. |
| `answering` / `other` / `seeking_reassurance` / `sharing_milestone` | `null` | Flexible — normal generation with exploration where appropriate. |

### Generation Prompt Override

When `authoritative_intent` is present, the generation prompt includes an explicit block BEFORE the rules:

> AUTHORITATIVE INTENT — this overrides everything else for this turn.
> [Intent-specific instruction]
> The areas_outstanding and behavioural_notes below are context only — they must NOT override this intent. Do not ask a discovery question this turn.

### Fallback Handling

`buildFallbackResponse` checks `authoritative_intent` before existing checks (`companion_error`, `clarification_needed`, `lifecycle_transition`). Each authoritative intent has a dedicated fallback response that does not ask a discovery question.

---

## Acceptance Test Results

| Test | Scenario | Result | Evidence |
|------|----------|--------|----------|
| T1 | Frustration — "This is getting ridiculous mate, you're just asking me the same questions over and over" | PASS | `interpretation_intent: "expressing_frustration"` → `authoritative_intent: "STOP_EXPLORING"` → response: "Fair enough, I hear you. I'm clearly overdoing it and I'm sorry for that. Let's just park it there for now." — `response_intent: "ACKNOWLEDGE"`, `asks_question: false` |
| T2 | Orientation — "What actually is this? What's MATE supposed to do for me?" | PASS | `interpretation_intent: "asking_orientation"` → `authoritative_intent: "EXPLAIN"` → response: "MATE is just a conversation space for you to figure out what comes next..." — `response_intent: "ACKNOWLEDGE"`, `asks_question: false` |
| T3 | Correction — "Actually that's not right, I didn't say I was struggling. I said I was thinking about my options." | PASS | `interpretation_intent: "correcting"` → `authoritative_intent: "ACCEPT_CORRECTION"` → response: "Fair point. I got that wrong, and I appreciate you correcting me." — `response_intent: "ACKNOWLEDGE"`, `asks_question: false`. companionCore mode: RE_EXPLORING (correct). |
| T4 | Normal conversation — "I've been in the Royal Logistics Corps for about 7 years" | PASS | `interpretation_intent: "answering"` → `authoritative_intent: null` → response: "Seven years in logistics is a decent chunk of time. What was it about that work..." — `response_intent: "EXPLORE"`, `asks_question: true`. Normal exploration preserved. |
| T5 | Override priority — T1 had all 6 areas outstanding, but STOP_EXPLORING prevented exploration | PASS | T1 response did not ask a discovery question despite 6/6 areas outstanding. `areas_outstanding` could not override `STOP_EXPLORING`. |
| T6 | Non-regression — safety flow, companionCore, lifecycle, Bodge profiles, persistence | PASS | Safety: `SAFETY_PATH_NO_ENGINE_CALL`, short-circuits before conductor (no `authoritative_intent` in response). companionCore: v1.1.0 in all calls. Bodge profiles: pre-existing (19 Aug) untouched. Lifecycle: `tos_phase: "EXPLORING"`, `state_changed: false` in all tests. Persistence: `COMPANION_CORE_NARROW_CALLBACK`. |

---

## Non-Regression Summary

| Item | Status | Evidence |
|------|--------|----------|
| companionCore v1.1.0 | UNCHANGED | Version reported in all 5 test calls |
| Lifecycle transitions | UNCHANGED | `tos_phase` never modified by conductor wiring; safety flow lifecycle unchanged |
| Persistence model | UNCHANGED | `COMPANION_CORE_NARROW_CALLBACK` in all calls |
| Safety flow | UNCHANGED | Safety short-circuits at step 6, before conductor at step 7 |
| Entity schemas | UNCHANGED | No schema modifications |
| All 5 deployed engines | UNCHANGED | No engine modifications |
| Group 1 behaviour | UNCHANGED | T4 proves normal exploration still works when `authoritative_intent` is null |
| Group 2 behaviour | UNCHANGED | Safety test proves `clear_concern` still short-circuits correctly |
| Bodge profiles | UNCHANGED | Pre-existing profiles (19 Aug) untouched |

---

## Architecture Boundaries Verified

- Conductor wiring is purely additive — 44 insertions, 2 modifications, 0 removals ✅
- `interpretation.intent` was already being computed by the interpretation LLM call — no new LLM call ✅
- Authoritative intent only overrides when present (non-null) — `answering`/`other` remain flexible ✅
- Safety flow short-circuits before conductor — zero impact on safety classification ✅
- companionCore, lifecycle, engines, persistence, entity schemas all FROZEN ✅
- Fallback responses respect authoritative intent ✅
- Post-generation validation (identity + grounding) still applies ✅

---

## Engineering Cost

| Resource | Count |
|----------|-------|
| Builder messages | 1 |
| Integration calls (smudgeOrchestrator) | 5 (T1, T2, T3, T4, T6 safety) |
| Entity reads | 1 (profile check) |
| Entity deletes | 1 (test profile cleanup) |
| Repo commits | 1 (c4ba808 — code) |
| Credits consumed | ~6 (1 builder + 5 integration calls) |

---

## Frozen Items (Verified Unchanged)

- companionCore v1.1.0
- Lifecycle (EXPLORING → CONFIRMING → CONFIRMED)
- Persistence model (COMPANION_CORE_NARROW_CALLBACK)
- Safety flow (steps 1b + 6 — before conductor)
- Entity schemas
- All 5 deployed engines
- Group 1 corrections (identity, grounding, orientation, conductor, language, bootstrap)
- Group 2 corrections (recent_context, safety_classification, classification call, recovery, clarification)

---

## What Was Not Tested

- Exercise SMUDGE 3 (Paul's human/UI acceptance test) — not yet authorised
- Behavioural variety across multiple frustration/orientation/correction turns — single-turn proof only
- Interaction with lifecycle transitions (e.g. frustration during CONFIRMING) — lifecycle is unchanged, but human validation needed
- The Class 2 safety false-positive issue from SMUDGE 2 AAR — separate workstream, not in scope

---

## Verdict

**PASS**

All 6 acceptance tests passed. The conductor wiring successfully uses the already-computed `interpretation.intent` to control Smudge's conversational act before generation. When an authoritative intent is present (frustration, orientation, correction), generation follows it and does not default to a discovery question. When no authoritative intent is present (answering, other), normal exploration behaviour is preserved.

Architecture, lifecycle, companionCore, engines, persistence, and safety flow all unchanged. No new LLM call. 44 lines added, 2 modified, 0 removed.

Exercise SMUDGE 3 remains Paul's human/UI acceptance test.
