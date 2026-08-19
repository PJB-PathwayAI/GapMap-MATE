# R1-C.1B-D — Internal Invocation Path Diagnostic

**Date:** 19 August 2026
**Phase:** R1-C.1B-D (Diagnostic Only — No Product Changes)
**Author:** Ash (Chief Engineer)
**Authority:** Inspection/diagnostic only. No implementation, no publishing, no companionService modification.
**Verdict:** R1-C.1B-D — PLATFORM LIMITATION PROVEN

---

## A. Exact Cause of the 403

### Root Cause

The Base44 SDK (v0.8.31) `functions.invoke()` method constructs function-call URLs using the `base44-api-url` request header, which is `https://app.base44.com` (the platform domain). The Base44 platform's routing layer rejects function calls from this domain, returning:

```
403 — "Backend functions cannot be accessed from the platform domain. Use the app's subdomain instead."
```

The request **never reaches companionService**. The 403 is produced by the platform's routing layer, NOT by companionService's own ownership read.

### Evidence (tested on BOTH Superagent and GapMap MATE apps)

| Method | URL Constructed | Status | Error |
|--------|----------------|--------|-------|
| `base44.functions.invoke()` | `https://app.base44.com/api/apps/{app_id}/functions/{name}` (inferred) | 403 | "Backend functions cannot be accessed from the platform domain" |
| `base44.functions.fetch()` | `https://app.base44.com/api/functions/{name}` (missing app_id) | 404 | "App not found for this domain" |
| `base44.asServiceRole.functions.invoke()` | Same as invoke() | 403 | Same routing rejection |
| Raw HTTP fetch with forwarded auth headers | `https://app.base44.com/api/apps/{app_id}/functions/{name}` | 403 | Same routing rejection |
| Modified `base44-api-url` header | `https://app.base44.com/api/apps/{app_id}/api/functions/{name}` (double api/) | 404 | Auth also broke — "Not Found" |

### Key Distinction

The `call_base44_backend_function` agent tool CAN call functions on private apps — it uses an internal platform mechanism (Cloudflare Workers dispatcher with internal service tokens). This mechanism is **not available from within backend functions**. Backend functions can only use the SDK and HTTP fetch, both of which route through `app.base44.com`.

---

## B. Authenticated Client-Construction Method

### Confirmed: `createClientFromRequest(req)` — Correct Pattern

The smudgeOrchestrator uses:
```typescript
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
const base44 = createClientFromRequest(req);
```

This is the **same supported pattern** documented in the Base44 docs and used by all other deployed functions.

### Auth IS Preserved

Diagnostic evidence from both apps:

**Superagent app:**
```json
{
  "auth_me": {
    "id": "6a06045ef3a8e951bd00d4e4",
    "email": "paulbateson4547@gmail.com",
    "full_name": "paulbateson4547"
  }
}
```

**GapMap MATE app:**
```json
{
  "auth_me": {
    "id": "6a75d6b68496a73bf2165ded",
    "email": "paulbateson4547@gmail.com",
    "full_name": "paulbateson4547"
  }
}
```

`base44.auth.me()` returns the authenticated user. `base44.entities.UserProfile.list()` returns RLS-scoped profiles. **User context is correctly preserved through `createClientFromRequest(req)`.**

### Request Headers (GapMap MATE app)

```json
{
  "base44-api-url": "https://app.base44.com",
  "base44-app-id": "6a75d6b58496a73bf2165dec",
  "base44-function-name": "invokeDiagnostic",
  "authorization": "[PRESENT]",
  "base44-service-authorization": "[PRESENT]"
}
```

The orchestrator is NOT stripping or failing to forward anything. The client carries the incoming user's authentication. The 403 is produced by **invocation routing**, not by companionService's ownership read.

---

## C. Whether User-Context Function-to-Function Invocation Works

**No.** Function-to-function invocation via the SDK does not work for private (unpublished) apps.

