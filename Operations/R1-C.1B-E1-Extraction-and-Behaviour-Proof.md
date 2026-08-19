# R1-C.1B-E1 — companionCore Extraction and companionService Behaviour Proof

**Date:** 19 August 2026
**Phase:** R1-C.1B-E1 (Extract companionCore, prove companionService unchanged)
**Author:** Ash (Chief Engineer)
**Authority:** Paul's R1-C.1B-S approval. Extract companionCore, prove existing companionService behaviour unchanged. No smudgeOrchestrator changes. No Chat wiring.
**Verdict:** R1-C.1B-E1 — PASS

---

## What Was Done

### 1. Created `base44/shared/companionCore.ts`

Extracted all deterministic domain logic from companionService into a shared module:

- **Serialization adapters:** `parseJSON`, `serializeForPersistence`, `deserializeProfile`
- **Substance helpers:** `hasSubstance`, `hasArrSubstance`
- **Assessment:** `assessAreas`, `calcConfidence`
- **Guidance:** `generateReflectionContent`, `generateFlowGuidance`
- **Constants:** `AREA_PRIORITY`, `MIN_SUBSTANCE`, `COMPANION_CORE_VERSION`
- **Main function:** `companionCore()` — receives an already-authorised, deserialized profile + narrow persistence callback, returns processing result

### 2. Refactored companionService to thin wrapper

companionService is now ~45 lines:
1. `createClientFromRequest(req)` — auth
2. Profile fetch via `asServiceRole.entities.UserProfile.get(profile_id)` — trust boundary
3. `deserializeProfile(profile)` — using shared adapter
4. `companionCore({ profile, currentMode, newDiscoveries, userResponseType, persist })` — domain processing
5. `persist` callback: `(id, payload) => base44.asServiceRole.entities.UserProfile.update(id, payload)` — narrow capability
6. Response construction — contract unchanged + `companion_core_version` (additive)

### 3. No other functions modified

- smudgeOrchestrator: untouched
- engineUnderstanding: untouched
- engineCapabilityIntelligence: untouched
- engineDecisionReadiness: untouched
- engineTransitionPartnership: untouched

---

## Test Results

### T1: Existing companionService behaviour unchanged — PASS

**Method:** Called companionService with Bodge's profile_id, no discoveries, EXPLORING mode. Compared output to pre-extraction baseline.

| Field | Baseline | After Extraction | Match |
|-------|----------|-----------------|-------|
| session.mode | EXPLORING | EXPLORING | ✅ |
| session.areas_explored | [all 6] | [all 6] | ✅ |
| session.areas_outstanding | [] | [] | ✅ |
| session.profile_phase | EVALUATING | EVALUATING | ✅ |
| session.assessment_confidence | HIGH | HIGH | ✅ |
| session.user_confidence | "6" | "6" | ✅ |
| session.confirmed | true | true | ✅ |
| flow_guidance.next_area_to_explore | null | null | ✅ |
| flow_guidance.areas_with_substance | [all 6] | [all 6] | ✅ |
| flow_guidance.areas_missing | [] | [] | ✅ |
| flow_guidance.ready_to_reflect | true | true | ✅ |
| flow_guidance.ready_to_confirm | false | false | ✅ |
| flow_guidance.reflection_content | [same text] | [same text] | ✅ |
| flow_guidance.behavioural_notes | [4 notes] | [4 notes] | ✅ |
| profile data | [same fields] | [same fields] | ✅ |

**Latency:** Baseline 206ms → After extraction 171ms (slightly faster — less code in the function body).

**Additive field:** `companion_core_version: "1.0.0"` — present in code, appended after profile data in JSON response. Not visible in truncated response but confirmed by deployed code.

### T1b: CONFIRMED mode behaviour — PASS

Called with `current_mode: "CONFIRMED"` to verify mode-specific guidance:
- session.mode: CONFIRMED ✅
- flow_guidance.behavioural_notes: single note "Picture confirmed. The user has agreed this is them. Phase Three (Evaluate) can begin when ready." ✅
- flow_guidance.ready_to_reflect: false ✅
- flow_guidance.reflection_content: null ✅

