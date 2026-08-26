# Packet 1 — Post-CONFIRMING Conversational Deployment SITREP

**Date:** 26 August 2026
**Author:** Ash (Chief Engineer)
**Status:** DEPLOYED — CANONICAL RUNTIME VERIFIED
**Authorisation:** Paul (Product Owner), 26 Aug 2026

---

## 1. Purpose

Deploy Packet 1 (Post-CONFIRMING Conversational flows) to the canonical GapMap MATE runtime, replacing the PHASE_OUT_OF_SCOPE dead-end identified as finding F5 in the SMUDGE 5 AAR.

This is the smallest supported deployment action: the code was already proven on the Copy app during acceptance testing (25 Aug 2026). The only remaining action was pointing the CLI at the canonical app and deploying.

---

## 2. Canonical Runtime Identification

The canonical GapMap MATE runtime is:

**App ID:** `6a75d6b58496a73bf2165dec`
**App Name:** GapMap MATE

### Evidence

| Evidence | Canonical (6a75d6b) | Copy (6a8c4a) |
|---|---|---|
| UserProfile records | 5 (real exercise data) | 0 (pre-testing) |
| ConversationState records | 3 (real exercise history) | 0 (pre-testing) |
| Media asset CDN URLs in built JS | 9 references | 0 references |
| config.jsonc project name | "GapMap MATE" | N/A (same file) |
| SMUDGE 5 exercise profiles | Present (CONFIRMED profile with transitioning state) | Absent |
| `.app.jsonc` (CLI target before fix) | ❌ (pointed to Copy) | ✅ |
| `.env.local` (local dev) | ❌ (pointed to Copy) | ✅ |

**Conclusion:** The canonical runtime is the original app (`6a75d6b58496a73bf2165dec`). The Copy app (`6a8c4ad20e9d85da314fe185`) is a staging/test environment that was inadvertently the CLI deployment target due to `.app.jsonc` pointing to it.

---

## 3. CLI Target Correction

### Before

```jsonc
// base44/.app.jsonc
{
  "id": "6a8c4ad20e9d85da314fe185"  // GapMap MATE Copy (staging)
}
```

### After

```jsonc
// base44/.app.jsonc
// CANONICAL TARGET: GapMap MATE (6a75d6b58496a73bf2165dec)
// Do NOT point this at the Copy app (6a8c4ad20e9d85da314fe185) — that is a
// staging/test environment only. Verify the target before every CLI deployment.
{
  "id": "6a75d6b58496a73bf2165dec"  // GapMap MATE (canonical)
}
```

**File location:** `gapmap-deploy/base44/.app.jsonc`

**Standing instruction for future deployments:** Before any CLI deploy, verify `.app.jsonc` contains `6a75d6b58496a73bf2165dec`. If it contains `6a8c4ad20e9d85da314fe185`, you are targeting the Copy (staging) — not the canonical runtime.

---

## 4. Deployment Action

| Step | Action | Result |
|---|---|---|
| 1 | Update `.app.jsonc` to canonical app ID | ✅ |
| 2 | Verify Packet 1 code in `entry.ts` (POST_CONFIRMING_CONVERSATIONAL present, PHASE_OUT_OF_SCOPE absent) | ✅ |
| 3 | Verify companionCore version `1.2.0` in local code | ✅ |
| 4 | `npx base44 functions deploy smudgeOrchestrator` | ✅ Deployed (20.2s) |

**CLI deploys:** 1
**Builder messages:** 0
**Integration calls:** 2 (smoke test)

---

## 5. Smoke Test — Canonical App

### Test Profile

| Field | Value |
|---|---|
| Profile ID | `6a8ca30fbb159e8cb9ee505c` |
| Pre-test state | EXPLORING, operational_picture_confirmed: true |
| Test state | CONFIRMED (set by update_entities) |
| Post-test state | EXPLORING (reverted to pre-test state) |

### Turn 1

**Input:** `"So what happens now then?"`
**Profile state:** CONFIRMED

| Check | Expected | Actual | Pass |
|---|---|---|---|
| orchestration_note | POST_CONFIRMING_CONVERSATIONAL | POST_CONFIRMING_CONVERSATIONAL | ✅ |
| tos_phase | CONFIRMED (unchanged) | CONFIRMED | ✅ |
| state_changed | false | false | ✅ |
| companion_core_version | 1.2.0 | 1.2.0 | ✅ |
| PHASE_OUT_OF_SCOPE | absent | absent | ✅ |
| companion_result | null (no engine) | null | ✅ |
| lifecycle_neutral | true | true | ✅ |
| candidate_discoveries_count | 0 | 0 | ✅ |
| generation.validation | PASSED | PASSED | ✅ |

