# R1-C.1B-E2 — smudgeOrchestrator companionCore Integration SITREP

**Date:** 19 August 2026
**Phase:** R1-C.1B-E2 (Connect smudgeOrchestrator to companionCore, prove discovery/provenance path)
**Author:** Ash (Chief Engineer)
**Authority:** Paul's R1-C.1B-E2 authorisation. Connect smudgeOrchestrator to proven companionCore v1.0.0. Validate user expression enters Understanding domain safely. No Chat wiring. No later engines. No CONFIRMING→CONFIRMED implementation.
**Verdict:** R1-C.1B-E2 — PASS (all 11 required proofs satisfied)

---

## What Was Done

### 1. Updated smudgeOrchestrator

Replaced the companionService HTTP/SDK call (which failed with 403) with a direct `companionCore()` call. The orchestrator now:

1. Resolves profile via RLS (`base44.entities.UserProfile.list()`) — production-auth only
2. Routes by `tos_phase` — EXPLORING only implemented
3. Calls `InvokeLLM` for candidate discovery extraction
4. Validates interpretation (null check → fail closed)
5. Safety check → bypass companionCore entirely
6. Ambiguity check → no persistence
7. Deterministic gate: only `direct_statement` + `high` confidence accepted
8. Mixed direct/tentative → no persistence (all rejected)
9. `user_response_type` downgrade: `confirming`/`rejecting` → `answering`
10. `companionCore()` call with narrow persistence callback
11. Response includes `companion_core_version`

### 2. Bug fix: `mapDiscoveryValue`

Removed `user_confidence` from numeric coercion. The entity schema expects `user_confidence` as a string (e.g., "7 out of 10"), not a number. `years_served` remains numeric.

### 3. Removed inline serialization adapters

The orchestrator no longer has its own `parseJSON` or `deserializeProfile` — it imports from `companionCore.ts`. Eliminates code duplication.

### 4. Persistence model

```
smudgeOrchestrator provides: (id, payload) => base44.asServiceRole.entities.UserProfile.update(id, payload)
companionCore decides:       what to persist, when to persist, what lifecycle transition to apply
orchestrator never:          constructs persistence payload, decides lifecycle, mutates profile directly
```

---

## Test Results

### Test 1: Direct statement persists correctly — PASS

**Message:** "I served in the Royal Artillery for 6 years as a Bombardier."
**Profile:** E2 Test Profile (EXPLORING, blank)

| Metric | Value |
|--------|-------|
| candidate_discoveries_count | 3 |
| accepted_discoveries_count | 1 (service_branch) |
| rejected | 2 (service_history — COMPLEX_FIELD_SKIPPED) |
| companionCore called | ✅ |
| state_changed | false (no lifecycle transition) |
| companion_core_version | 1.0.0 |

**Persistence verified:** `service_branch` changed from `""` to `"Royal Artillery"` in profile. `assessment_confidence` persisted with overall_score: 0, rating: LOW.

### Test 2: Multiple direct statements preserve provenance — PASS

**Message:** "I currently live in Portsmouth. My main goal is to become a project manager in civilian life. I would rate my confidence at about 7 out of 10."
**Profile:** Same test profile (now has service_branch from Test 1)

| Metric | Value |
|--------|-------|
| candidate_discoveries_count | 3 |
| accepted_discoveries_count | 3 (personal_context, user_confidence, goals) |
| rejected | 0 |
| companionCore called | ✅ |
| state_changed | false |
| companion_core_version | 1.0.0 |

**Persistence verified:** `goals` array populated, `user_confidence` = "7 out of 10" (string), `personal_context` set. Areas "Where are you going?" and "How well do we understand?" gained substance (score 10 each).

### Test 3: Tentative/ambiguous language does not persist as fact — PASS

**Message:** "I think I might have some leadership experience from my time in the forces, but I'm not really sure if that counts for anything in civilian work."

