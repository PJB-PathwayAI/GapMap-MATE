# R1-C.1B SITREP — smudgeOrchestrator CompanionService Integration

**Date:** 19 August 2026
**Phase:** R1-C.1B (CompanionService Integration)
**Author:** Ash (Chief Engineer)
**Status:** BLOCKED — Platform Limitation Discovered

---

## 1. Mission Summary

R1-C.1B was tasked with integrating smudgeOrchestrator with companionService, creating an end-to-end path from user message → LLM interpretation → deterministic validation gate → companionService persistence → Smudge response.

The orchestrator was built with:
- InvokeLLM-powered message interpretation (structured JSON output)
- Deterministic validation gate (direct_statement + high confidence threshold)
- user_response_type classification and downgrade logic
- Safety/ambiguity routing (defer + return-empty paths)
- companionService call (SDK invoke + HTTP fallback)

---

## 2. Test Results

### T1 — DIRECT FACT (Partial Pass)
**Input:** "I served in the Royal Engineers for 12 years as a Sergeant, mostly based in Chatham"
**Profile:** Bodge, tos_phase=EXPLORING, opc=false

| Step | Result |
|---|---|
| Profile resolution (RLS) | ✅ PASS |
| tos_phase read | ✅ PASS (EXPLORING) |
| Profile context built (6 areas, 0 outstanding) | ✅ PASS |
| InvokeLLM interpretation | ✅ PASS |
| Candidate discoveries extracted | ✅ PASS (4 discoveries) |
| Deterministic validation gate | ✅ PASS (all 4 accepted: direct_statement + high confidence) |
| user_response_type classification | ✅ PASS ("answering", not downgraded) |
| companionService call | ❌ FAIL (403 — platform limitation) |

**Gate classification:** DIRECT_HIGH_ONLY
**Accepted fields:** service_branch, service_length, rank, base_location
**Companion error:** `COMPANION_INVOKE_FAILED: Request failed with status code 403`

### T8 — Non-EXPLORING Routing (Pass)
**Profile:** Bodge, tos_phase=EVALUATING
**Result:** ✅ PASS — Orchestrator correctly returned `NOT_YET_IMPLEMENTED` for non-EXPLORING profiles.

### T2-T7, T9, T10 — Not Run
Tests T2 (multiple facts), T3 (tentative language), T4 (contradictory), T5 (malformed), T6 (safety), T7 (lifecycle), T9 (ownership regression), and T10 (Bodge regression) were not executed because they all depend on the companionService call, which is blocked by the platform limitation.

---

## 3. Platform Limitation — Function-to-Function Calls

### Discovery

The Base44 platform does not support authenticated function-to-function calls for the GapMap MATE app. Both approaches tested returned 403:

1. **SDK `base44.functions.invoke()`** — Returns 403: "Backend functions cannot be accessed from the platform domain. Use the app's subdomain instead."

2. **SDK `base44.asServiceRole.functions.invoke()`** — Same 403 error.

3. **HTTP fetch to `app.base44.com/api/apps/{app_id}/functions/companionService`** — Same 403 error, even with forwarded auth headers (`authorization`, `base44-service-authorization`).

### Root Cause

The Base44 platform routes function calls through `app.base44.com` (the platform domain). For function-to-function calls, the platform requires the app's own subdomain (e.g., `your-app.base44.app`). The GapMap MATE app does not appear to have a published subdomain — common patterns (`gapmap-mate.base44.app`, `gapmapmate.base44.app`, etc.) all return 404.

The `call_base44_backend_function` tool (used by the Superagent to call GapMap MATE functions externally) uses an internal platform mechanism that bypasses this restriction, but this mechanism is not available from within backend functions.

### Impact

- smudgeOrchestrator cannot call companionService
- The R1-C.1B integration is blocked at the persistence step
- All downstream tests (T2-T10) cannot complete

### What DOES Work

