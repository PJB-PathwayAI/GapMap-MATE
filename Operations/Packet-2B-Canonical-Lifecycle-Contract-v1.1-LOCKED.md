# PACKET 2B — CANONICAL LIFECYCLE CONTRACT v1.1 (LOCKED)

**From:** Ash (Chief Engineer)  
**To:** Paul (Product Owner) + Cipher (Doctrine & Architecture)  
**Date:** 16 August 2026  
**Subject:** Final canonical lifecycle contract — three-view convergence  
**Status:** CONTRACT LOCKED pending three-view sign-off  
**Classification:** Engineering Record  
**Supersedes:** Packet-2B-Canonical-Lifecycle-Contract-v1.0.md  

---

## REVISION HISTORY

| Version | Date | Change |
|---------|------|--------|
| v1.0 | 16 Aug 2026 | Initial contract proposal with 5 decisions required |
| v1.1 | 16 Aug 2026 | Incorporates Paul + Cipher decisions. Single-owner model. Confirmation boundary hardened. Bodge evidence clarification. |

---

## Paul + Cipher DECISIONS — ENGINEERING REVIEW

### Decision 1 — SOAKING

**APPROVED. No engineering concern.**

SOAKING remains `soak_period.state` only. `tos_phase` enum unchanged. The two-field design is preserved. No implementation impact.

### Decision 2 — All six areas threshold

**APPROVED WITH CLARIFICATION. No engineering concern.**

The existing substance/evidence assessment already checks all six areas. The `readyForConfirmation` condition in both engineUnderstanding and companionService is:

```javascript
const allCoreSubstantive = areas.slice(0, 5).every(a => a.has_substance);
const understandingSubstantive = areas[5].has_substance;
const readyForConfirmation = allCoreSubstantive && understandingSubstantive;
```

This is the existing substance check — not a new scoring mechanism. It uses the same `hasSubstance()` / `hasArrSubstance()` functions that drive the 15-character threshold. No new completion or scoring logic is introduced.

The `minimumUnderstanding` check (Q1–Q4 only) currently used for phase advancement will be retired in favour of the `readyForConfirmation` check (Q1–Q6) as the sole gate for EXPLORING → CONFIRMING.

### Decision 3 — Single ownership of EXPLORING → CONFIRMING

**APPROVED. No engineering concern. I agree this is cleaner than dual ownership.**

Engineering analysis of the single-owner model:

**Current state:** Both engineUnderstanding and companionService write `tos_phase`. Both have parallel assessment logic.

**Canonical state:** companionService exclusively writes `tos_phase` for EXPLORING → CONFIRMING. engineUnderstanding performs assessment only and returns readiness flags.

**Flow verification:**

1. User talks to Smudge → companionService receives `new_discoveries`
2. companionService merges discoveries, assesses all six areas
3. When `readyForConfirmation` is true AND `profile.tos_phase === 'EXPLORING'` → companionService writes `tos_phase = 'CONFIRMING'`
4. companionService transitions conversation mode to REFLECTING
5. engineUnderstanding may be called separately for assessment-only updates (e.g., Dashboard readiness check) — it returns `ready_for_confirmation: true` but does NOT write `tos_phase`

**Hidden dependency identified and resolved:** If engineUnderstanding is called directly with discoveries (bypassing companionService), it will update profile data but NOT advance the lifecycle. This is the correct behaviour — discoveries should be processed through the conversational layer, not directly through the assessment engine.

**No unintended consequences.** The parallel assessment logic in companionService already mirrors engineUnderstanding's. No new assessment code is needed — companionService already computes `readyForConfirmation` independently.

### Decision 4 — Confirmation boundary

**APPROVED. No engineering concern. This is a hard doctrinal boundary.**

Engineering analysis:

**Current state:** engineUnderstanding accepts `confirm_operational_picture` parameter and writes `operational_picture_confirmed` to the profile. This allows an engine to declare the picture confirmed without user action.

**Canonical state:**

| Component | May read `operational_picture_confirmed`? | May write `operational_picture_confirmed`? |
|-----------|------------------------------------------|-------------------------------------------|
| engineUnderstanding | YES (for assessment confidence calculation) | **NO** — must not write this field |
| companionService | YES | YES — `true` on explicit user confirmation, `false` on correction/rejection |

