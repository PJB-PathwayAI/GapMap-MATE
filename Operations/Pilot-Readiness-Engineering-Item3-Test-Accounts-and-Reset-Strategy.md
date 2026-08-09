# Pilot Readiness — Engineering Item 3: Test Accounts & Reset Strategy

**Operation:** PILOT READINESS  
**Item:** 3 — Test Accounts & Reset Strategy  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Define how test accounts are created, managed, and reset for the GapMap MATE pilot. Ensure that every pilot participant starts from a clean initial state, and that test data can be cleared between runs without affecting shared reference data.

---

## Test Profiles

### Bodge — Engineering Verification Profile

**Profile ID:** `6a5fc833a725b4f9c08c66c1`  
**Current State:** SETTLED (post-Exercise PRISM)  
**Purpose:** Engineering verification and end-to-end testing. This profile is the known-good test profile used throughout Operation BUILD. It contains a complete journey record including checkpoints from Exercise PRISM.

**Preservation Rule:** Bodge's profile is NOT to be reset. It serves as the engineering verification baseline. If a reset is needed for a new test run, create a separate test profile instead.

### SITREP Test Profile

**Profile ID:** `6a47f246e43280bdbcf7b20c`  
**Current State:** Understand (legacy phase)  
**Purpose:** Auxiliary test profile for ad-hoc verification.

### Exercise MIRROR — Paul Bateson

**Profile ID:** `6a4953e984107f04399a96e3`  
**Current State:** Understand (legacy phase)  
**Purpose:** Original Exercise MIRROR test profile. Historical reference.

---

## Pilot Participant Accounts

### Creation

Pilot participant accounts are created through the normal Base44 app sign-up flow. Each participant:

1. Receives an invite link or QR code to the GapMap MATE app
2. Signs up with their email address
3. Is authenticated as a Base44 app user
4. Gets a blank UserProfile on first interaction with Smudge (engines create the profile on first `get_state` call)

### Initial State

Every new pilot participant starts with:

| Field | Initial Value |
|-------|--------------|
| tos_phase | EXPLORING |
| operational_picture_confirmed | false |
| operational_picture_version | 0 |
| soak_period | { state: NOT_STARTED } |
| All array fields | [] (empty) |
| All string fields | "" (empty) |
| All numeric fields | null |
| safety_flags | [] (empty) |

### RLS Scoping

All MATE entities have Row-Level Security (RLS) enabled:
- Participants can only see and interact with their own UserProfile, TransitionJourney, and JourneyCheckpoint records
- Admin (service role) can access all records for operational support
- No participant can see another participant's data

---

## Reset Strategy

### Backend Function: `pilotAccountReset`

**File:** `functions/pilotAccountReset.ts`  
**Status:** ✅ Deployed  

**What it does:**
1. Deletes all JourneyCheckpoint records for the given profile
2. Deletes all TransitionJourney records for the given profile
3. Resets the UserProfile to initial state (EXPLORING, all fields cleared)
4. Returns a confirmation summary

**What it preserves:**
- The user's Base44 account (platform-level, not managed by MATE)
- OCIPathway records (shared reference data, not user-scoped)
- GapMapLead records (separate CRM entity)

**Invocation:**
```
POST /api/functions/pilotAccountReset
Body: { "profile_id": "<UserProfile ID>" }
```

Or by user_id:
```
POST /api/functions/pilotAccountReset
Body: { "user_id": "<Base44 User ID>" }
```

**Response:**
```json
{
  "status": 200,
  "message": "Account reset complete",
  "profile_id": "<id>",
  "checkpoints_deleted": <count>,
  "journeys_deleted": <count>,
  "profile_reset": true,
  "errors": []
}
```

### When to Reset

| Scenario | Action |
|----------|--------|
| Participant asks to restart | Reset via `pilotAccountReset` |
| Test run needs clean state | Reset via `pilotAccountReset` |
| Participant leaves pilot | Reset + data deletion (see Data Management, Item 5) |
| Engineering verification | Use Bodge profile (never reset) |

### Verification Limitation

The `test_backend_function` tool cannot verify this function because it does not pass authentication context required by `createClientFromRequest`. This is a platform limitation affecting all MATE backend functions. The function follows the same SDK pattern as the five verified engines and will be callable from within the app context during the pilot.

---

## Test Account Lifecycle

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Invite     │────▶│  Sign Up     │────▶│  First MATE  │────▶│  Pilot   │
│  Sent       │     │  (Base44)    │     │  Interaction │     │  Active  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                                                    │                  │
                                                    │                  │
                                              Profile created     ┌──▼───┐
                                              (EXPLORING)        │ Reset │
                                                                │ (if   │
                                                                │  req) │
                                                                └──┬───┘
                                                                   │
                                                           ┌───────▼────────┐
                                                           │  Pilot Exit     │
                                                           │  Reset + Delete  │
                                                           └────────────────┘
```

---

## Sign-off

This document defines the test account and reset strategy for the GapMap MATE pilot. The `pilotAccountReset` backend function is deployed and ready for operational use.

**Item 3 Status: ✅ COMPLETE**