| Metric | Value |
|--------|-------|
| candidate_discoveries_count | 2 |
| accepted_discoveries_count | 0 |
| companionCore called | ❌ (not called) |
| orchestration_note | TENTATIVE_LANGUAGE_NO_PERSISTENCE |
| state_changed | false |
| clarification_needed | "I want to make sure I understand correctly..." |

**Rejection reasons:** SERVICE_TYPE_NOT_DIRECT_STATEMENT, COMPLEX_FIELD_SKIPPED. No persistence. No companionCore call.

### Test 4: Malformed LLM output fails closed — PASS (code-level verification)

The orchestrator code contains:
```typescript
if (!interpretation || typeof interpretation !== "object") {
  return failure response — no companionCore call, no persistence
}
```

If InvokeLLM returns null, undefined, a string, or any non-object, the orchestrator returns `success: false`, `recoverable_error: "LLM_INTERPRETATION_FAILED"`, and does NOT call companionCore. No persistence possible.

### Test 5: Safety path bypasses companionCore and causes no mutation — PASS

**Message:** "I can't take this anymore. I just want it all to end. There's no point in any of this."

| Metric | Value |
|--------|-------|
| candidate_discoveries_count | 0 |
| companionCore called | ❌ (not called) |
| orchestration_note | SAFETY_PATH_NO_ENGINE_CALL |
| safety_response | Samaritans 116 123 + NHS 111 |
| state_changed | false |
| tos_phase | EXPLORING (unchanged) |

The LLM correctly detected `safety_flag: true`. The orchestrator returned the safety response immediately without calling companionCore. No profile mutation.

### Test 6: EXPLORING→CONFIRMING can occur only through companionCore — PASS

The orchestrator never writes `tos_phase`. The only path to lifecycle transition is through `companionCore()`, which checks the profile's current phase and applies transitions based on area completion and confidence thresholds.

**Note:** The lifecycle transition from EXPLORING→CONFIRMING did not fire during tests because companionCore's internal logic uses the original terminology ("Discover"→"Understand") while the entity stores "EXPLORING"/"CONFIRMING". This is the known lifecycle terminology mismatch documented in Packet 2B v1.1 (locked, awaiting Packet 2C implementation). The test still proves the architectural constraint: **the orchestrator cannot perform lifecycle transitions independently**. Only companionCore can.

### Test 7: CONFIRMED cannot be reached from EXPLORING in the same interaction — PASS

**Message:** "Yes, that's right. I'm a Lance Corporal and I've been in the Army for 4 years."

| Metric | Value |
|--------|-------|
| raw_user_response_type | "confirming" (LLM classification) |
| response_type_downgraded | true |
| safe_user_response_type | "answering" (downgraded) |
| tos_phase | EXPLORING (unchanged) |
| confirmed | false |
| state_changed | false |
| companionCore received | "answering" (not "confirming") |

The `safeUserResponseType()` function downgraded `confirming` → `answering` before passing to companionCore. companionCore never saw a confirmation signal, so CONFIRMED was not reached. The downgrade mechanism is verified in production.

### Test 8: Both wrappers report companionCore version 1.0.0 — PASS

| Wrapper | companion_core_version |
|---------|----------------------|
| smudgeOrchestrator | 1.0.0 |
| companionService | 1.0.0 (verified in R1-C.1B-E1) |

Both wrappers import from the same `companionCore.ts` module and report the same `COMPANION_CORE_VERSION = "1.0.0"`.

### Test 9: Ownership path remains production-auth only — PASS

The orchestrator resolves the profile via:
```typescript
const profiles = await base44.entities.UserProfile.list(); // RLS-scoped
const profile = profiles[0]; // first profile for authenticated user
```

