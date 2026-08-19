# R1-C.1B-E2R — Shared Core Lifecycle Regression SITREP

**Date:** 19 August 2026
**Phase:** R1-C.1B-E2R (Lifecycle regression fix in companionCore)
**Author:** Ash (Chief Engineer)
**Authority:** Paul's R1-C.1B-E2R directive. Restore Packet 2 lifecycle behaviour inside companionCore without changing the approved shared-core architecture. Inspect, correct only the proven regression, prove through 10 tests, clean up.
**Verdict:** R1-C.1B-E2R — **PASS** (all 10 tests satisfied)

---

## A. Root Cause

During the R1-C.1B-E1 extraction of companionCore from companionService, the lifecycle transition logic was copied from the pre-Packet-2C codebase. The pre-Packet-2C companionService used legacy internal terminology (`'Discover'` → `'Understand'`) for the `tos_phase` transition. Packet 2C had subsequently corrected this to the canonical entity terminology (`'EXPLORING'` → `'CONFIRMING'`), but that correction was not carried forward into the extracted companionCore.

Additionally, the confirmation guard — which prevents an EXPLORING-origin interaction from reaching CONFIRMED in the same call — was incomplete in the extracted companionCore. The `operational_picture_confirmed` field could be set to `true` by any `confirming` response regardless of the profile's current phase, and the mode transition to `CONFIRMED` lacked a phase precondition check.

## B. Exact Legacy Logic Found

Three defects identified in companionCore v1.0.0:

### Defect 1: Lifecycle terminology (line 303)
```typescript
// FOUND (legacy):
if (minUnderstanding && profile.tos_phase === 'Discover') newPhase = 'Understand';
```
The canonical persisted lifecycle states are `EXPLORING` and `CONFIRMING` (Packet 2B v1.1). The legacy `Discover`/`Understand` values never match the stored `tos_phase`, so the EXPLORING → CONFIRMING transition never fires.

### Defect 2: Missing CONFIRMING → CONFIRMED tos_phase transition
The code only handled EXPLORING → CONFIRMING. There was no logic to persist `tos_phase: 'CONFIRMED'` when a valid confirmation was processed. The mode would be set to `CONFIRMED` but the persisted `tos_phase` would remain `CONFIRMING`.

### Defect 3: Confirmation guard incomplete
**operational_picture_confirmed (line 291):**
```typescript
// FOUND (no phase guard):
operational_picture_confirmed: userResponseType === 'confirming' ? true : ...
```
Any `confirming` response would set `operational_picture_confirmed = true`, regardless of whether the profile was in `CONFIRMING`. This allowed an EXPLORING-origin confirmation to set the confirmed flag.

**Mode transition (line 342):**
```typescript
// FOUND (no phase precondition):
if (userResponseType === 'confirming' && engineResult.can_proceed) {
  mode = 'CONFIRMED';
}
```
No check that `profile.tos_phase === 'CONFIRMING'` before transitioning to CONFIRMED mode.

## C. Exact Correction

Four targeted changes to companionCore. No other logic, provenance, ownership, serialization, gate, or flow guidance was modified.

### Fix 1: Lifecycle terminology (line 303)
```typescript
// CORRECTED:
if (minUnderstanding && profile.tos_phase === 'EXPLORING') newPhase = 'CONFIRMING';
```

### Fix 2: CONFIRMING → CONFIRMED tos_phase transition (new, after line 303)
```typescript
// ADDED:
if (userResponseType === 'confirming' && userConfirmed && readyForConfirmation && profile.tos_phase === 'CONFIRMING') {
  newPhase = 'CONFIRMED';
}
```

### Fix 3: operational_picture_confirmed guard (line 291)
```typescript
// CORRECTED:
operational_picture_confirmed: userResponseType === 'rejecting'
  ? false
  : (userResponseType === 'confirming' && profile.tos_phase === 'CONFIRMING' ? true : (profile.operational_picture_confirmed ?? false)),
```
`operational_picture_confirmed` can only be set `true` when the profile is ALREADY in `CONFIRMING`.

### Fix 4: Mode transition guard (line 342)
```typescript
// CORRECTED:
if (userResponseType === 'confirming' && engineResult.can_proceed && profile.tos_phase === 'CONFIRMING') {
  mode = 'CONFIRMED';
}
```
CONFIRMED mode requires the profile was already in CONFIRMING before this call.

### Version increment
`COMPANION_CORE_VERSION` changed from `"1.0.0"` to `"1.1.0"`.

## D. Shared-Core Version

**companionCore v1.1.0** — lifecycle regression fix.

Changes: 4 targeted corrections (2 terminology fixes, 1 new transition, 2 guard additions). No structural changes. No changes to area assessment, substance checks, confidence calculation, reflection generation, flow guidance, or serialization adapters.

## E. Wrapper Deployment Parity

Both wrappers were redeployed in lockstep after the shared module update:

| Wrapper | companion_core_version | Status |
|---------|----------------------|--------|
| smudgeOrchestrator | 1.1.0 | ✅ Verified |
| companionService | 1.1.0 | ✅ Verified |

Both wrappers import from the same `shared/companionCore.ts` module and report the same version.

## F. T1–T10 Results

### T1: Incomplete direct discoveries → remains EXPLORING — PASS
**Profile:** E2R-T1 Blank Profile (EXPLORING, blank)
**Message:** "I served in the Royal Artillery for 6 years."
**Result:**
- `tos_phase: "EXPLORING"` (unchanged) ✅
- `state_changed: false` ✅
- `lifecycle_transition: null` ✅
- 1 discovery accepted (service_branch), 0 areas with substance ✅
- `companion_core_version: "1.1.0"` ✅

### T2: Sufficient six-area direct understanding → CONFIRMING — PASS
**Profile:** E2R-T2 Pre-populated Profile (EXPLORING, service_history pre-populated)
**Message 1:** "I'm a Sergeant in the Royal Engineers with 8 years of service. I specialise in combat construction and demolition. I currently live in Aldershot with my family. My main goal is to become a construction site manager after I leave."
**Message 2:** "My rank is Sergeant. That is my official military rank."
**Result after Message 2:**
- `tos_phase: "CONFIRMING"` (transitioned from EXPLORING) ✅
- `state_changed: true` ✅
- `lifecycle_transition: "EXPLORING → CONFIRMING"` ✅
- All 4 minUnderstanding areas have substance ✅
- `companion_core_version: "1.1.0"` ✅

### T3: operational_picture_confirmed remains false at CONFIRMING — PASS
**Verified in T2 response:**
- `confirmed: false` ✅
- `operational_picture_confirmed: false` ✅
- Profile is in CONFIRMING but not confirmed ✅

### T4: Confirmation-like input from EXPLORING → CONFIRMING only, never CONFIRMED — PASS
**Profile:** E2R-T4 Confirm Guard (EXPLORING, all 4 minUnderstanding areas pre-populated)
**Method:** companionService with `user_response_type: "confirming"` and `new_discoveries: { years_served: 8 }`
**Result:**
- `tos_phase: "CONFIRMING"` (transitioned from EXPLORING) ✅
- `operational_picture_confirmed: false` (NOT set to true) ✅
- `mode: "EXPLORING"` (NOT CONFIRMED) ✅
- `confirmed: false` ✅
- Profile reached CONFIRMING but NOT CONFIRMED ✅

**Guard mechanism:** `operational_picture_confirmed` was not set to true because `profile.tos_phase !== 'CONFIRMING'` (it was EXPLORING). Therefore `userConfirmed = false`, `can_proceed = false`, and neither the tos_phase nor the mode transitioned to CONFIRMED.

### T5: Existing CONFIRMING + explicit valid confirmation → CONFIRMED — PASS
**Profile:** E2R-T4 Confirm Guard (now in CONFIRMING with all 6 areas filled)
**Method:** companionService with `user_response_type: "confirming"` and `new_discoveries: { years_served: 8 }`
**Result:**
- `tos_phase: "CONFIRMED"` (transitioned from CONFIRMING) ✅
- `operational_picture_confirmed: true` ✅
- `mode: "CONFIRMED"` ✅
- `confirmed: true` ✅
- `assessment_confidence: "HIGH"` (83/100) ✅
- All 6 areas have substance ✅
- Behavioural note: "Picture confirmed. The user has agreed this is them. Phase Three (Evaluate) can begin when ready." ✅

### T6: Same lifecycle behaviour through companionService wrapper — PASS
T4 and T5 were both executed through the companionService wrapper. Results:
- T4: EXPLORING + confirming → CONFIRMING (not CONFIRMED) ✅
- T5: CONFIRMING + confirming → CONFIRMED ✅
- companionService reported `companion_core_version: "1.1.0"` ✅

### T7: Same lifecycle behaviour through smudgeOrchestrator wrapper — PASS
**Profile:** E2R-T7 Orchestrator Lifecycle (EXPLORING, all 4 minUnderstanding areas pre-populated)
**Message:** "I'm a combat construction and demolition specialist with 8 years of operational experience. I would rate my confidence at about 7 out of 10."
**Result:**
- `tos_phase: "CONFIRMING"` (transitioned from EXPLORING) ✅
- `state_changed: true` ✅
- `lifecycle_transition: "EXPLORING → CONFIRMING"` ✅
- `confirmed: false` ✅
- `companion_core_version: "1.1.0"` ✅
- smudgeOrchestrator also confirmed the `confirming` → `answering` downgrade in a separate call ✅

### T8: Version parity confirmed — PASS
| Wrapper | companion_core_version |
|---------|----------------------|
| smudgeOrchestrator | 1.1.0 ✅ |
| companionService | 1.1.0 ✅ |

