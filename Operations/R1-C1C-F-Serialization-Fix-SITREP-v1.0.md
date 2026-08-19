# R1-C.1C-F SITREP — Serialization Adapter Fix (Re-verification after companionCore v1.1.0)

**Date:** 19 August 2026
**Author:** Ash (Chief Engineer)
**Status:** READY FOR REVIEW
**Baseline:** companionCore v1.1.0 (includes R1-C.1B-E2R lifecycle fix + R1-C.1C-F serialization fix)
**Commit:** a08354f (pushed to main)

---

## 1. Context

R1-C.1C was initiated to address a persistence regression discovered during R1-C.1B-E2: the Base44 SDK rejects numeric values for schema fields stored as strings (`user_confidence`, `years_served`). The `serializeForPersistence` function in companionCore did not coerce numbers to strings, causing SDK validation failures when engines or the orchestrator passed native numeric values.

This SITREP covers the fix deployment and full lifecycle re-verification to confirm the serialization fix did not regress the R1-C.1B-E2R lifecycle corrections.

---

## 2. The Fix

**File:** `functions/companionCore.ts`
**Function:** `serializeForPersistence`
**Change:** Added `STRING_PERSIST_FIELDS` set and conditional numeric-to-string coercion.

```typescript
const STRING_PERSIST_FIELDS = new Set(["user_confidence", "years_served"]);

export function serializeForPersistence(data: any): any {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (value !== null && value !== undefined && typeof value === "object") {
      result[key] = JSON.stringify(value);
    } else if (STRING_PERSIST_FIELDS.has(key) && typeof value === "number") {
      result[key] = String(value);
    }
  }
  return result;
}
```

**Scope:** Only `serializeForPersistence` was modified. No other companionCore logic, lifecycle guards, or engine code was touched. The builder was instructed to update only this function; verification confirms the R1-C.1B-E2R lifecycle corrections were preserved.

---

## 3. Test Matrix

### 3.1 Serialization-Specific Regressions

| ID | Test | Method | Result |
|----|------|--------|--------|
| R1 | numeric `user_confidence` persists as string | companionService: `user_confidence: 7` (number) → persisted as `"7"` (string) | ✅ PASS |
| R2 | numeric `years_served` persists correctly | companionService: `years_served: 5` (number) → persisted, SDK accepted | ✅ PASS |

### 3.2 Lifecycle Regressions (R1-C.1B-E2R re-verification)

| ID | Test | Method | Result |
|----|------|--------|--------|
| T1 | Incomplete discoveries → remains EXPLORING | companionService: partial discoveries (user_confidence only) → tos_phase stayed EXPLORING | ✅ PASS |
| T2 | Sufficient six-area understanding → CONFIRMING | companionService: all 6 areas with substance → tos_phase transitioned to CONFIRMING | ✅ PASS |
| T3 | `operational_picture_confirmed` remains false at CONFIRMING | T2 response: `operational_picture_confirmed: false` | ✅ PASS |
| T4 | EXPLORING-origin confirmation → CONFIRMING only, never CONFIRMED | companionService: `current_mode: EXPLORING`, `user_response_type: confirming`, all areas filled → tos_phase = CONFIRMING, confirmed = false | ✅ PASS |
| T5 | CONFIRMING + explicit confirmation → CONFIRMED | companionService: `current_mode: CONFIRMING`, `user_response_type: confirming` → tos_phase = CONFIRMED, confirmed = true, operational_picture_confirmed = true | ✅ PASS |
| T6 | companionService wrapper lifecycle (T1–T5) | All T1–T5 through companionService | ✅ PASS |
| T7 | smudgeOrchestrator wrapper lifecycle | smudgeOrchestrator end-to-end | ⚠️ DEFERRED — see §4 |
| T8 | Version parity — both wrappers on companionCore v1.1.0 | companionService response: `companion_core_version: "1.1.0"`; smudgeOrchestrator response: `companion_core_version: "1.1.0"` | ✅ PASS |
| T9 | Discovery/provenance tests from E2 remain green | smudgeOrchestrator (source_type classification) | ⚠️ DEFERRED — see §4 |
| T10 | Bodge read-only regression | read_entities: Bodge tos_phase = SETTLED, updated_date = 2026-07-21 (unchanged) | ✅ PASS |

### 3.3 Cleanup Verification