**Response:** "Now that we have a solid picture of your background in infantry leadership and logistics, we can start looking at your specific capabilities in civilian terms. Are you ready to dive into what you're good at, or would you prefer to chat about something else first?"

**Assessment:** Conversational, natural, invites user to move forward. No static dead-end response. Smudge acknowledges confirmed understanding and pivots toward capability exploration — exactly the behaviour the SMUDGE 5 AAR F5 finding said was missing.

### Turn 2

**Input:** `"Yeah go on then, let's have a look at what I'm good at"`
**Profile state:** CONFIRMED (with recent_context from Turn 1)

| Check | Expected | Actual | Pass |
|---|---|---|---|
| orchestration_note | POST_CONFIRMING_CONVERSATIONAL | POST_CONFIRMING_CONVERSATIONAL | ✅ |
| tos_phase | CONFIRMED (unchanged) | CONFIRMED | ✅ |
| state_changed | false | false | ✅ |
| companion_core_version | 1.2.0 | 1.2.0 | ✅ |
| companion_result | null (no engine) | null | ✅ |
| lifecycle_neutral | true | true | ✅ |
| generation.validation | PASSED | PASSED | ✅ |

**Response:** "That's a great move to make, and I'm happy to help you start unpicking those skills. Given your time as an infantry section commander handling communications and logistics, what do you think is the one skill you used most that you actually enjoyed doing?"

**Assessment:** Continues conversational flow. References confirmed profile context (infantry, section commander, comms, logistics). Asks a grounded, specific question. No looping, no static response.

---

## 6. Verification Summary

| Verification | Result |
|---|---|
| POST_CONFIRMING_CONVERSATIONAL is live | ✅ PASS |
| PHASE_OUT_OF_SCOPE is no longer returned | ✅ PASS |
| companionCore remains v1.2.0 | ✅ PASS |
| No unintended lifecycle transition | ✅ PASS (tos_phase unchanged across both turns) |
| No unintended engine invocation | ✅ PASS (companion_result: null, lifecycle_neutral: true) |
| No new ConversationState records created | ✅ PASS (existing record updated, no new records) |
| Test profile reverted to pre-test state | ✅ PASS (EXPLORING, operational_picture_confirmed: true) |
| No Packet 2 changes introduced | ✅ PASS (smudgeOrchestrator only, no other functions touched) |

---

## 7. Artefact Cleanup

| Artefact | Action | Status |
|---|---|---|
| Test profile `6a8ca30fbb159e8cb9ee505c` | Reverted to EXPLORING | ✅ |
| ConversationState `6a8ca3132f67062d94de20e5` | Updated by orchestrator (expected, not a new artefact) | ✅ |
| New ConversationState records | None created | ✅ |
| New UserProfile records | None created | ✅ |

---

## 8. What This Resolves

**SMUDGE 5 AAR Finding F5 — CONFIRMED is a Conversational Dead End:** RESOLVED on canonical runtime.

Before: Any message sent while `tos_phase === 'CONFIRMED'` returned a static "I'm still learning how to help with this stage of your journey" response regardless of user input.

After: Smudge engages conversationally, acknowledges the confirmed understanding, and naturally invites the user toward capability exploration — without forcing lifecycle advancement or invoking downstream engines.

**SMUDGE 5 AAR Finding F3 — Confirmation Semantics Are Conflated:** NOT resolved by Packet 1. This is a separate contract issue (reflection accuracy confirmation ≠ readiness to advance). Packet 1 provides the conversational space for the user to remain in CONFIRMED without being forced forward, which partially mitigates F3's impact, but the underlying contract issue remains for future remediation.

---

## 9. Packet 2 Status

**HOLD.** No Packet 2 changes deployed. Packet 2 remains on hold per Paul's standing instruction, pending the MATE Lifecycle Boundary & Authority Audit and Design Intent.

---

## 10. Declaration

Packet 1 (Post-CONFIRMING Conversational flows) is deployed to the canonical GapMap MATE runtime (`6a75d6b58496a73bf2165dec`). The PHASE_OUT_OF_SCOPE dead-end is eliminated. Smudge now provides continuous conversational support through the CONFIRMED state.

The CLI deployment target has been corrected to prevent future accidental deployments to the Copy (staging) app.

**Mission complete. STOP.**