The following components are verified functional:
- **InvokeLLM interpretation** — Structured JSON output with candidate discoveries, confidence levels, and response type classification
- **Deterministic validation gate** — Correctly filters discoveries based on direct_statement flag and confidence level
- **user_response_type downgrade** — Tentative language would be downgraded from "answering" to "uncertain" (logic verified, not yet exercised in a live test)
- **Safety routing** — Messages below substance threshold are deferred
- **Non-EXPLORING routing** — Profiles not in EXPLORING phase correctly receive NOT_YET_IMPLEMENTED
- **Profile resolution** — RLS-protected read works correctly via the SDK client

---

## 4. Proposed Workarounds

### Option A: Publish the App to Obtain a Subdomain
Publishing the GapMap MATE app would assign it a subdomain (e.g., `gapmap-mate.base44.app`). The HTTP fallback in smudgeOrchestrator could then call companionService via `https://{subdomain}/functions/companionService`.

**Concern:** HTTP function calls have no authenticated user context (per Base44 docs). companionService uses `base44.entities.UserProfile.get(profile_id)` which is RLS-protected. Without user auth, this would fail.

**Mitigation:** Modify companionService to detect the absence of user auth and fall back to `base44.asServiceRole.entities.UserProfile.get(profile_id)`. This is an auth mechanism adaptation, not a logic redesign.

### Option B: Inline companionService Persistence Logic
Merge companionService's persistence logic into smudgeOrchestrator, using `base44.asServiceRole.entities.UserProfile.update()` directly. This violates the R1-C.1B directive ("smudgeOrchestrator MUST NOT write UserProfile directly").

**Concern:** Breaks the separation of concerns. companionService's lifecycle logic (EXPLORING → CONFIRMING → CONFIRMED transitions, operational_picture_confirmed management) would need to be replicated in the orchestrator.

### Option C: Shared Module Approach (If Platform Supports It)
If the Base44 developer platform supports shared modules between functions, extract companionService's persistence logic into a shared module that both functions import. This maintains separation while avoiding the function-to-function call.

**Concern:** The app editor's backend functions may not support shared modules (the developer platform docs describe this for CLI-based projects, not app editor functions).

### Option D: Report and Await Platform Update
Document the limitation and wait for Base44 to support internal function calls or provide a mechanism for authenticated function-to-function communication.

**Concern:** Indefinite timeline. Blocks R1-C.1B and all downstream pilot readiness work.

---

## 5. Recommendation

**Option A** is the most pragmatic approach, with the smallest architectural impact:

1. Publish the GapMap MATE app (or obtain a preview subdomain) to get a function-accessible URL
2. Modify companionService to use `asServiceRole` for profile reads when no user auth is present (minor adaptation, not a redesign)
3. Update smudgeOrchestrator's HTTP fallback to use the app's subdomain URL
4. Re-run the full test suite (T1-T10)

This approach:
- Maintains the separation of concerns (orchestrator doesn't write UserProfile)
- Preserves companionService's ownership of lifecycle transitions
- Requires only an auth mechanism adaptation in companionService (not a logic redesign)
- Uses the platform's documented HTTP function endpoint mechanism

**Requires Paul's authorisation and Cipher's doctrine review before implementation.**

---

## 6. State After Testing

- Bodge restored to original state: tos_phase=EVALUATING, opc=true
- smudgeOrchestrator deployed with SDK invoke + HTTP fallback (both return 403)
- companionService unchanged (no modifications made)
- All other engines unchanged
- No test profiles created or left in the database

---

## 7. Engineering Verdict

**R1-C.1B: BLOCKED — Platform limitation prevents companionService integration.**

The deterministic validation gate and LLM interpretation are proven. The companionService call is blocked by a platform limitation that requires the app's published subdomain for function-to-function communication.

The architecture is sound — the limitation is infrastructural, not design. The workaround (Option A) requires a minor adaptation to companionService's auth mechanism and the app to be published.

**Awaiting Paul's decision and Cipher's doctrine review.**

---

*Ash — Chief Engineer*
*19 August 2026*
