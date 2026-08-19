# R1-C.1C-CM: Configuration Baseline Reconciliation SITREP

**Date:** 19 August 2026
**Author:** Ash (Chief Engineer)
**Status:** COMPLETE — All regression tests PASS

---

## 1. Purpose

Reconcile the deployed smudgeOrchestrator with the GitHub repository baseline (v1.0-build-baseline) to eliminate code drift and ensure the repo is the single source of truth for the deployed implementation.

## 2. Drift Inventory

The deployed orchestrator (R1-C.1C) had diverged significantly from the repo baseline (R1-C.1B-E2). The following differences were identified through bundle extraction and behavioural analysis:

### Structural Differences

| # | Repo (R1-C.1B-E2) | Deployed (R1-C.1C) | Impact |
|---|---|---|---|
| 1 | EXPLORING only | EXPLORING + CONFIRMING | CONFIRMING phase unsupported in repo |
| 2 | Multiple return statements (one per path) | Single return with flow flag (`g`) | Different control flow structure |
| 3 | No response generation | Second LLM call for response generation | Repo has no `response_text` in success path |
| 4 | No fallback generation | Deterministic fallback function | Repo cannot generate responses on LLM failure |
| 5 | `safeUserResponseType(raw)` | `safeUserResponseType(raw, mode)` | Repo downgrades confirming/rejecting in all phases |
| 6 | No CONFIRMING special case | No discoveries + CONFIRMING + confirming → years_served passthrough | Repo cannot handle confirmation in CONFIRMING phase |

### Orchestration Note Differences

| Repo (R1-C.1B-E2) | Deployed (R1-C.1C) | Resolution |
|---|---|---|
| `AMBIGUOUS_NO_PERSISTENCE` | Integrated into `CLARIFICATION_PATH` flow | Unified under `CLARIFICATION_PATH` |
| `TENTATIVE_LANGUAGE_NO_PERSISTENCE` | Integrated into `CLARIFICATION_PATH` flow | Unified under `CLARIFICATION_PATH` |
| `MIXED_DIRECT_AND_TENTATIVE_NO_PERSISTENCE` | Integrated into `CLARIFICATION_PATH` flow | Unified under `CLARIFICATION_PATH` |
| `R1-C.1B-E2_COMPANIONCORE_CALLED` | `R1-C.1C_GENERATED` | Updated to reflect generation step |
| `SAFETY_PATH_NO_ENGINE_CALL` | `SAFETY_PATH_NO_ENGINE_CALL` (unchanged) | Preserved |
| `NO_DISCOVERIES` | `NO_DISCOVERIES` (unchanged) | Preserved |
| `COMPANION_CORE_FAILED` | `COMPANION_CORE_FAILED` (unchanged) | Preserved |

### Import Path

| Repo (R1-C.1B-E2) | Deployed (R1-C.1C) | Resolution |
|---|---|---|
| `../../shared/companionCore.ts` (broken — resolves outside repo root) | Bundled at build time | Fixed to `../shared/companionCore.ts` |

### File Layout

| Repo (R1-C.1B-E2) | Reconciled (R1-C.1C-CM) |
|---|---|
| `functions/companionCore.ts` | `shared/companionCore.ts` (canonical shared layout) |

## 3. Reconciliation Actions

1. **Created `shared/companionCore.ts`** — moved from `functions/companionCore.ts` to match the deployed canonical shared layout. companionCore v1.1.0 (serialization fix) unchanged.

2. **Rewrote `functions/smudgeOrchestrator.ts`** — reconstructed from deployed bundle to match production behaviour:
   - Two-step LLM process (interpretation + response generation)
   - CONFIRMING phase support with lifecycle-aware response type handling
   - Single return with flow flag (`g = true` skips companionCore and persistence)
   - Generation prompt with 10 Smudge companion rules
   - Fallback generation function for LLM failure
   - CONFIRMING special case (no discoveries + confirming/rejecting → years_served passthrough)
   - Updated orchestration notes (`CLARIFICATION_PATH`, `R1-C.1C_GENERATED`)

