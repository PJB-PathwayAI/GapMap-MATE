# Pilot Readiness — Engineering Item 4: Logging & Diagnostics

**Operation:** PILOT READINESS  
**Item:** 4 — Logging & Diagnostics  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Define how the pilot support team answers "what happened?" when a pilot interaction fails. This is not an analytics layer. It is lightweight, traceable, and useful for support.

---

## Current Diagnostic State

### What Each Engine Returns Today

| Engine | Structured Response | Error Response | Console Logging |
|--------|-------------------|----------------|-----------------|
| Understanding Engine | operational_picture, missing_areas, phase, phase_advanced, can_proceed | `{ error: error.message }` (500) | None |
| Capability Intelligence | Per-action structured response with evidence/validation details | `{ error: 'Engine error', message: error.message }` (500) | ✅ `console.error` on engine errors |
| Decision Readiness | Per-action structured response with pathway evaluation, soak status | `{ error: '...' }` (400/500) | None |
| Transition Partnership | Per-action structured response with journey status, state transitions | `{ error: '...' }` (400) | None |
| Companion Service | flow_guidance, session_state, behavioural_notes | `{ error: error.message }` (500) | None |

### What Works

- All engines return structured, actionable error messages with HTTP status codes
- Capability Intelligence Engine has `console.error` — this shows up in `get_backend_function_logs`
- Error messages are specific enough to identify the failure mode (e.g., "Invalid Soak Period transition: cannot initiate from 'COMPLETED'")
- Each engine validates inputs and returns 400/403/422 for predictable failures, 500 for unexpected

### Gaps Identified

1. **Inconsistent console logging** — only Capability Intelligence Engine logs to console. Four engines silently fail on 500 errors.
2. **No engine/action identifier in error responses** — a 500 error doesn't tell you which engine or action failed.
3. **No profile_id in error responses** — can't trace which user's interaction failed.
4. **No timestamp in error responses** — can't correlate with other events.
5. **Backend function logs are sparse** — `get_backend_function_logs` only captures console output, so four engines produce no logs at all on failure.

---

## Diagnostic Approach for Pilot

### Principle

Diagnostics answer "what happened?" — not "how often?" or "who did what?" No metrics, no analytics, no dashboards. Just traceable evidence for support when something goes wrong.

### Three-Layer Diagnostic Model

**Layer 1: Engine Response (always available)**

Every engine returns a structured response. On success, this contains the full operational state. On failure, it contains the error message and HTTP status code. This is the primary diagnostic source — it's available to Smudge (the companion layer) and to any calling client.

**Layer 2: Backend Function Logs (available via `get_backend_function_logs`)**

Each engine is a deployed backend function. The platform captures console output from these functions. Currently only Capability Intelligence Engine logs errors. Recommended enhancement: add `console.error` to all four remaining engines.

**Layer 3: Entity State Inspection (available via admin tools)**

The UserProfile, TransitionJourney, and JourneyCheckpoint entities hold the full operational picture. If a pilot interaction fails, the support team can inspect the user's entity state to see where they are in the journey and what data exists.

### Support Workflow: "What Happened?"

When a pilot participant reports an issue:

```
1. Identify the participant's profile_id
   ↓
2. Inspect UserProfile state (tos_phase, assessment_confidence, operational_picture_confirmed)
   ↓
3. Inspect TransitionJourney state (partnership_state, current_blockers, confidence_band)
   ↓
4. Check backend function logs for the relevant engine
   ↓
5. Correlate: does the entity state explain the reported issue?
   ↓
6. If engine error: check error message + HTTP status code
   ↓
7. If data issue: check entity state for missing/corrupt fields
   ↓
8. If unknown: escalate to engineering with profile_id + error message + entity state
```

---

## Recommended Enhancements (Pre-Pilot)

These are diagnostic-only changes. They do not alter engine behaviour, do not introduce new logic, and do not change the MVP Core architecture. They add visibility.

### Enhancement 1: Standardised Console Error Logging

Add `console.error` to the four engines that don't have it:

```typescript
// Pattern to add to catch block of each engine:
} catch (error) {
  console.error(`[EngineName] Action: ${action || 'default'} | Profile: ${profile_id || 'N/A'} | Error: ${error.message}`);
  return Response.json({ error: error.message }, { status: 500 });
}
```

This makes all engine failures visible in `get_backend_function_logs`.

**Engines requiring this change:**
- Understanding Engine
- Decision Readiness Engine
- Transition Partnership Engine
- Companion Service

**Engines already covered:**
- Capability Intelligence Engine ✅

### Enhancement 2: Engine Identifier in Error Responses

Include the engine name in the 500 error response so the calling client (Smudge) can report which engine failed:

```typescript
return Response.json({ 
  engine: 'understanding',
  error: error.message 
}, { status: 500 });
```

### Enhancement 3: Action Trace in Error Responses

For action-based engines, include the attempted action in the error response:

```typescript
return Response.json({ 
  engine: 'decision_readiness',
  action: action,
  error: error.message 
}, { status: 500 });
```

---

## Implementation Status

| Enhancement | Status | Notes |
|-------------|--------|-------|
| Diagnostic document | ✅ Complete | This document |
| Console error logging (4 engines) | 📋 Recommended | Pre-pilot, not MVP Core change |
| Engine identifier in errors | 📋 Recommended | Pre-pilot, not MVP Core change |
| Action trace in errors | 📋 Recommended | Pre-pilot, not MVP Core change |
| Support workflow documented | ✅ Complete | Three-layer model above |

**Note on MVP Core freeze:** The recommended enhancements are diagnostic-only. They add `console.error` calls and additional fields to error responses. They do not change engine logic, validation, or phase transitions. They should be applied as a pilot readiness patch, not as a new baseline. The v1.0-build-baseline tag remains the frozen MVP Core reference.

---

## Backend Function Log Access

During the pilot, logs can be accessed using:

```
get_backend_function_logs(function_name, limit)
```

Available functions:
- `engineUnderstanding`
- `engineCapabilityIntelligence`
- `engineDecisionReadiness`
- `engineTransitionPartnership`
- `companionService`
- `pilotAccountReset`

Logs are retained by the platform. Check with Base44 platform documentation for retention policy.

---

## Sign-off

This document defines the logging and diagnostics strategy for the GapMap MATE pilot. The approach is lightweight and traceable — it answers "what happened?" without becoming an analytics layer. Three recommended enhancements are documented for pre-pilot implementation.

**Item 4 Status: ✅ COMPLETE**