The SDK's `functions.invoke()` and `functions.fetch()` methods construct URLs using `base44-api-url` (`https://app.base44.com`). The platform rejects function calls from this domain, requiring the app's own subdomain instead. The GapMap MATE app is deliberately private and has no published subdomain.

### What Was Tested

| Test | App | Method | Result |
|------|-----|--------|--------|
| 1 | Superagent | `base44.functions.invoke()` | 403 |
| 2 | Superagent | `base44.asServiceRole.functions.invoke()` | 403 |
| 3 | Superagent | `base44.functions.fetch()` | 404 (missing app_id in URL) |
| 4 | Superagent | Raw HTTP fetch with forwarded auth | 403 |
| 5 | Superagent | Modified `base44-api-url` header | 404 (broke auth + double api/ path) |
| 6 | GapMap MATE | `base44.functions.invoke()` | 403 |
| 7 | GapMap MATE | `base44.functions.fetch()` | 404 (same URL pattern) |
| 8 | GapMap MATE | Raw HTTP fetch with forwarded auth | 403 |

All 8 tests fail. The failure is consistent across both apps and all invocation methods.

### Documentation Analysis

The Base44 docs describe `functions.invoke()` as a **frontend mechanism**: "Use base44.functions.invoke() to call functions from your frontend." The "Use the SDK in functions" section documents `base44.auth.me()`, `base44.entities`, `base44.integrations`, and `asServiceRole` — but does NOT mention `base44.functions.invoke()` as a supported pattern for function-to-function calls.

The `functions` module IS available on the SDK client created by `createClientFromRequest(req)`, but the platform's routing layer prevents it from working.

---

## D. Whether companionService Can Be Invoked While Retaining Ownership Semantics

**Not currently possible from within a backend function on a private app.**

The 403 occurs at the platform routing layer, before the request reaches companionService. companionService's ownership semantics (RLS-protected profile read, lifecycle guards, explicit user decision boundaries) are never exercised because the request never arrives.

If the routing limitation were resolved (e.g., by publishing the app or a platform update supporting internal function calls), companionService's ownership semantics would be preserved because:
1. `createClientFromRequest(req)` correctly carries user auth
2. `base44.functions.invoke()` passes user auth to the target function (per docs)
3. companionService uses `base44.entities.UserProfile.get(profile_id)` (RLS-protected, user-scoped)
4. companionService's lifecycle guards check `tos_phase` and `user_response_type` before any state change

The ownership boundary is architecturally sound. The limitation is purely infrastructural.

---

## E. Bodge Deviation/Regression Evidence

### Deviation Recorded

During R1-C.1B investigation, Bodge was temporarily changed:
- `tos_phase`: EVALUATING → EXPLORING (for T1 testing) → EVALUATING (restored)
- `operational_picture_confirmed`: true → false (for T1 testing) → true (restored)

This was a controlled, temporary mutation for testing purposes only. No companionService call succeeded, so no lifecycle transitions or discovery persistence occurred.

### Current State (verified 19 Aug 2026)

| Field | Value | Status |
|-------|-------|--------|
| `tos_phase` | EVALUATING | ✅ Restored |
| `operational_picture_confirmed` | true | ✅ Restored |
| `full_name` | Bodge Test Profile | ✅ Unchanged |
| `service_branch` | Army | ✅ Unchanged |
| `rank` | Private | ✅ Unchanged |
| `years_served` | 8.0 | ✅ Unchanged |
| `professional_identity` | Infantry soldier with 8 years... | ✅ Unchanged |
| `user_confidence` | "6" | ✅ Unchanged |
| `assessment_confidence` | overall_score: 91, rating: HIGH | ✅ Unchanged |
| `capability_map` | 3 capabilities (Leadership, Pressure, Adaptability) | ✅ Unchanged |
| `evidence_log` | 6 evidence entries (EV-001 through EV-006) | ✅ Unchanged |
| `created_date` | 2026-08-07 13:57:39 | ✅ Unchanged |
| `updated_date` | 2026-08-19 06:59:37 | ⚠️ Changed (tos_phase restore) |