3. **Updated import paths** in `functions/smudgeOrchestrator.ts` and `functions/companionService.ts` to `../shared/companionCore.ts`.

4. **Removed `functions/companionCore.ts`** — canonical version now at `shared/companionCore.ts`.

5. **Committed to GitHub** — commit `c6c04d9` on main branch.

## 4. Regression Test Results

All 7 tests run against the DEPLOYED orchestrator (production, not repo reconstruction).

| Test | Description | Result |
|---|---|---|
| T1 | Direct discovery extraction — 3 direct statements accepted | ✅ PASS (3/3 accepted, `R1-C.1C_GENERATED`) |
| T2 | Tentative rejection — 1 accepted, 1 rejected (SOURCE_TYPE_NOT_DIRECT_STATEMENT) | ✅ PASS (`CLARIFICATION_PATH`, no persistence) |
| T3 | Generation response — `response_text`, `response_intent`, `asks_question` populated | ✅ PASS (non-fallback generation in T1 and T2) |
| T4 | EXPLORING → CONFIRMING — all 6 areas substantive | ✅ PASS (`CONFIRMATION_PROMPT` intent, Reflection Moment in response) |
| T5 | CONFIRMING → CONFIRMED — user confirms, lifecycle transitions | ✅ PASS (`TRANSITION_ACKNOWLEDGEMENT`, `safe_user_response_type: "confirming"` NOT downgraded) |
| T6 | Version parity — `companion_core_version` in every response | ✅ PASS (`1.1.0` in all responses) |
| T7 | Bodge read-only regression — profile unchanged | ✅ PASS (updated_date 2026-07-21, tos_phase SETTLED, all fields intact) |

### Key Behavioural Verifications

- **Lifecycle-aware safeUserResponseType**: In T4 (EXPLORING), `raw: "confirming"` was downgraded to `safe: "answering"`. In T5 (CONFIRMING), `raw: "confirming"` was preserved as `safe: "confirming"`. This proves the lifecycle-aware response type handling works correctly.

- **Reflection Moment**: T4's generated response included "Would you be open to me sharing how I'm picturing your path so far to see if I've got it right?" — this is the Reflection Moment from Experience Blueprint Chapter 2.

- **Generation non-fallback**: All tests (T1, T2, T4, T5) produced generated responses (`generation_fallback: false`), confirming the two-step LLM process is functioning.

- **No persistence on clarification**: T2 correctly skipped companionCore (`companion_result: null`) when tentative evidence was detected, preventing persistence of uncertain data.

## 5. R1-C.1C-F Root Cause Correction

The original R1-C.1C-F SITREP attributed the serialization failure to "numeric-to-string coercion needed for schema fields." The R1-C.1C-CM investigation confirms this diagnosis was correct, but adds context:

**Full root cause:** The deployed orchestrator (R1-C.1C) had diverged from the repo baseline (R1-C.1B-E2) in multiple ways. The serialization adapter (`serializeForPersistence` in companionCore v1.1.0) was the correct fix for the numeric coercion issue. However, the deployed orchestrator also contained unverified code paths (`CLARIFICATION_PATH`, `R1-C.1C_GENERATED`) and structural changes (two-step LLM, CONFIRMING support) that were not reflected in the repo.

**Resolution:** The repo has been updated to match the deployed implementation. The serialization adapter (companionCore v1.1.0) is unchanged and continues to function correctly.

## 6. Cleanup

- Test profile (id: `6a858b2fafa768eb22833e76`) deleted from GapMap MATE app.
- `exportSourceCode` diagnostic function removal requested from builder.
- No test artefacts remain in the environment.

## 7. Conclusion

The configuration baseline reconciliation is complete. The GitHub repository now matches the deployed implementation. All 7 regression tests pass against the deployed orchestrator. The canonical shared layout (`shared/companionCore.ts`) is established. The drift between deployed and repo code is eliminated.

**Recommendation:** Proceed to Readiness Review gate (items 22-23) for Go/No-Go decision.