| ID | Test | Result |
|----|------|--------|
| C1 | All test profiles deleted from GapMap MATE app | ✅ PASS |
| C2 | testProfileHelper function not deployed (builder auto-cleaned) | ✅ PASS |
| C3 | companionCore.ts committed and pushed (a08354f) | ✅ PASS |

---

## 4. Deferred Tests — InvokeLLM Extraction Issue

Tests T7, T9, and serialization regressions R3–R5 (provenance, direct-statement acceptance, tentative rejection) require the smudgeOrchestrator's LLM extraction to produce candidate discoveries from user messages.

**Finding:** The InvokeLLM function in the smudgeOrchestrator is consistently returning 0 candidate discoveries, regardless of:
- Message content (tested with 3 different messages containing clear extractable information)
- Profile state (tested with both blank and populated profiles)

**Evidence:** All three orchestrator calls returned:
- `candidate_discoveries_count: 0`
- `orchestration_note: "NO_DISCOVERIES"` or `"CLARIFICATION_PATH"`
- `companion_core_version: "1.1.0"` (confirming orchestrator code is intact)

**Assessment:** This is a platform-level InvokeLLM behaviour issue, NOT a code regression from the serialization fix. The serialization fix only touches `serializeForPersistence` in companionCore, which executes during persistence — after the LLM extraction step. The orchestrator code, LLM prompt, and JSON schema are unchanged.

**Impact:** The lifecycle logic and serialization fix are fully verified through companionService (T1–T6, R1–R2). The deferred tests verify orchestrator-layer concerns (extraction quality, provenance gate, source_type classification) that are independent of the serialization fix.

**Recommendation:** Investigate InvokeLLM behaviour as a separate item. This does not block the serialization fix approval.

---

## 5. Critical Boundary — T4 Detail

T4 is the most important lifecycle test. It verifies that a confirmation signal originating from an EXPLORING-profile call cannot skip CONFIRMING and reach CONFIRMED in a single step.

**Input:**
- `current_mode: "EXPLORING"`
- `user_response_type: "confirming"`
- All 6 minUnderstanding areas filled with substance
- `user_confidence: 8` (number, tests serialization fix in same call)

**Output:**
- `tos_phase: "CONFIRMING"` (transitioned to CONFIRMING, NOT CONFIRMED)
- `confirmed: false`
- `operational_picture_confirmed: false`
- `user_confidence: "8"` (string — serialization fix working)
- `assessment_confidence: "MODERATE"` (68/100)

**Interpretation:** The companionCore lifecycle guard correctly enforces the two-step boundary:
1. EXPLORING → CONFIRMING (when all areas have substance)
2. CONFIRMING → CONFIRMED (only when profile.tos_phase === "CONFIRMING" AND user_response_type === "confirming")

An EXPLORING-origin confirmation reaches step 1 only. Step 2 is blocked because the profile was not in CONFIRMING at the start of the call.

---

## 6. Architectural Notes

- **companionCore v1.1.0** includes both the R1-C.1B-E2R lifecycle fix and the R1-C.1C-F serialization fix.
- **No other functions were modified.** engineUnderstanding, engineCapabilityIntelligence, engineDecisionReadiness, engineTransitionPartnership, profileBootstrap, and smudgeOrchestrator are unchanged.
- **The serialization adapter remains "stupid"** — it translates representation only, never decides progression. `serializeForPersistence` converts numbers to strings; it does not alter lifecycle state.
- **Persistence model:** COMPANION_CORE_NARROW_CALLBACK (confirmed in orchestrator _internal fields).

---

## 7. Summary

| Category | Status |
|----------|--------|
| Serialization fix (R1-C.1C-F) | ✅ DEPLOYED & VERIFIED |
| Lifecycle fix (R1-C.1B-E2R) preserved | ✅ VERIFIED |
| Critical boundary (T4) | ✅ PASS |
| Bodge untouched | ✅ VERIFIED |
| Test artefacts cleaned | ✅ VERIFIED |
| Committed to repo | ✅ a08354f |
| Orchestrator LLM extraction | ⚠️ PLATFORM ISSUE (separate item) |
| Deferred tests (T7, T9, R3–R5) | ⚠️ Blocked by LLM issue, not by serialization fix |

**Chief Engineer's verdict:** The serialization fix is sound, deployed, and verified. The lifecycle corrections from R1-C.1B-E2R survived the update. The deferred tests are blocked by a platform-level InvokeLLM issue that is architecturally independent of this fix.

---

*End of SITREP*