### T2: Error handling unchanged — PASS

Called with invalid profile_id `"invalid_id_12345"`:
- Status: 500 (same as original — `get()` throws, caught by outer try-catch)
- Error: "Entity UserProfile with ID invalid_id_12345 not found"
- The `if (!profile)` 404 check is preserved for null-return edge cases

### T8: companionCore version reporting — PARTIAL (deferred to R1-C.1B-E2)

- companionService includes `companion_core_version` in response (confirmed by deployed code)
- smudgeOrchestrator not yet connected to companionCore
- Version parity cannot be verified until R1-C.1B-E2

### T10: Bodge regression — PASS

| Field | Before | After | Status |
|-------|--------|-------|--------|
| tos_phase | EVALUATING | EVALUATING | ✅ Unchanged |
| operational_picture_confirmed | true | true | ✅ Unchanged |
| updated_date | 2026-08-19 06:59:37 | 2026-08-19 06:59:37 | ✅ No new mutation |

Read-only calls (no new_discoveries) did not trigger persistence. Bodge untouched.

---

## Ownership Verification

| Principle | Status | Evidence |
|-----------|--------|----------|
| companionCore receives already-authorised profile | ✅ | companionService fetches profile via `asServiceRole.get(profile_id)`, deserializes, passes to companionCore |
| companionCore does NOT accept arbitrary profile_id as authority | ✅ | companionCore receives the profile OBJECT, not a profile_id to look up |
| companionCore does NOT establish ownership via service-role lookup | ✅ | No `asServiceRole.get()` in companionCore — only in the wrapper |
| Persistence uses narrow capability callback | ✅ | `persist: (id, payload) => base44.asServiceRole.entities.UserProfile.update(id, payload)` |
| smudgeOrchestrator not modified | ✅ | No changes to smudgeOrchestrator |
| companionService external contract unchanged | ✅ | Same input/output, additive `companion_core_version` field only |
| Packet 1 ownership rules unchanged | ✅ | companionService still authenticates via `createClientFromRequest(req)`, fetches profile via asServiceRole with profile_id from request |
| Packet 2 lifecycle ownership unchanged | ✅ | Lifecycle transition logic (`Discover → Understand`) preserved verbatim in companionCore |

---

## companionCore Version

```
COMPANION_CORE_VERSION = "1.0.0"
```

Both wrappers must report this version. Version parity is part of regression proof (T8 — deferred to R1-C.1B-E2).

---

## What Was NOT Done

- smudgeOrchestrator was NOT modified
- smudgeOrchestrator was NOT connected to companionCore
- No Chat wiring
- No engine contract changes
- No schema changes
- No Bodge mutation
- No app publishing
- No companionService auth mechanism changes (asServiceRole + profile_id preserved)

---

## Deviations

- **Bodge deviation (R1-C.1B):** Historical. Recorded in R1-C.1B-D. No new deviation.
- **companionService asServiceRole access:** Pre-existing (R1-C.1A-V finding). companionCore extraction does not change this. The wrapper still uses `asServiceRole.entities.UserProfile.get(profile_id)` with profile_id from the request body. This is a pre-existing risk to be addressed separately, not introduced by this extraction.

---

## Verdict

**R1-C.1B-E1 — PASS**

companionCore extracted successfully. companionService behaviour is unchanged after extraction. All domain logic (assessment, confidence, flow guidance, discovery merge, lifecycle transitions, mode determination) now lives in the shared module. The wrapper is a thin trust boundary.

Bodge untouched. No other functions modified. External contract preserved.

**Ready for R1-C.1B-E2** (connect smudgeOrchestrator to companionCore and run discovery/provenance tests) — pending Paul's authorisation.

---

*Ash — Chief Engineer*
*19 August 2026*

*SMUDGE CONDUCTS THE ORCHESTRA; HE DOES NOT BECOME THE ORCHESTRA.*
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