**Implementation approach:**

1. engineUnderstanding: Remove `confirm_operational_picture` from request body destructuring. Remove `operational_picture_confirmed` from the merged/update payload. Read `existing.operational_picture_confirmed` for assessment calculation instead of `merged.operational_picture_confirmed`.

2. companionService: Already handles both directions:
   - `user_response_type === 'confirming'` → `operational_picture_confirmed = true`
   - `user_response_type === 'rejecting'` → `operational_picture_confirmed = false`
   - No changes needed to this logic.

**Sequencing verification for CONFIRMING → CONFIRMED:**

The companionService computes `userConfirmed` and `readyForConfirmation` BEFORE the profile update write. This means the CONFIRMED transition can be added to the `newPhase` logic in the same call:

```javascript
let newPhase = profile.tos_phase;
if (readyForConfirmation && profile.tos_phase === 'EXPLORING') newPhase = 'CONFIRMING';
if (userConfirmed && readyForConfirmation && profile.tos_phase === 'CONFIRMING') newPhase = 'CONFIRMED';
```

**Critical guard:** The CONFIRMED check uses `profile.tos_phase === 'CONFIRMING'` (the persisted value BEFORE this call), not `newPhase`. This prevents skipping: if the profile is in EXPLORING, it can only advance to CONFIRMING, even if the user confirms in the same call. The user must first reach CONFIRMING (see the reflected picture), then confirm in a subsequent call.

### Decision 5 — SETTLED terminal

**APPROVED. No engineering concern.**

SETTLED is terminal for MVP pilot. No return-journey logic required. pilotAccountReset handles the full reset case (admin tool).

---

## BODGE EVIDENCE CLARIFICATION

**Preserved for the Packet 2 Test Receipt:**

> Bodge proved the individual engine behaviours within their respective phases. He did not prove the natural lifecycle handoffs between those phases.

This distinction is correct and important:

- **What Bodge proved:** Each engine correctly processes data when called in the right state. Capability Intelligence accepts and evidences capabilities. Decision Readiness manages soak and pathway matching. Transition Partnership manages journeys and checkpoints.
- **What Bodge did NOT prove:** The automatic transition from one phase to the next. Bodge's `tos_phase` was manually set to `EVALUATING` during testing. The natural chain from EXPLORING through to SETTLED was never exercised.
- **What Packet 2 proves:** Whether the lifecycle contract enables the natural chain. Packet 2C will be the first time the handoffs are tested.

This does not invalidate the earlier exercises. The engines are proven. The contract between them is what Packet 2 addresses.

---

## FINAL CANONICAL STATE MACHINE

```
                    profileBootstrap
                          │
                          ▼
                     EXPLORING
                    [operational_picture_confirmed = false]
                          │
                  [all six areas substantive
                   + user_confidence set
                   — companionService assessment]
                          │
                          ▼
                     CONFIRMING
                    [operational_picture_confirmed = false]
                          │
                  [explicit user confirmation
                   "Yes, that's me"
                   — companionService, user_response_type: confirming]
                          │
                          ▼
                     CONFIRMED
                    [operational_picture_confirmed = true]
                          │
                  [first capability submitted
                   with valid evidence
                   — engineCapabilityIntelligence]
                          │
                          ▼
                     EVALUATING
                    [soak_period.state = NOT_STARTED]
                          │
                  [initiate_soak action
                   — engineDecisionReadiness]
                          │
                          ▼
                     EVALUATING
                    [soak_period.state = SOAKING]
                          │
                  [complete_soak or bypass_soak
                   — engineDecisionReadiness]
                          │
                          ▼
                     EVALUATING
                    [soak_period.state = COMPLETED or BYPASSED]
                          │
                  [tos_phase advances
                   — engineDecisionReadiness]
                          │
                          ▼
                    READY_TO_ACT
                          │
                  [start_journey action
                   — engineTransitionPartnership]
                          │
                          ▼
                   IN_TRANSITION
                          │
                  [partnership_state → INDEPENDENT
                   — engineTransitionPartnership]
                          │
                          ▼
                    SETTLED (terminal for MVP)
```

**Persisted `tos_phase` values (7):**

```
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED
```