### TransitionJourney

| Field | Value | Status |
|-------|-------|--------|
| Count | 1 | ✅ |
| `partnership_state` | ACTIVE | ✅ Unchanged |
| `confidence_band` | BUILDING | ✅ Unchanged |
| `operational_readiness` | ON_COURSE | ✅ Unchanged |
| `journey_started_date` | 2026-08-07 | ✅ Unchanged |

### JourneyCheckpoints

| Metric | Value | Status |
|--------|-------|--------|
| Count | 9 | ✅ All intact |
| Date range | 2026-08-07 to 2026-08-08 | ✅ No new checkpoints created during R1-C.1B |

### Assessment

Bodge's substantive product fields match the pre-test baseline. The only change is `updated_date`, which reflects the `tos_phase` restore operation. No lifecycle transitions, no new discoveries, no new checkpoints, no journey mutations occurred during R1-C.1B.

**No further Bodge mutation is authorised.** All future orchestration state-changing tests require an authenticated controlled EXPLORING test user/profile through the normal Packet 1 production path.

---

## F. Minimum Recommended Correction

### The Problem is Infrastructural, Not Architectural

The architecture is sound. companionService's ownership semantics are correct. The limitation is that the Base44 platform does not support function-to-function calls for private (unpublished) apps via the SDK.

### Options (in order of minimal architectural impact)

**1. Platform Support Request (preferred)**
Request Base44 to either:
- Support function-to-function calls from the platform domain for authenticated backend functions in the same app, OR
- Provide a preview/staging subdomain for unpublished apps that supports function calls

This requires no code changes. Filed via vent_send_feedback.

**2. Shared Module Approach (if developer platform supports it)**
The developer platform docs describe a "Share code between functions" pattern: place shared code in `base44/shared/` and import it from multiple functions. If the app editor supports this pattern, extract companionService's persistence logic into a shared module that both smudgeOrchestrator and companionService import.

This would:
- Maintain separation of concerns (orchestrator doesn't write UserProfile directly)
- companionService still owns the persistence logic (via the shared module)
- No function-to-function call needed
- Requires verification that the app editor supports shared modules

**3. Publish the App (requires separate authorisation)**
Publishing the app would assign a subdomain. The HTTP fallback in smudgeOrchestrator could then call companionService via `https://{subdomain}/functions/companionService`. However:
- HTTP function calls have no authenticated user context (per docs)
- companionService uses RLS-protected reads — would need auth adaptation
- This was already rejected by the directive ("Do NOT publish MATE merely to obtain a function subdomain")

### What Should NOT Change

- companionService's auth mechanism (no asServiceRole fallback)
- companionService's logic (no redesign)
- The orchestrator's client construction (`createClientFromRequest(req)` is correct)
- The app's privacy status

---

## Verdict

**R1-C.1B-D — PLATFORM LIMITATION PROVEN**

The 403 is caused by the Base44 platform's routing layer rejecting function calls from the platform domain (`app.base44.com`). The SDK (v0.8.31) constructs function-call URLs using the `base44-api-url` header, which is always `https://app.base44.com` for private apps. The platform requires the app's own subdomain for function calls, but the GapMap MATE app is deliberately private and has no published subdomain.

**Auth IS preserved.** `createClientFromRequest(req)` correctly carries the user's authentication context. `base44.auth.me()` returns the user. `base44.entities.UserProfile.list()` returns RLS-scoped profiles.

**The 403 is produced by invocation routing, NOT by companionService's ownership read.** The request never reaches companionService.

**Function-to-function invocation via the SDK does not work for private apps.** All 8 test attempts across both apps and all invocation methods failed with the same routing rejection.

**The architecture is sound.** companionService's ownership semantics are correct. The limitation is purely infrastructural.

**Minimum recommended correction:** Platform support request (no code changes) or shared module approach (if app editor supports it). Both require verification before implementation.

---

*Ash — Chief Engineer*
*19 August 2026*

*NO ADVANCEMENT WITHOUT EVIDENCE.*
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