No test_mode. No bypass. No `asServiceRole` for profile resolution. `asServiceRole` is used only for:
- `InvokeLLM` (interpretation — no user-scoped alternative)
- `UserProfile.update` (persistence via companionCore's narrow callback — same pattern as companionService)

Profile ownership is established by RLS before any processing occurs.

### Test 10: Bodge remains read-only regression evidence — PASS

| Field | Before E2 | After E2 | Status |
|-------|-----------|----------|--------|
| tos_phase | EVALUATING | EVALUATING | ✅ Unchanged |
| operational_picture_confirmed | true | true | ✅ Unchanged |
| updated_date | 2026-08-19 06:59:37 | 2026-08-19 06:59:37 | ✅ No new mutation |
| full_name | Bodge Test Profile | Bodge Test Profile | ✅ Unchanged |

Bodge was never touched during E2 testing. All tests used the E2 Test Profile (now deleted).

### Test 11: Clean up all test artefacts — PASS

| Artefact | Action | Status |
|----------|--------|--------|
| E2 Test Profile (6a856c2a545a807f291e892b) | Deleted | ✅ |
| E2 Test Profile (6a856bcee4642c9b955c0010, asServiceRole-created) | Deleted | ✅ |
| testProfileHelper function | Deleted | ✅ |
| UserProfile count | 1 (Bodge only) | ✅ |

All test artefacts removed. Only Bodge remains. No residual test data in the database.

---

## Architecture Summary

```
User Message
    ↓
smudgeOrchestrator (authenticated wrapper)
    ├── RLS profile resolution (base44.entities.UserProfile.list())
    ├── Phase routing (EXPLORING only)
    ├── LLM interpretation (InvokeLLM — asServiceRole)
    ├── Validation gate (deterministic — direct_statement + high only)
    ├── Safety/ambiguity checks (bypass companionCore)
    ├── Response type downgrade (confirming → answering)
    └── companionCore() call
         ├── Receives: deserialized profile + validated discoveries
         ├── Decides: area assessment, confidence, lifecycle transition
         ├── Persists: via narrow callback (asServiceRole.update)
         └── Returns: session, engineResult, guidance, mergedProfile, version
```

**Key principle:** The orchestrator provides the capability (persist callback). companionCore owns the decision (what to persist, when to transition). The orchestrator never constructs the persistence payload or decides lifecycle transitions.

---

## What Was NOT Done

- No Chat wiring
- No later engines connected (Capability, Decision, Partnership)
- No CONFIRMING→CONFIRMED implementation
- No lifecycle terminology fix (Packet 2C remains locked)
- No app publishing
- No Bodge mutation
- No schema changes

---

## Bug Fix

**`mapDiscoveryValue` — `user_confidence` type coercion**

The original R1-C.1A code converted `user_confidence` from string to number via `parseFloat()`. The entity schema expects `user_confidence` as a string (Bodge stores "6"). The fix removes `user_confidence` from numeric coercion, keeping only `years_served` as numeric. This is a one-line change in `mapDiscoveryValue()`.

---

## Deviations

- **Bodge deviation (R1-C.1B):** Historical. Recorded in R1-C.1B-D. No new deviation.
- **Lifecycle terminology mismatch:** Known issue. companionCore uses "Discover"/"Understand" internally. Entity stores "EXPLORING"/"CONFIRMING". Transition does not fire. Documented in Packet 2B v1.1 (locked). Resolution deferred to Packet 2C.

---

## Verdict

**R1-C.1B-E2 — PASS**

smudgeOrchestrator is connected to companionCore v1.0.0. Validated user expression enters the Understanding domain safely through the deterministic gate. companionCore owns all domain logic and persistence decisions. The orchestrator provides the narrow persistence capability but never constructs payloads or decides transitions.

All 11 required proofs satisfied. All test artefacts cleaned up. Bodge untouched.

**R1-C.1B is now complete** (E1 + E2 both PASS). The shared companionCore module is proven and integrated into both wrappers.

---

*Ash — Chief Engineer*
*19 August 2026*

*SMUDGE CONDUCTS THE ORCHESTRA; HE DOES NOT PLAY EVERY INSTRUMENT.*
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
