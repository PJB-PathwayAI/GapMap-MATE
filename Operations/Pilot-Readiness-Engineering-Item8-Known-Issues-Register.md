# Pilot Readiness — Engineering Item 8: Known Issues Register

**Operation:** PILOT READINESS  
**Item:** 8 — Known Issues Register  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Consolidate all known technical debt, inconsistencies, and limitations from Operation BUILD into a single living register. This provides visibility for the pilot and ensures nothing is hidden. Each issue is documented with its impact, workaround, and disposition.

---

## Issue Register

### ENG-001: Duplicated Assessment/Confidence Logic

**Severity:** Low (code quality, no behavioural impact)  
**Location:** `engineUnderstanding.ts` and `companionService.ts`  
**Description:** Assessment confidence calculation logic is duplicated between the Understanding Engine and the Companion Service. Both implement `calculateAssessmentConfidence` independently.  
**Impact:** Risk of divergence if one is updated without the other. No current behavioural mismatch — both produce identical results for the same input.  
**Workaround:** None needed. Both implementations produce the same output.  
**Disposition:** Post-pilot refactor. Consolidate into a shared assessment module. Do not touch during pilot — no behavioural drift.  

### ENG-002: confidence_scores Field Naming Inconsistency

**Severity:** Low (cosmetic, no functional impact)  
**Location:** UserProfile entity, confidence_scores field  
**Description:** The `confidence_scores` array uses `evidence_ref` (singular) in some engine writes and `evidence_refs` (plural) in others. Both fields are accepted by the schema (which allows any object structure) but the inconsistency could cause confusion during data inspection.  
**Impact:** No functional impact — both fields are read by string key lookup. Could cause confusion when manually inspecting data during pilot support.  
**Workaround:** When inspecting confidence_scores, check for both `evidence_ref` and `evidence_refs` keys.  
**Disposition:** Post-pilot standardisation. Pick one naming convention and update all engine writes.  

### ENG-003: tos_phase Casing Mismatch

**Severity:** Medium (requires serialization adapter)  
**Location:** All engines, UserProfile entity  
**Description:** Engine code uses lowercase lifecycle terms (e.g., `Discover`, `Understand`) while the UserProfile entity schema uses uppercase enum values (e.g., `EXPLORING`, `CONFIRMING`). The serialization adapter translates between these representations at the integration boundary.  
**Impact:** Without the adapter, phase transitions fail. The adapter is deployed and working. Manual `tos_phase` updates during testing must use the uppercase enum values.  
**Workaround:** Always use uppercase enum values when updating `tos_phase` directly. The serialization adapter handles the translation for engine writes.  
**Disposition:** Resolve at the integration boundary before pilot. The adapter pattern is the correct solution — engines use proven terminology, adapter translates to entity schema.  

### ENG-004: Heuristic Character-Count Substance Checks

**Severity:** Low (acceptable proxy for MVP)  
**Location:** All engines, `hasSubstance()` function  
**Description:** The substance threshold uses a 15-character minimum to determine whether an input is "meaningful." This is a heuristic proxy — it doesn't assess quality, relevance, or accuracy of the content.  
**Impact:** A user could enter 15+ characters of nonsense and it would be treated as substantive. Conversely, a meaningful but short response (e.g., "Yes") would be treated as insubstantial.  
**Workaround:** Smudge's conversational layer is the quality filter. The 15-character threshold is a floor, not a ceiling. Smudge should not treat "substantive" as "meaningful" — it should use its own judgment.  
**Disposition:** Acceptable for pilot. Smudge's conversational judgment compensates. Post-pilot, consider semantic substance assessment.  

### ENG-005: assessment_confidence Type Inconsistency

**Severity:** Low (serialization handles it)  
**Location:** UserProfile entity, assessment_confidence field  
**Description:** The `assessment_confidence` field is defined as `number` in the schema but is written as an object `{ overall_score, rating, areas }` by the Understanding Engine. The serialization adapter handles the type coercion.  
**Impact:** No functional impact — the adapter serialises the object as a JSON string for persistence and deserialises it on read. But the schema says `number`, which is incorrect.  
**Workaround:** None needed. The adapter handles it.  
**Disposition:** Post-pilot schema update. Change `assessment_confidence` type to `object` in the entity schema.  

### ENG-006: goals and operational_context Type Inconsistency

