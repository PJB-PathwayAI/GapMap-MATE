# Packet R1-C.1A-V — Authenticated Profile Resolution Verification

**Operation:** PROOF — Human Test Readiness Gate R1  
**Packet:** R1-C.1A-V — Verification (inspection only, no modification)  
**Date:** 19 August 2026  
**Author:** Ash (Chief Engineer)  

---

## A. Request Contract

smudgeOrchestrator accepts the following fields in the request body:

| Field | Type | Required | Used In | Purpose |
|-------|------|----------|---------|---------|
| `user_message` | string | Yes | Both | User's raw message text |
| `conversation_context` | array | No | Both | Bounded recent messages (not yet consumed in R1-C.1A) |
| `_test_mode` | boolean | No | Test only | Bypasses authentication and RLS for verification |
| `test_profile_id` | string | No | Test only | Specifies a profile to read via service-role (bypasses RLS) |

In production mode (`_test_mode` is false or absent), the caller provides ONLY `user_message` and optionally `conversation_context`. No `profile_id` is accepted.

---

## B. Authentication Mechanism

```typescript
const base44 = createClientFromRequest(req);
```

Authentication is established through the standard Base44 pattern: `createClientFromRequest(req)` extracts the authenticated user's session/token from the HTTP request. This is the same pattern used by all GapMap MATE backend functions, profileBootstrap, and Dashboard.jsx.

The `base44` client carries the authenticated user's identity for all subsequent user-scoped operations.

---

## C. Canonical Profile Resolution Method

### Production Path (no `_test_mode`)

```typescript
const profiles = await base44.entities.UserProfile.list();
if (profiles.length > 0) {
  profile_id = profiles[0].id;
  profile = profiles[0];
} else {
  // Return NO_PROFILE error
}
```

- `base44.entities.UserProfile.list()` is **user-scoped** — RLS-protected
- Returns ONLY profiles created by the authenticated user
- The caller CANNOT influence which profile is returned
- This is the same pattern used by profileBootstrap and Dashboard.jsx

The orchestrator does NOT invoke profileBootstrap directly. It resolves the profile through the same RLS-protected `UserProfile.list()` call that profileBootstrap uses internally.

If no profile exists, the function returns a "NO_PROFILE" error. In production, this would trigger profileBootstrap to create one — but that is not implemented in R1-C.1A.

### Test Path (`_test_mode === true`)

```typescript
if (body._test_mode === true && body.test_profile_id) {
  profile = await base44.asServiceRole.entities.UserProfile.get(body.test_profile_id);
  profile_id = body.test_profile_id;
}
```

- `base44.asServiceRole.entities.UserProfile.get()` is **service-role** — bypasses RLS
- Reads ANY profile by ID, regardless of ownership
- The caller provides the `test_profile_id` and the function trusts it

---

## D. Arbitrary-Profile-ID Risk

**YES — in test mode only.**

| Path | Accepts arbitrary profile_id? | Bypasses RLS? | Risk |
|------|------------------------------|---------------|------|
| Production (`_test_mode` absent/false) | NO | NO | None — RLS-protected |
| Test (`_test_mode === true`) | YES | YES | Can read any profile by ID |

An authenticated caller who sends `_test_mode: true` with another user's `test_profile_id` can cause the orchestrator to read that profile via service-role access. The function does not verify that the `test_profile_id` belongs to the authenticated user.

This is a **FINDING** — not a production vulnerability in the current R1-C.1A scope (no engine calls, no mutation, no response generation), but it MUST be removed before:
- R1-C.1D (Chat.jsx wiring — production traffic)
- Any deployment where untrusted users can call the function

---

## E. Unauthenticated Behaviour

### Production Path (no `_test_mode`)

`createClientFromRequest(req)` creates a client with no user context. `base44.entities.UserProfile.list()` returns an empty list (no user-scoped profiles). The function returns:

```json
{
  "success": false,
  "error": "NO_PROFILE",
  "response_text": "I don't have your profile set up yet. Please visit your dashboard to get started, then come back and we can talk.",
  "tos_phase": null,
  "state_changed": false
}
```

**Safe — no profile data exposed, no state change.**

Could not directly test unauthenticated access (the test tool provides authentication), but the code path is unambiguous: `UserProfile.list()` with no user context returns empty → NO_PROFILE error.

### Test Path (`_test_mode === true`)

`base44.asServiceRole.entities.UserProfile.get(body.test_profile_id)` uses service-role, which does not require user authentication. An unauthenticated caller who knows a valid profile_id can read that profile's data.

**This is the test-mode bypass. Must be removed before production.**

---

## F. Ownership Boundary

### Production Path — Packet 1 Ownership Intact

```
authenticated user
  → createClientFromRequest(req) → base44 client (user-scoped)
  → base44.entities.UserProfile.list() → RLS-protected → user's own profiles only
  → profile_id (from user's own profiles)
  → tos_phase (from user's own profile)
```

The caller CANNOT:
- Specify which profile to read
- Read another user's profile
- Influence the profile selection

This satisfies the locked contract:

```
authenticated user
→ canonical authorised profile resolution
→ profile_id
→ current tos_phase
```

NOT:

```
Chat
→ arbitrary profile_id
→ orchestrator trusts it
```

### Test Path — Ownership Bypassed

```
any caller (authenticated or not)
  → _test_mode: true, test_profile_id: <any ID>
  → base44.asServiceRole.entities.UserProfile.get() → service-role → ANY profile
```

The test path bypasses RLS entirely. This is by design for R1-C.1A verification only.

---

## G. Superagent Staging Status

**smudgeOrchestrator IS still deployed to the Superagent app (6a06045ef3a8e951bd00d4e3).**

Verified by direct `test_backend_function` call — returned 200 with valid interpretation result.

This is a staging/development deployment, separate from the GapMap MATE production deployment. It reads the Superagent app's UserProfile entity (which has different data from the GapMap MATE app's UserProfile).

**Recommendation:** This deployment should be cleaned up (deleted) before or during R1-C.1D when Chat.jsx is wired to the production orchestrator. It served its purpose for R1-C.1A LLM interpretation testing. Not a product blocker, but recording for deployment cleanliness.

---

## H. Verdict

### R1-C.1A-V — PASS WITH FINDING

**The production path satisfies the locked contract.** Profile resolution is RLS-protected, authenticated, and does not accept arbitrary profile_id from the caller. Packet 1 ownership doctrine is intact in the production path.

**One finding:** The `_test_mode` bypass allows any caller to read any profile by ID via service-role. This is by design for R1-C.1A testing and is clearly marked as temporary. It MUST be removed before:
- R1-C.1D (Chat.jsx wiring — production traffic begins)
- Any deployment where untrusted users can call the function

**No fix is requested at this time** per the verification directive ("Do NOT fix it yet").

**Secondary finding:** Superagent staging deployment still exists. Should be cleaned up before R1-C.1D.

---

## Required Actions Before R1-C.1D

1. Remove `_test_mode` and `test_profile_id` from smudgeOrchestrator
2. Replace test-mode profile resolution with production-only path (or gate behind a platform-level admin secret, not a client-supplied flag)
3. Delete Superagent staging deployment
4. Verify GapMap MATE production deployment has no test mode

---

## Document Control

**Status:** R1-C.1A-V — PASS WITH FINDING  
**R1-C.1B:** Remains LOCKED  
**Authority:** Verification only. No modification authorised.  

---

*NO ADVANCEMENT WITHOUT EVIDENCE.*  
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