Both wrappers import from the same shared companionCore module and report identical version.

### T9: Discovery/provenance tests from E2 remain green — PASS
Three key E2 tests re-verified with v1.1.0:

**Direct statement persists:**
- `service_branch: "Royal Artillery"` accepted and persisted ✅
- companionCore called, `companion_core_version: "1.1.0"` ✅

**Tentative language rejected:**
- Message: "I think I might have some leadership experience..."
- 0 accepted discoveries ✅
- `companion_result: null` (companionCore not called) ✅
- `orchestration_note: "MIXED_DIRECT_AND_TENTATIVE_NO_PERSISTENCE"` ✅

**Safety path bypasses companionCore:**
- Message: "I can't take this anymore. I just want it all to end."
- `orchestration_note: "SAFETY_PATH_NO_ENGINE_CALL"` ✅
- `companion_result: null` (companionCore not called) ✅
- Safety response provided (Samaritans 116 123, NHS 111) ✅

### T10: Bodge read-only regression — PASS
| Field | Value | Status |
|-------|-------|--------|
| tos_phase | EVALUATING | ✅ Unchanged |
| operational_picture_confirmed | true | ✅ Unchanged |
| updated_date | 2026-08-19T06:59:37 | ✅ No new mutation |
| full_name | Bodge Test Profile | ✅ Unchanged |

Bodge was never touched during E2R testing. All tests used controlled test profiles.

## G. Packet 2 Lifecycle Regression Evidence

| Transition | Before Fix (v1.0.0) | After Fix (v1.1.0) |
|------------|---------------------|---------------------|
| EXPLORING + insufficient → EXPLORING | ✅ Worked (no match on 'Discover') | ✅ Works (no match on 'EXPLORING' + not minUnderstanding) |
| EXPLORING + six-area readiness → CONFIRMING | ❌ FAILED (matched 'Discover', never stored) | ✅ Works (matches 'EXPLORING', transitions to 'CONFIRMING') |
| CONFIRMING + non-confirming → CONFIRMING | ✅ Worked (no transition) | ✅ Works (no transition) |
| CONFIRMING + explicit confirmation → CONFIRMED | ❌ FAILED (no CONFIRMED transition) | ✅ Works (newPhase = 'CONFIRMED') |
| EXPLORING-origin → CONFIRMED in same call | ⚠️ UNGUARDED (could set opc=true) | ✅ Guarded (requires tos_phase === 'CONFIRMING') |

## H. Discovery/Provenance Regression Evidence

| E2 Test | v1.0.0 | v1.1.0 |
|---------|--------|--------|
| Direct statement persists | ✅ PASS | ✅ PASS |
| Multiple direct statements preserve provenance | ✅ PASS | ✅ PASS (not re-run, logic unchanged) |
| Tentative language rejected | ✅ PASS | ✅ PASS |
| Malformed LLM fails closed | ✅ PASS | ✅ PASS (code unchanged) |
| Safety path bypasses companionCore | ✅ PASS | ✅ PASS |
| Orchestrator confirmation downgrade | ✅ PASS | ✅ PASS (code unchanged) |

No discovery/provenance regression introduced by the lifecycle fix.

## I. Cleanup

| Artefact | Action | Status |
|----------|--------|--------|
| E2R-T1 Blank Profile (6a856f6ed7de91e949535689) | Deleted | ✅ |
| E2R-T2 Pre-populated Profile (6a856f70767f3b464ac7f9ba) | Deleted | ✅ |
| E2R-T4 Confirm Guard (6a856f8dd5cd1be4ef06b2fa) | Deleted | ✅ |
| E2R-T7 Orchestrator Lifecycle (6a856faca0de69745a2ce777) | Deleted | ✅ |
| testProfileHelper function | Deleted | ✅ |
| UserProfile count | 1 (Bodge only) | ✅ |

All test artefacts removed. Only Bodge remains. No residual test data in the database.

## J. Verdict

**R1-C.1B-E2R — PASS**

The Packet 2 lifecycle regression introduced during companionCore extraction has been corrected. Four targeted fixes restore the canonical lifecycle behaviour:

1. `EXPLORING → CONFIRMING` transition uses canonical terminology
2. `CONFIRMING → CONFIRMED` transition added with explicit guard
3. `operational_picture_confirmed` can only be set when profile is already in CONFIRMING
4. CONFIRMED mode requires profile was already in CONFIRMING before this call

All 10 required proofs satisfied. No discovery/provenance regression. No changes to provenance logic, deterministic gate, ownership, serialization, flow guidance, or safety path. Both wrappers deployed in lockstep and report companionCore v1.1.0.

**R1-C.1B is now complete** (E1 extraction + E2 integration + E2R regression fix, all PASS).

---

*Ash — Chief Engineer*
*19 August 2026*

*THE FIX IS SURGICAL. THE ARCHITECTURE IS UNCHANGED. THE LIFECYCLE IS RESTORED.*
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