**SOAKING is NOT a `tos_phase` value.** It is a `soak_period.state` sub-state within EVALUATING.

---

## FINAL ENGINE OWNERSHIP MATRIX

| Function | Reads (valid entry phases) | Writes `tos_phase` | Writes `operational_picture_confirmed` | Transitions owned | Must NEVER write |
|----------|---------------------------|-------------------|----------------------------------------|-------------------|-----------------|
| **profileBootstrap** | None (creates new) | `EXPLORING` (on creation) | `false` (on creation) | (none) → EXPLORING | Any state other than EXPLORING |
| **engineUnderstanding** | `EXPLORING`, `CONFIRMING` | **Does NOT write `tos_phase`** | **Does NOT write `operational_picture_confirmed`** | None — assessment only | Any `tos_phase` value; `operational_picture_confirmed` |
| **companionService** | `EXPLORING`, `CONFIRMING`, `CONFIRMED` | `CONFIRMING` (from EXPLORING), `CONFIRMED` (from CONFIRMING) | `true` (user confirms), `false` (user corrects/rejects) | EXPLORING → CONFIRMING, CONFIRMING → CONFIRMED | EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED |
| **engineCapabilityIntelligence** | `CONFIRMED` | `EVALUATING` (on first capability submission) | No | CONFIRMED → EVALUATING | EXPLORING, CONFIRMING, CONFIRMED, READY_TO_ACT, IN_TRANSITION, SETTLED |
| **engineDecisionReadiness** | `EVALUATING`, `READY_TO_ACT` | `READY_TO_ACT` (on soak completion/bypass) | No | EVALUATING → READY_TO_ACT | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING, IN_TRANSITION, SETTLED |
| **engineTransitionPartnership** | `READY_TO_ACT`, `IN_TRANSITION` | `IN_TRANSITION` (start_journey), `SETTLED` (conclude_journey) | No | READY_TO_ACT → IN_TRANSITION, IN_TRANSITION → SETTLED | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING, READY_TO_ACT |
| **pilotAccountReset** | Any (admin tool) | `EXPLORING` (reset) | `false` (reset) | Any → EXPLORING (admin only) | N/A — admin tool |

**Key changes from v1.0:**

1. engineUnderstanding: removed from `tos_phase` writers. Now assessment-only.
2. engineUnderstanding: removed from `operational_picture_confirmed` writers.
3. companionService: exclusively owns both EXPLORING → CONFIRMING and CONFIRMING → CONFIRMED.
4. Single-owner principle: each persisted transition has exactly one authoritative writer.

---

## FINAL TRANSITION TABLE

| # | From | To | Trigger | Evidence | Writer | Forbidden |
|---|------|-----|---------|---------|--------|-----------|
| T1 | (none) | EXPLORING | profileBootstrap creates profile | Authenticated user | profileBootstrap | — |
| T2 | EXPLORING | CONFIRMING | All six operational areas substantive + user_confidence set | Q1–Q6 has_substance = true | companionService | engineUnderstanding writing tos_phase; auto-advance on field count; advance without user_confidence |
| T3 | CONFIRMING | CONFIRMED | Explicit user confirmation | `user_response_type: 'confirming'` + `readyForConfirmation: true` + `tos_phase` already CONFIRMING | companionService | AI-inferred confirmation; engineUnderstanding setting `operational_picture_confirmed`; auto-advance on assessment score; skipping CONFIRMING |
| T4 | CONFIRMED | EVALUATING | First capability submitted with valid evidence | ≥1 accepted capability with evidence_refs resolving to evidence_log | engineCapabilityIntelligence | Capability evaluation without confirmed picture; auto-advance without capability submission |
| T5 | EVALUATING + soak NOT_STARTED | EVALUATING + soak SOAKING | `initiate_soak` action | `tos_phase = EVALUATING`, `soak_period.state = NOT_STARTED` | engineDecisionReadiness | Auto-initiation; soak without decision factors |
| T6 | EVALUATING + soak SOAKING | READY_TO_ACT | Soak completed or explicitly bypassed | `soak_period.state = COMPLETED` (with reflection_notes) or `BYPASSED` (with bypass_reason ≥10 chars) | engineDecisionReadiness | Auto-completion; bypass without reason |
| T7 | READY_TO_ACT | IN_TRANSITION | `start_journey` action | `tos_phase = READY_TO_ACT`, soak resolved, `capability_map` populated | engineTransitionPartnership | Auto-journey; journey without capabilities |
| T8 | IN_TRANSITION | SETTLED | Partnership state → INDEPENDENT | `partnership_state = INDEPENDENT`, `journey_concluded_date`, `conclusion_summary` | engineTransitionPartnership | Auto-conclusion; conclusion without INDEPENDENT |

