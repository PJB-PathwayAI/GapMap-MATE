# Pilot Readiness — Engineering Item 7: Deployment Checklist

**Operation:** PILOT READINESS  
**Item:** 7 — Deployment Checklist  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Define the pre-deployment, deployment, and post-deployment verification steps for placing the GapMap MATE MVP in front of pilot participants. This is the operational checklist that ensures the system is ready before the first real user interacts with Smudge.

---

## Pre-Deployment Checks

### Entity Verification

| Check | Method | Expected Result |
|-------|--------|-----------------|
| UserProfile entity exists | `manage_entity_schemas(action="list")` | UserProfile present with v1.1 schema |
| OCIPathway entity exists | `manage_entity_schemas(action="list")` | OCIPathway present with 8+ seeded pathways |
| TransitionJourney entity exists | `manage_entity_schemas(action="list")` | TransitionJourney present |
| JourneyCheckpoint entity exists | `manage_entity_schemas(action="list")` | JourneyCheckpoint present |
| RLS enabled on all user-scoped entities | Entity schema inspection | RLS = true on UserProfile, TransitionJourney, JourneyCheckpoint |

### Engine Verification

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Understanding Engine deployed | `get_backend_function_logs("engineUnderstanding")` | Function responds |
| Capability Intelligence Engine deployed | `get_backend_function_logs("engineCapabilityIntelligence")` | Function responds |
| Decision Readiness Engine deployed | `get_backend_function_logs("engineDecisionReadiness")` | Function responds |
| Transition Partnership Engine deployed | `get_backend_function_logs("engineTransitionPartnership")` | Function responds |
| Companion Service deployed | `get_backend_function_logs("companionService")` | Function responds |
| Pilot Account Reset deployed | `get_backend_function_logs("pilotAccountReset")` | Function responds |

### Data Verification

| Check | Method | Expected Result |
|-------|--------|-----------------|
| OCIPathways seeded | `read_entities("OCIPathway")` | 8+ pathways with provenance |
| No test data contamination | `read_entities("UserProfile")` | Only known test profiles (Bodge, SITREP, MIRROR) |
| Bodge profile intact | `read_entities("UserProfile", query={"id": "6a5fc833a725b4f9c08c66c1"})` | tos_phase = SETTLED, full journey data |

### Git Verification

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Repo on main branch | `git branch` | * main |
| Working tree clean | `git status` | nothing to commit |
| Local and remote aligned | `git log --oneline -1` vs remote | Same commit hash |
| Baseline tag exists | `git tag -l "v1.0-build-baseline"` | Tag present |

---

## Deployment Steps

The MVP Core is already deployed (Operation BUILD). Pilot deployment is not a new deployment — it is verification that the existing deployment is healthy and ready for real users.

### Step 1: Verify Engine Health

For each engine, make a test call with a known profile and verify the response:

```
1. Understanding Engine: get_state with Bodge profile_id → expect structured response
2. Capability Intelligence: validate_preconditions with Bodge profile_id → expect preconditions met
3. Decision Readiness: get_status with Bodge profile_id → expect EVALUATING or READY_TO_ACT
4. Transition Partnership: get_journey_status with Bodge profile_id → expect journey found
5. Companion Service: session_read with Bodge profile_id → expect session state
```

### Step 2: Verify App Status

```
get_base44_app_status(app_id="6a75d6b58496a73bf2165dec")
→ expect state: "ready"
```

### Step 3: Create Fresh Test Profile

```
1. Create a new UserProfile with initial state (EXPLORING)
2. Run through the MATE Journey end-to-end
3. Verify the journey completes without errors
4. Reset the test profile using pilotAccountReset
5. Verify reset was clean
```

### Step 4: Sign Off

All checks green → deployment is verified. Log the verification date and commit hash in the Known Issues Register (Item 8).

---

## Post-Deployment Monitoring

### During Pilot

| What | How | Frequency |
|------|-----|-----------|
| Engine health | Check backend function logs | Daily |
| Error patterns | Review error responses from logs | Daily |
| Safety flags | Review safety_flags on all profiles | Weekly |
| Data integrity | Spot-check entity records | Weekly |
| App status | `get_base44_app_status` | On any reported issue |

### Rollback Procedure

If a critical issue is discovered during the pilot:

1. **Stop:** Do not allow new participants to start interactions
2. **Assess:** Determine if the issue is engine-level (code) or data-level (user data)
3. If engine-level: the MVP Core is frozen at `v1.0-build-baseline`. Roll back to this tag:
   ```
   git checkout v1.0-build-baseline
   # Re-deploy engines from this baseline
   ```
4. If data-level: use `pilotAccountReset` to reset affected profiles
5. **Document:** Record the issue in the Known Issues Register
6. **Communicate:** Notify Paul and Cipher
7. **Resume:** Only after the issue is resolved and verification is re-run

---

## Deployment Verification Record

| Check | Date Verified | Verified By | Result |
|-------|--------------|-------------|--------|
| Entity verification | | | |
| Engine verification | | | |
| Data verification | | | |
| Git verification | | | |
| App status | | | |
| Fresh profile E2E | | | |

*To be completed on pilot deployment day.*

---

## Sign-off

This document defines the deployment verification checklist for the GapMap MATE pilot. The MVP Core is already deployed — this checklist verifies the deployment is healthy and ready for real users. It includes pre-deployment checks, verification steps, post-deployment monitoring, and a rollback procedure.

**Item 7 Status: ✅ COMPLETE**