**Severity:** Low (serialization handles it)  
**Location:** UserProfile entity, goals and operational_context fields  
**Description:** `goals` is defined as `string` in the schema but is written as an array `[]` by engines. `operational_context` has the same issue. The serialization adapter handles the type coercion.  
**Impact:** No functional impact — the adapter serialises the array as a JSON string and deserialises it on read.  
**Workaround:** None needed. The adapter handles it.  
**Disposition:** Post-pilot schema update. Change `goals` and `operational_context` types to `array`.  

### ENG-007: No Automated Regression Test Suite

**Severity:** Medium (manual verification required)  
**Location:** Project-wide  
**Description:** There is no automated regression test suite for the engines. Verification is done manually through the `test_backend_function` tool (which has auth context limitations) or through the app context.  
**Impact:** Code changes require manual re-verification of the full MATE Journey. No way to catch regressions automatically.  
**Workaround:** Manual E2E verification using the Bodge test profile before and after any changes. The deployment checklist (Item 7) defines the verification steps.  
**Disposition:** Post-pilot. Build an automated test suite that runs against deployed functions with proper auth context.  

### ENG-008: test_backend_function Auth Context Limitation

**Severity:** Low (platform limitation)  
**Location:** All backend functions  
**Description:** The `test_backend_function` tool does not pass authentication context required by `createClientFromRequest`. All MATE backend functions fail when tested through this tool.  
**Impact:** Cannot verify functions outside of the app context. All verification must be done from within the app.  
**Workaround:** Verify functions from within the app context (through Smudge interactions or app-level API calls).  
**Disposition:** Platform limitation. Document and accept. In-app verification remains the evidence source.  

### ENG-009: No Smudge-Facing Deployment

**Severity:** N/A (by design — this is the Experience workstream's job)  
**Location:** GapMap MATE Base44 app  
**Description:** The engines and entities are deployed, but there is no user-facing Smudge interface yet. The Base44 app exists (ID: `6a75d6b58496a73bf2165dec`) but does not have the Smudge conversational UI.  
**Impact:** The MVP Core is complete but not accessible to end users without the UI. This is expected — the Experience workstream (Paul & Cipher) will build Smudge's home.  
**Workaround:** None needed. This is the next phase.  
**Disposition:** Experience workstream deliverable. Not an engineering issue.  

### ENG-010: matching_capabilities Cosmetic Field Alignment

**Severity:** Low (cosmetic)  
**Location:** `engineDecisionReadiness.ts`, recommended_pathways.matching_capabilities  
**Description:** The `matching_capabilities` field in the pathway evaluation returns empty strings in some cases due to a field name mismatch between what `capability_map` stores (`skill` field) and what the pathway matching logic reads.  
**Impact:** Pathway recommendations still work (alignment ratio is calculated correctly), but the `matching_capabilities` display field may show empty strings instead of the matched capability names.  
**Workaround:** The alignment ratio and confidence level are correct. The `matching_capabilities` field is for display only.  
**Disposition:** Pre-pilot fix. Align the field name in the pathway matching logic to read `skill` from capability_map entries.  

---

## Summary

| ID | Issue | Severity | Disposition |
|----|-------|----------|-------------|
| ENG-001 | Duplicated assessment logic | Low | Post-pilot refactor |
| ENG-002 | confidence_scores naming | Low | Post-pilot standardisation |
| ENG-003 | tos_phase casing mismatch | Medium | Adapter resolves (pre-pilot) |
| ENG-004 | Heuristic substance checks | Low | Acceptable for pilot |
| ENG-005 | assessment_confidence type | Low | Post-pilot schema update |
| ENG-006 | goals/operational_context type | Low | Post-pilot schema update |
| ENG-007 | No regression test suite | Medium | Post-pilot |
| ENG-008 | test_backend_function auth | Low | Platform limitation, documented |
| ENG-009 | No Smudge-facing deployment | N/A | Experience workstream |
| ENG-010 | matching_capabilities cosmetic | Low | Pre-pilot fix |

**Issues requiring pre-pilot action:** ENG-003 (adapter — already resolved), ENG-010 (cosmetic fix)  
**Issues acceptable for pilot:** ENG-001, ENG-002, ENG-004, ENG-005, ENG-006, ENG-007, ENG-008  
**Not engineering issues:** ENG-009  

---

## Sign-off

This register consolidates all known technical debt and inconsistencies from Operation BUILD. Ten issues documented. Two require pre-pilot action (one already resolved via adapter). The remainder are acceptable for pilot with documented workarounds.

**Item 8 Status: ✅ COMPLETE**