---

## INTERNAL TERM MAPPING (unchanged from v1.0)

| Internal Term | Classification | Canonical Mapping |
|---------------|--------------|-------------------|
| `Discover` | INTERNAL ONLY | `EXPLORING` |
| `Understand` | INTERNAL ONLY | `CONFIRMING` (minimum understanding reached, NOT confirmed) |
| `Evaluate` | INTERNAL ONLY | `EVALUATING` |
| `REFLECTING` (conversation mode) | INTERNAL ONLY | `CONFIRMING` (picture being presented) |
| `RE_EXPLORING` (conversation mode) | INTERNAL ONLY | `CONFIRMING` (user correcting, lifecycle hasn't regressed) |

**Doctrinal boundary:** `Understand` maps to `CONFIRMING`, NOT `CONFIRMED`. The user-confirmation boundary is explicit.

---

## INVALID TRANSITION POLICY (unchanged from v1.0)

**Reject with clear precondition failure.** Return HTTP 400 with current `tos_phase`, required `tos_phase`, and a clear message. Never silently correct, auto-advance, or proceed.

**Precondition gaps to close:**

| Engine | Current `tos_phase` precondition? | Required |
|---------|--------------------------------|----------|
| engineUnderstanding | None | Add: reject if not `EXPLORING` or `CONFIRMING` (assessment-only, no phase write) |
| companionService | None | Add: reject if not `EXPLORING`, `CONFIRMING`, or `CONFIRMED` |
| engineCapabilityIntelligence | None | Add: reject if not `CONFIRMED` |
| engineDecisionReadiness | ✅ Yes | No change |
| engineTransitionPartnership | ✅ Yes | No change |

---

## IMPLEMENTATION IMPACT (updated for single-owner model)

### 1. engineUnderstanding.ts — MODERATE CHANGE

| Change | Type | Risk |
|--------|------|------|
| Remove `confirm_operational_picture` from body destructuring (line 209) | Parameter removal | Low |
| Remove `operational_picture_confirmed` from merged object (lines 236-238) | Logic removal | Low |
| Read `existing.operational_picture_confirmed` for assessment calculation (line 252) instead of `merged.operational_picture_confirmed` | One-line change | Low |
| Remove `tos_phase` from update payload (line 292) — do NOT write `tos_phase` | Logic removal | Medium — must ensure SDK preserves existing value on partial update |
| Remove `phase_advanced` from response (line 314) — engine no longer advances phase | Response change | Low |
| Add `tos_phase` precondition: reject if not `EXPLORING` or `CONFIRMING` | New logic (~5 lines) | Low |

**Total:** 3 removals + 1 one-line change + 1 response change + 1 precondition. No deeper behaviour change.

### 2. companionService.ts — MODERATE CHANGE

| Change | Type | Risk |
|--------|------|------|
| Line 340: `profile.tos_phase === 'Discover'` → `profile.tos_phase === 'EXPLORING'` | One-line mapping | Low |
| Line 340: `newPhase = 'Understand'` → `newPhase = 'CONFIRMING'` | One-line mapping | Low |
| Use `readyForConfirmation` (all six) instead of `minUnderstanding` (Q1-Q4) for phase advance gate | Logic change | Low — `readyForConfirmation` already computed |
| ADD: `if (userConfirmed && readyForConfirmation && profile.tos_phase === 'CONFIRMING') newPhase = 'CONFIRMED';` | New logic (1 line) | Medium — doctrinally critical transition |
| Add `tos_phase` precondition: reject if not `EXPLORING`, `CONFIRMING`, or `CONFIRMED` | New logic (~5 lines) | Low |

**Total:** 2 one-line mappings + 1 logic change + 1 transition addition + 1 precondition.

### 3. engineCapabilityIntelligence.ts — LOW CHANGE (unchanged from v1.0)

| Change | Type | Risk |
|--------|------|------|
| Line 432: `tos_phase: 'Evaluate'` → `tos_phase: 'EVALUATING'` | One-line mapping | Low |
| Line 496: `existing.tos_phase === 'Evaluate'` → `existing.tos_phase === 'EVALUATING'` | One-line mapping | Low |
| Line 504: `tos_phase: 'Evaluate'` → `tos_phase: 'EVALUATING'` | One-line mapping | Low |
| Add `tos_phase` precondition: require `CONFIRMED` | New logic (~5 lines) | Low-Medium |

**Total:** 3 one-line mappings + 1 precondition.

### 4. engineDecisionReadiness.ts — NO CHANGE

### 5. engineTransitionPartnership.ts — NO CHANGE

### 6. profileBootstrap.ts — NO CHANGE

### 7. pilotAccountReset.ts — NO CHANGE

### Summary

| Function | One-line mappings | Logic changes | New logic | Risk |
|----------|------------------|---------------|-----------|------|
| engineUnderstanding | 1 | 3 removals | 1 precondition | Medium |
| companionService | 2 | 1 threshold change | 1 transition + 1 precondition | Medium |
| engineCapabilityIntelligence | 3 | 0 | 1 precondition | Low-Medium |
| All others | 0 | 0 | 0 | None |
| **Total** | **6** | **4** | **4** | **Low-Medium overall** |

The two most doctrinally significant changes:
1. **engineUnderstanding stops writing `tos_phase` and `operational_picture_confirmed`** — enforces single-owner principle and user-decides boundary
2. **companionService adds CONFIRMING → CONFIRMED transition** — enforces explicit user confirmation as the gate

---

## DOCTRINAL CHECK (unchanged — all pass)

1. **Understand Before Advising** — ✅ Nothing can happen until picture is confirmed
2. **User Decides** — ✅ CONFIRMING → CONFIRMED requires explicit user action, never inferred. engineUnderstanding cannot set `operational_picture_confirmed`.
3. **Evidence Rule** — ✅ Capabilities and decision factors require evidence_refs
4. **No engine proliferation** — ✅ Single-owner principle: each transition has exactly one writer
5. **Transition more than employment** — ✅ SETTLED = "I've got this", not "I got a job"

---

## DEVIATIONS / UNCERTAINTY

### D-1: SDK partial update behaviour

The single-owner model requires engineUnderstanding to stop writing `tos_phase` and `operational_picture_confirmed`. This assumes the Base44 SDK's `.update()` method performs a partial update (only updates provided fields, preserves others). If the SDK performs a full replace, removing fields from the update payload would clear them. This must be verified during Packet 2C implementation.

**Mitigation:** If the SDK does full replace, engineUnderstanding should explicitly include `tos_phase: existing.tos_phase` and `operational_picture_confirmed: existing.operational_picture_confirmed` in the update payload to preserve them.

### D-2: No unresolved disagreements

All five Paul + Cipher decisions are technically coherent. I have no engineering objections to any refinement. The single-owner model is cleaner than my original dual-ownership proposal.

---

## PACKET 2B VERDICT

### PACKET 2B — CONTRACT READY FOR APPROVAL

The canonical lifecycle contract is fully defined, doctrinally validated, and engineering-verified. All five decisions are incorporated. The single-owner model is technically coherent with no hidden dependencies or unintended consequences.

**Implementation impact:** 6 one-line mappings + 4 logic changes + 4 small additions across 3 functions. Two doctrinally critical changes (engineUnderstanding stops writing lifecycle fields, companionService adds CONFIRMED transition). No changes to the other 4 functions.

**Bodge evidence clarification preserved:** Bodge proved individual engine behaviours, not natural lifecycle handoffs. This distinction will be recorded in the Packet 2 Test Receipt.

**No disagreements. No hidden dependencies. No unintended consequences.**

The contract is ready for three-view sign-off and implementation in Packet 2C.

---

**STOP.**

No lifecycle implementation. Packet 2C remains LOCKED. Serialization remains LOCKED. Smudge Integration remains LOCKED. MATE remains PRIVATE.

**NO ADVANCEMENT WITHOUT EVIDENCE.**

**ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.**

*Ash — Chief Engineer — 16 August 2026*
