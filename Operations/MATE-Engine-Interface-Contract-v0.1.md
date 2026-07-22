# MATE Engine Interface Contract v0.1

**Status:** Draft — documenting existing implementation  
**Date:** 22 July 2026  
**Author:** Ash (Chief Engineer)  
**Boundary:** This document captures the four deployed MATE engines as they exist today. No new infrastructure, no Azure design, no engine changes. It is a technical reference for the MVP Experience Blueprint and Pilot Readiness Plan.

---

## 1. Architecture Overview

### 1.1 The Separation Principle

The MATE system operates on a clean separation:

- **MATE Engines** (deterministic, auditable) — validate, persist, gate, calculate. Stateless between calls. Every action is explicit. Every rule is testable.
- **Smudge** (conversational, LLM-based) — interprets free text, reasons, converses, decides *when* to call engine actions. Does not write to the database directly. Does not make state machine decisions.

**The contract between them is the action interface.** Smudge sends structured requests. Engines return structured responses. Engines never interpret intent. Smudge never bypasses validation.

### 1.2 The Four Engines

| # | Engine | Phase | File | Deployed |
|---|---|---|---|---|
| 1 | Understanding Engine | Phase Two | `engineUnderstanding.ts` | ✅ |
| 2 | Capability Intelligence Engine | Phase Three | `engineCapabilityIntelligence.ts` | ✅ |
| 3 | Decision Readiness Engine | Phase Four | `engineDecisionReadiness.ts` | ✅ |
| 4 | Transition Partnership Engine | Phase Five | `engineTransitionPartnership.ts` | ✅ |

### 1.3 Data Entities

| Entity | Role | RLS |
|---|---|---|
| `UserProfile` | Single source of truth — the individual's complete profile across all phases | Yes |
| `TransitionJourney` | Living document — current operational position during Phase Five | Yes |
| `JourneyCheckpoint` | Sparse positional snapshots — created on material change only | Yes |
| `OCIPathway` | Curated reference library — pathway definitions for matching | No (reference data) |

### 1.4 Data Access

All engines currently use `base44.asServiceRole.entities.<Entity>` for data access. This is the only Base44 coupling. Engine logic (validation, state machines, scoring, rules) contains no Base44 SDK calls.

**MVP discipline:** When the data layer moves to Azure, the adapter is replaced. The engine contract stays stable.

---

## 2. Engine 1 — Understanding Engine

**Phase:** Two (Understanding)  
**File:** `engineUnderstanding.ts`  
**Endpoint:** `POST /functions/engineUnderstanding`  
**Action model:** None — the engine processes discovery input fields directly. There is no `action` parameter.  
**Purpose:** Validate discovery input has substance across six operational areas, calculate Assessment Confidence, track Operational Picture confirmation, gate phase advancement.

### 2.1 Preconditions

- A `UserProfile` record must exist (any `tos_phase`).

### 2.2 Request

```json
{
  "profile_id": "string (required)",
  "full_name": "string (optional)",
  "contact_email": "string (optional)",
  "service_branch": "string (optional)",
  "rank": "string (optional)",
  "years_served": "number (optional)",
  "professional_identity": "string (optional)",
  "service_history": "array (optional)",
  "personal_context": "string (optional)",
  "goals": "array (optional)",
  "operational_context": "array (optional)",
  "user_confidence": "number (optional, 0-10)",
  "confirm_operational_picture": "boolean (optional)"
}
```

**Merge rule:** Provided fields merge onto the existing profile. Blank/null values never overwrite existing data. Arrays replace if non-empty, otherwise preserve existing.

**Confirmation stickiness:** `operational_picture_confirmed` is sticky — once `true`, stays `true` unless explicitly set to `false` via `confirm_operational_picture: false`.

### 2.3 Response (200)

```json
{
  "operational_picture": {
    "full_name": "string",
    "service_branch": "string",
    "rank": "string",
    "years_served": "number",
    "professional_identity": "string",
    "service_history": "array",
    "personal_context": "string",
    "goals": "array",
    "operational_context": "array",
    "user_confidence": "number"
  },
  "area_assessments": [
    {
      "area": "string",
      "has_substance": "boolean",
      "score": "number (0-15)",
      "notes": "string"
    }
  ],
  "assessment_confidence": {
    "overall_score": "number (0-100)",
    "rating": "LOW | MODERATE | HIGH",
    "areas": "AreaAssessment[]"
  },
  "operational_picture_confirmed": "boolean",
  "phase_complete": "boolean",
  "tos_phase": "string",
  "message": "string"
}
```

### 2.4 Error Responses

| Status | Condition | Response |
|---|---|---|
| 400 | Missing `profile_id` | `{"error": "Missing profile_id"}` |
| 404 | Profile not found | `{"error": "Profile not found"}` |

### 2.5 The Six Operational Areas

| # | Area | Fields Assessed | Substance Requirement |
|---|---|---|---|
| Q1 | Who are you? | `service_branch` + `rank` + `professional_identity` | Branch/rank present AND professional_identity ≥ 15 chars |
| Q2 | What have you done? | `service_history[]` | At least 1 role with substantive detail (responsibilities, achievements, or leadership_scope ≥ 15 chars) |
| Q3 | Where are you now? | `personal_context` | ≥ 15 chars |
| Q4 | Where are you going? | `goals[]` | At least 1 goal with substance |
| Q5 | What influences you? | `operational_context[]` | At least 1 factor with substance |
| Q6 | How well do we understand? | `user_confidence` | Non-null value |

### 2.6 Assessment Confidence Calculation

- Base: 5 evidence areas × max 15 = 75 + understanding max 10 = 85
- Confirmation bonus: +15 if `operational_picture_confirmed` is `true`
- Maximum: 100
- Ratings: `< 40` = LOW, `< 70` = MODERATE, `≥ 70` = HIGH

### 2.7 Phase Gate

Phase Two is complete when `phase_complete` returns `true`:
- All five evidence areas (Q1–Q5) have substance
- `operational_picture_confirmed` is `true`

---

## 3. Engine 2 — Capability Intelligence Engine

**Phase:** Three (Capability Intelligence)  
**File:** `engineCapabilityIntelligence.ts`  
**Endpoint:** `POST /functions/engineCapabilityIntelligence`  
**Action model:** 5 actions  
**Purpose:** Translate confirmed Operational Picture into evidence-backed Capability Picture. Enforce the Evidence Rule. Calculate Capability Confidence. Gate phase advancement.

### 3.1 Preconditions

Before any action (except `validate_preconditions` and `seed_evidence`):
- `operational_picture_confirmed` must be `true`
- `assessment_confidence.rating` must be `MODERATE` or `HIGH`
- `service_branch` must be present
- `service_history` must have at least one entry
- `evidence_log` must be non-empty

### 3.2 Actions

#### `validate_preconditions`

Checks whether the profile is ready for capability evaluation.

**Request:**
```json
{ "action": "validate_preconditions", "profile_id": "string" }
```

**Response (200):**
```json
{
  "preconditions": {
    "met": "boolean",
    "failures": "string[]",
    "details": {
      "operational_picture_confirmed": "boolean",
      "assessment_confidence_sufficient": "boolean",
      "profile_validated": "boolean",
      "evidence_log_available": "boolean"
    }
  },
  "profile_phase": "string"
}
```

#### `seed_evidence`

Auto-creates evidence_log entries from existing structured profile data (service_history, professional_identity, personal_context, operational_context, goals). Does not duplicate existing entries.

**Request:**
```json
{ "action": "seed_evidence", "profile_id": "string" }
```

**Response (200):**
```json
{
  "success": true,
  "action": "seed_evidence",
  "evidence_created": "number",
  "evidence_log": "EvidenceEntry[]",
  "message": "string"
}
```

#### `submit_capabilities`

Submits capabilities for evaluation. Enforces the Evidence Rule as a hard gate: every capability must include at least one valid `evidence_ref` that resolves to an entry in the profile's `evidence_log`. Capabilities without valid evidence are rejected.

**Request:**
```json
{
  "action": "submit_capabilities",
  "profile_id": "string",
  "capabilities": [
    {
      "capability_name": "string (required)",
      "civilian_translation": "string (required)",
      "evidence_refs": "string[] (required, must resolve to evidence_log)",
      "transferability_notes": "string (optional)"
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "string",
  "accepted": [
    {
      "capability_name": "string",
      "civilian_translation": "string",
      "evidence_refs": "string[]",
      "evidence_summary": "string[]",
      "confidence_score": "number (0-100)",
      "confidence_rating": "LOW | MODERATE | HIGH",
      "transferability_notes": "string"
    }
  ],
  "rejected": [
    { "capability_name": "string", "reason": "string" }
  ],
  "capability_picture": "CapabilityPicture",
  "profile_phase": "Evaluate"
}
```

**Error Responses:**

| Status | Condition | Response |
|---|---|---|
| 400 | Missing or empty capabilities array | `{"error": "Missing or empty capabilities array"}` |
| 400 | Preconditions not met | `{"error": "Preconditions not met", "failures": "string[]"}` |
| 422 | All capabilities rejected (no valid evidence) | `{"error": "All capabilities rejected...", "rejected": "..."}` |

#### `get_capability_picture`

Retrieves the stored Capability Picture from the profile. Reconstructs from `capability_map` and `confidence_scores`.

**Request:**
```json
{ "action": "get_capability_picture", "profile_id": "string" }
```

**Response (200):**
```json
{
  "capability_picture": "CapabilityPicture | null",
  "profile_phase": "string"
}
```

#### `advance_phase`

Transitions `tos_phase` to `Evaluate`. Requires at least one capability in `capability_map`.

**Request:**
```json
{ "action": "advance_phase", "profile_id": "string" }
```

**Response (200):**
```json
{
  "message": "string",
  "profile_phase": "Evaluate",
  "capability_count": "number"
}
```

### 3.3 Capability Confidence Calculation

| Factor | Score Impact |
|---|---|
| Base (1 valid evidence ref) | 40 |
| Each additional ref (max 3) | +15 each |
| Evidence with specific content (>30 chars) | +10 |
| Evidence from multiple source types | +10 |
| Maximum | 100 |

Ratings: `< 41` = LOW, `< 71` = MODERATE, `≥ 71` = HIGH

### 3.4 Evidence Rule (Hard Gate)

If a capability submission does not include at least one valid `evidence_ref` pointing to an entry in `evidence_log`, the capability is **rejected**. No exceptions. No bypass. This is the core trust mechanism.

---

## 4. Engine 3 — Decision Readiness Engine

**Phase:** Four (Decision Readiness)  
**File:** `engineDecisionReadiness.ts`  
**Endpoint:** `POST /functions/engineDecisionReadiness`  
**Action model:** 6 actions  
**Purpose:** Help the individual move from "I know what I can do" to "I know enough to decide what I want to do." Explore Decision Factors, evaluate OCI Pathways, manage the Soak Period.

### 4.1 Preconditions

- `tos_phase` must be `EVALUATING` or `READY_TO_ACT`
- `capability_map` must be non-empty (Phase Three complete)

### 4.2 Actions

#### `get_status`

Returns current Decision Readiness state. No writes.

**Request:**
```json
{ "action": "get_status", "profile_id": "string" }
```

**Response (200):**
```json
{
  "success": true,
  "action": "get_status",
  "tos_phase": "string",
  "soak_period": { "state": "NOT_STARTED | SOAKING | COMPLETED | BYPASSED" },
  "soak_state": "string",
  "pathway_count": "number",
  "expressed_decision_factors": "string[]",
  "capability_count": "number"
}
```

#### `record_decision_factor`

Records decision factors inferred from conversation. Hard rule: `evidence_ref` must resolve to a genuine `evidence_log` entry.

**Request:**
```json
{
  "action": "record_decision_factor",
  "profile_id": "string",
  "decision_factors_update": {
    "financial": { "expressed": true, "notes": "string", "evidence_ref": "string" },
    "location": { "expressed": true, "notes": "string", "evidence_ref": "string" }
  }
}
```

**Eight factor categories:** `family`, `financial`, `lifestyle`, `location`, `purpose`, `learning`, `confidence_factor`, `health_wellbeing`

**Response (200):**
```json
{
  "success": true,
  "action": "record_decision_factor",
  "updated_factors": "string[]",
  "message": "string"
}
```

**Error (400):**
```json
{
  "error": "Hard Rule Violation: No Decision Factor without user expression.",
  "violations": "string[]"
}
```

#### `evaluate_pathways`

Matches the Capability Picture against `OCIPathway` records through Decision Factors. Only called explicitly — not triggered by soak actions or factor updates. Validates all capability evidence refs before matching.

**Request:**
```json
{ "action": "evaluate_pathways", "profile_id": "string" }
```

**Response (200):**
```json
{
  "success": true,
  "action": "evaluate_pathways",
  "pathways": [
    {
      "pathway_id": "string",
      "pathway_name": "string",
      "confidence_level": "MATCHED_DIRECTION | POSSIBLE_DIRECTION | WORTH_EXPLORING",
      "matching_capabilities": "string[]",
      "capability_explanation": "string",
      "decision_factor_alignment": "string",
      "unresolved_gaps": "string[]",
      "lifestyle_fit_notes": "string",
      "generated_at": "ISO timestamp"
    }
  ],
  "total_evaluated": "number",
  "message": "string"
}
```

**Error (400):** Evidence integrity failure — capability_map contains unresolvable evidence references.

#### `initiate_soak`

Transitions the Soak Period from `NOT_STARTED` to `SOAKING`. Sets `tos_phase` to `EVALUATING` (if not already).

**Request:**
```json
{ "action": "initiate_soak", "profile_id": "string" }
```

**Response (200):**
```json
{
  "success": true,
  "action": "initiate_soak",
  "soak_state": "SOAKING",
  "tos_phase": "EVALUATING",
  "initiated_date": "date",
  "message": "string"
}
```

#### `complete_soak`

Transitions the Soak Period from `SOAKING` to `COMPLETED`. Sets `tos_phase` to `READY_TO_ACT`. Optional `reflection_notes`.

**Request:**
```json
{
  "action": "complete_soak",
  "profile_id": "string",
  "reflection_notes": "string (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "complete_soak",
  "soak_state": "COMPLETED",
  "tos_phase": "READY_TO_ACT",
  "completed_date": "date",
  "message": "string"
}
```

#### `bypass_soak`

Transitions the Soak Period from `SOAKING` to `BYPASSED`. Sets `tos_phase` to `READY_TO_ACT`. Requires `soak_bypass_reason` (auditable).

**Request:**
```json
{
  "action": "bypass_soak",
  "profile_id": "string",
  "soak_bypass_reason": "string (required)"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "bypass_soak",
  "soak_state": "BYPASSED",
  "tos_phase": "READY_TO_ACT",
  "bypassed_date": "date",
  "bypass_reason": "string",
  "message": "string"
}
```

### 4.3 Soak Period State Machine

```
NOT_STARTED → SOAKING → COMPLETED
                      → BYPASSED (requires bypass_reason)
```

Invalid transitions are blocked. `BYPASSED` is explicit and auditable.

### 4.4 Hard Rules

- No Decision Factor recorded without user expression (`evidence_ref` must resolve)
- No capability matched without traceable evidence
- Pathway matches only regenerated on explicit `evaluate_pathways` — never on soak actions
- Soak Period transitions validated by state machine

---

## 5. Engine 4 — Transition Partnership Engine

**Phase:** Five (Transition Partnership)  
**File:** `engineTransitionPartnership.ts`  
**Endpoint:** `POST /functions/engineTransitionPartnership`  
**Action model:** 15 actions  
**Purpose:** Maintain operational continuity from transition decision through to independence. Living document (TransitionJourney), sparse checkpoints (JourneyCheckpoint), auto-checkpointing on material change.

### 5.1 Preconditions

- `start_journey`: `tos_phase` must be `READY_TO_ACT`, `soak_period.state` must be `COMPLETED` or `BYPASSED`, `capability_map` must be non-empty
- All other actions: an active journey must exist (partnership_state ≠ `INDEPENDENT`)

### 5.2 Partnership Lifecycle State Machine

```
ACTIVE → MONITORING → INDEPENDENT
ACTIVE → SUPPORT_REQUIRED → INDEPENDENT
ACTIVE → REFERRAL → INDEPENDENT
ACTIVE → INDEPENDENT (direct)

MONITORING → ACTIVE (return)
MONITORING → SUPPORT_REQUIRED → INDEPENDENT
MONITORING → REFERRAL → INDEPENDENT
MONITORING → INDEPENDENT

SUPPORT_REQUIRED → ACTIVE (recovery)
SUPPORT_REQUIRED → REFERRAL → INDEPENDENT
SUPPORT_REQUIRED → INDEPENDENT

REFERRAL → ACTIVE (partnership continues)
REFERRAL → MONITORING → INDEPENDENT
REFERRAL → INDEPENDENT

INDEPENDENT: terminal (new journey if user returns)
```

### 5.3 Auto-Checkpoint Triggers

Checkpoints are created automatically (before the update is applied) on:
1. Partnership state transition
2. Confidence band shift
3. Blocker added or resolved
4. Commitment status change (COMPLETED, NO_LONGER_RELEVANT, PAUSED, REVISED)
5. Direction change
6. Wellbeing awareness surfaced (NONE → NOTED)
7. Referral recorded

### 5.4 Actions

#### `start_journey`

Creates a new TransitionJourney. Carries forward direction from `recommended_pathways[0]`. Sets `tos_phase` to `IN_TRANSITION`. Initial state: `ACTIVE`, confidence `BUILDING`, readiness `ON_COURSE`. If an active journey already exists, returns it instead.

**Request:** `{ "action": "start_journey", "profile_id": "string" }`

**Response (200):**
```json
{
  "success": true,
  "action": "start_journey",
  "journey_id": "string",
  "partnership_state": "ACTIVE",
  "confidence_band": "BUILDING",
  "operational_readiness": "ON_COURSE",
  "current_direction": "string",
  "message": "string"
}
```

**Error (400):** Preconditions not met (wrong tos_phase, soak not resolved, no capability_map).

#### `get_journey_status`

Returns the current operational position + recent checkpoints for delta. This is what Smudge reads to resume a conversation seamlessly.

**Request:** `{ "action": "get_journey_status", "profile_id": "string" }`

**Response (200):**
```json
{
  "success": true,
  "action": "get_journey_status",
  "journey_active": true,
  "journey_id": "string",
  "partnership_state": "string",
  "transition_status": { "employment": "string", "training": "string", "applications": "array", "interviews": "array" },
  "current_direction": "string",
  "current_blockers": "string[]",
  "confidence_band": "LOW | BUILDING | STEADY | STRONG",
  "confidence_trend": "RISING | STABLE | FALLING | VOLATILE",
  "operational_readiness": "ON_COURSE | ADAPTING | STALLED | NEEDS_SUPPORT",
  "wellbeing_awareness": { "awareness": "NONE | NOTED", "observation": "string", "date": "date" },
  "active_commitments": "Commitment[]",
  "completed_commitments_count": "number",
  "significant_milestones": "Milestone[]",
  "referral_history": "Referral[]",
  "last_interaction_date": "date",
  "next_check_in_date": "date | null",
  "journey_started_date": "date",
  "checkpoint_count": "number",
  "recent_checkpoints": "CheckpointSummary[]",
  "delta": { "last_checkpoint_date": "date", "last_change": "string", "confidence_movement": "string", "state_at_checkpoint": "string", "state_now": "string" },
  "message": "string"
}
```

If no active journey, returns `journey_active: false` with guidance.

#### `record_commitment`

Records a new commitment. Commitments are user-owned — not promises to Smudge. Generates a unique commitment ID.

**Request:**
```json
{
  "action": "record_commitment",
  "profile_id": "string",
  "description": "string (required)",
  "target_date": "date (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "record_commitment",
  "commitment_id": "string",
  "description": "string",
  "status": "ACTIVE",
  "message": "string"
}
```

#### `update_commitment`

Updates a commitment's status. No failure terminology. Valid statuses: `ACTIVE`, `COMPLETED`, `PAUSED`, `REVISED`, `NO_LONGER_RELEVANT`. Auto-checkpoints on material status change. If `REVISED`, preserves original description in `revised_from`.

**Request:**
```json
{
  "action": "update_commitment",
  "profile_id": "string",
  "commitment_id": "string (required)",
  "new_status": "ACTIVE | COMPLETED | PAUSED | REVISED | NO_LONGER_RELEVANT (required)",
  "revised_description": "string (optional, for REVISED)"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "update_commitment",
  "commitment_id": "string",
  "previous_status": "string",
  "new_status": "string",
  "message": "string (contextual — e.g. 'adaptation, not failure')"
}
```

#### `update_transition_status`

Updates the current operational position (employment, training, applications, interviews). Positional — where the individual IS, not a log.

**Request:**
```json
{
  "action": "update_transition_status",
  "profile_id": "string",
  "transition_status_update": {
    "employment": "string",
    "training": "string",
    "applications": "array",
    "interviews": "array"
  }
}
```

**Response (200):** Returns the merged `transition_status` and a confirmation message.

#### `record_blocker`

Records a current obstacle. Auto-checkpoints (new blocker trigger).

**Request:** `{ "action": "record_blocker", "profile_id": "string", "blocker": "string (required)" }`

**Response (200):** Returns the blocker, full `current_blockers` array, and a message.

#### `resolve_blocker`

Removes a resolved blocker. Auto-checkpoints (blocker resolved trigger).

**Request:** `{ "action": "resolve_blocker", "profile_id": "string", "blocker": "string (required)" }`

**Response (200):** Returns resolved blocker, updated blockers array, and a message. If blocker not found, returns success with "may already be resolved."

#### `record_milestone`

Records a significant achievement — for showing progress, not measuring performance.

**Request:** `{ "action": "record_milestone", "profile_id": "string", "milestone_text": "string (required)" }`

**Response (200):** Returns the milestone, total milestone count, and a message.

#### `record_referral`

Records a handover to an external organisation. Smudge decides when to refer. Engine records. Partnership continues after referral. Auto-checkpoints (referral trigger).

**Request:**
```json
{
  "action": "record_referral",
  "profile_id": "string",
  "organisation": "string (required)",
  "reason": "string (required)"
}
```

**Response (200):** Returns the referral record (organisation, reason, date, status: PENDING) and a message.

#### `update_confidence`

Records a confidence band identified from conversation. Behavioural, not numeric. Auto-checkpoints on band shift.

**Request:**
```json
{
  "action": "update_confidence",
  "profile_id": "string",
  "confidence_band": "LOW | BUILDING | STEADY | STRONG (required)",
  "confidence_trend": "RISING | STABLE | FALLING | VOLATILE (optional)"
}
```

**Response (200):** Returns previous band, new band, trend, and a message.

#### `update_wellbeing`

Records a wellbeing observation voluntarily shared. Awareness state only. No diagnosis, no scoring, no clinical interpretation. Auto-checkpoints if new awareness (NONE → NOTED).

**Request:** `{ "action": "update_wellbeing", "profile_id": "string", "observation": "string (required)" }`

**Response (200):** Returns awareness: NOTED and a message emphasising no clinical interpretation.

#### `update_partnership_state`

Transitions the partnership lifecycle. Validates transitions. Invalid transitions blocked. If `INDEPENDENT`, sets `journey_concluded_date`, `conclusion_summary`, and `tos_phase` to `SETTLED`. Auto-checkpoints on state transition.

**Request:**
```json
{
  "action": "update_partnership_state",
  "profile_id": "string",
  "new_state": "ACTIVE | MONITORING | SUPPORT_REQUIRED | REFERRAL | INDEPENDENT (required)",
  "reason": "string (optional, used as conclusion_summary for INDEPENDENT)"
}
```

**Response (200):** Returns previous state, new state, and a contextual message.

**Error (400):** Invalid state transition — returns current state, attempted state, and valid transitions from current.

#### `update_operational_readiness`

Updates the operational readiness indicator.

**Request:**
```json
{
  "action": "update_operational_readiness",
  "profile_id": "string",
  "operational_readiness": "ON_COURSE | ADAPTING | STALLED | NEEDS_SUPPORT (required)"
}
```

**Response (200):** Returns the new readiness value and a message.

#### `conclude_journey`

Transitions the partnership to `INDEPENDENT`. Terminal state. Validates that current state allows transition to INDEPENDENT. Auto-checkpoints. Sets `tos_phase` to `SETTLED`.

**Request:**
```json
{
  "action": "conclude_journey",
  "profile_id": "string",
  "summary": "string (optional, defaults to standard conclusion message)"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "conclude_journey",
  "journey_id": "string",
  "partnership_state": "INDEPENDENT",
  "concluded_date": "date",
  "message": "string (success condition — independence, not dependence)"
}
```

#### `update_direction`

Records a change in the individual's chosen direction. Auto-checkpoints on direction change.

**Request:** `{ "action": "update_direction", "profile_id": "string", "new_direction": "string (required)" }`

**Response (200):** Returns previous direction, new direction, and a message ("Changing direction is evidence of learning, not failure").

### 5.5 Error Responses (All Actions)

| Status | Condition | Response |
|---|---|---|
| 400 | Missing `profile_id` | `{"error": "profile_id is required and must be a non-empty string"}` |
| 400 | Missing `action` | `{"error": "action is required"}` |
| 400 | Profile lookup fails | `{"error": "Profile lookup failed", "detail": "string"}` |
| 400 | Preconditions not met (Phase Four not complete) | `{"error": "Precondition failed: ...", "current_phase": "string"}` |
| 400 | No active journey | `{"error": "No active journey found. Call start_journey first."}` |
| 400 | Invalid state transition | `{"error": "Invalid state transition: X → Y", "valid_transitions_from_current": "string[]"}` |
| 400 | Invalid enum value (confidence band, readiness, etc.) | `{"error": "Invalid X. Valid values: ...", "received": "string"}` |
| 404 | Profile not found | `{"error": "Profile not found: id"}` |
| 400 | Unknown action | `{"error": "Unknown action: X", "valid_actions": "string[]"}` |

---

## 6. Data Model Specification

### 6.1 UserProfile

The single source of truth for the individual's profile across all phases.

| Field | Type | Phase | Description |
|---|---|---|---|
| `full_name` | string | 2 | Individual's name |
| `contact_email` | string | 2 | Contact email |
| `service_branch` | string | 2 | Military branch |
| `rank` | string | 2 | Rank at discharge |
| `years_served` | number | 2 | Years of service |
| `professional_identity` | string | 2 | Self-described identity narrative (≥15 chars for substance) |
| `service_history` | array | 2 | Roles with responsibilities, achievements, leadership_scope, deployment, dates |
| `personal_context` | string | 2 | Current life situation (≥15 chars for substance) |
| `goals` | array | 2 | Stated goals and aspirations |
| `operational_context` | array | 2 | Influencing factors |
| `user_confidence` | number | 2 | Self-reported confidence (0-10) |
| `operational_picture_confirmed` | boolean | 2 | Sticky confirmation of the Operational Picture |
| `operational_picture_history` | array | 2 | Versioned history of the Operational Picture |
| `operational_picture_version` | number | 2 | Current version number |
| `assessment_confidence` | object | 2 | `{ overall_score: 0-100, rating: LOW/MODERATE/HIGH, areas: AreaAssessment[] }` |
| `evidence_log` | array | 3 | Structured evidence entries: `{ evidence_id, source_type, source_reference, content, recorded_date }` |
| `capability_map` | array | 3 | Capabilities: `{ skill, civilian_equivalent, evidence, evidence_ref, score }` |
| `confidence_scores` | array | 3 | Per-capability confidence: `{ skill, confidence, evidence_refs, evidence_ref }` |
| `decision_factors` | object | 4 | 8 categories, each: `{ expressed: boolean, notes: string, evidence_ref: string }` |
| `soak_period` | object | 4 | `{ state: NOT_STARTED/SOAKING/COMPLETED/BYPASSED, initiated_date, completed_date, bypassed_date, bypass_reason, reflection_notes }` |
| `recommended_pathways` | array | 4 | Matched pathways: `{ pathway_id, pathway_name, confidence_level, matching_capabilities, capability_explanation, decision_factor_alignment, unresolved_gaps, lifestyle_fit_notes, generated_at }` |
| `action_plan` | string | 4 | Reserved for future use |
| `tos_phase` | enum | All | `EXPLORING / CONFIRMING / CONFIRMED / EVALUATING / READY_TO_ACT / IN_TRANSITION / SETTLED` |
| `communication_preferences` | object | — | Reserved |
| `milestones` | array | — | Reserved |
| `safety_flags` | array | — | Guardian Protocol scaffolding (post-MVP) |

### 6.2 TransitionJourney

Living document — the individual's current operational position during Phase Five.

| Field | Type | Description |
|---|---|---|
| `user_profile_id` | string | Links to UserProfile |
| `partnership_state` | enum | `ACTIVE / MONITORING / SUPPORT_REQUIRED / REFERRAL / INDEPENDENT` |
| `transition_status` | object | `{ employment, training, applications[], interviews[] }` — positional, not logged |
| `current_direction` | string | Current transition direction |
| `active_commitments` | array | `{ id, description, status, created_date, target_date, completed_date, revised_from }` — statuses: ACTIVE / COMPLETED / PAUSED / REVISED / NO_LONGER_RELEVANT |
| `current_blockers` | string[] | Current obstacles — positional |
| `confidence_band` | enum | `LOW / BUILDING / STEADY / STRONG` — behavioural, not numeric |
| `confidence_trend` | enum | `RISING / STABLE / FALLING / VOLATILE` |
| `wellbeing_awareness` | object | `{ awareness: NONE / NOTED, observation, date }` — voluntary, non-clinical |
| `operational_readiness` | enum | `ON_COURSE / ADAPTING / STALLED / NEEDS_SUPPORT` |
| `significant_milestones` | array | `{ text, date }` |
| `referral_history` | array | `{ organisation, reason, date, status }` |
| `last_interaction_date` | date | Updated on every action |
| `next_check_in_date` | date | Scheduled next check-in |
| `journey_started_date` | date | When the journey began |
| `journey_concluded_date` | date | When INDEPENDENT was reached |
| `conclusion_summary` | string | Summary of the journey |

### 6.3 JourneyCheckpoint

Sparse positional snapshots — created on material change only.

| Field | Type | Description |
|---|---|---|
| `journey_id` | string | Links to TransitionJourney |
| `user_profile_id` | string | Links to UserProfile (denormalised for RLS) |
| `checkpoint_date` | date | When the checkpoint was taken |
| `partnership_state` | enum | State at time of checkpoint |
| `transition_status_snapshot` | object | Employment/training at checkpoint |
| `confidence_band` | enum | Confidence at checkpoint |
| `active_commitments_snapshot` | array | Commitments at checkpoint: `{ description, status }` |
| `current_blockers_snapshot` | string[] | Blockers at checkpoint |
| `wellbeing_awareness_snapshot` | object | Wellbeing at checkpoint |
| `operational_readiness` | enum | Readiness at checkpoint |
| `change_summary` | string | What triggered the checkpoint |

### 6.4 OCIPathway

Curated reference library of civilian pathway definitions.

| Field | Type | Description |
|---|---|---|
| `name` | string | Pathway name |
| `purpose` | string | What this pathway involves |
| `civilian_context` | string | Civilian sector context |
| `capability_profile` | string[] | Capabilities this pathway matches against |
| `typical_responsibilities` | string[] | Typical role responsibilities |
| `civilian_terminology` | string[] | Sector terminology |
| `entry_routes` | string[] | How to enter this pathway |
| `development_opportunities` | string[] | Growth potential |
| `common_transition_gaps` | string[] | Known transition challenges |
| `lifestyle_considerations` | object | `{ hours, shift_patterns, travel }` |
| `evidence_source` | string | Provenance — source title |
| `provenance_references` | array | Structured provenance: `{ source_title, organisation, source_type, reference_url, date_reviewed, reviewer }` |
| `review_status` | string | `active / retired` |
| `version` | string | Version identifier |
| `last_reviewed` | date | Last review date |

---

## 7. Lifecycle Progression

The `tos_phase` field on `UserProfile` is the single source of truth for lifecycle phase.

```
EXPLORING → CONFIRMING → CONFIRMED     (Phase 2: Understanding Engine)
                              ↓
                         EVALUATING     (Phase 4: Decision Readiness Engine)
                              ↓
                              ↓ (during Soak Period: tos_phase stays EVALUATING,
                                 soak_period.state = SOAKING)
                              ↓
                       READY_TO_ACT     (Phase 4: Soak completed/bypassed)
                              ↓
                      IN_TRANSITION     (Phase 5: Transition Partnership Engine)
                              ↓
                          SETTLED       (Phase 5: Independence reached — terminal)
```

Phase Three (Capability Intelligence) operates between CONFIRMED and EVALUATING. It does not have its own `tos_phase` value — it transitions `tos_phase` to `Evaluate` (note: stored as `Evaluate` in some code paths, `EVALUATING` in others — known inconsistency, see §9).

---

## 8. Cross-Engine Rules

### 8.1 The Evidence Rule (Phase Three onward)

Every capability in `capability_map` must reference at least one entry in `evidence_log`. Every decision factor with `expressed: true` must have an `evidence_ref` that resolves to an `evidence_log` entry. This is enforced as a hard gate by both the Capability Intelligence Engine and the Decision Readiness Engine.

### 8.2 No Failure Terminology (Phase Five)

Commitment statuses are `ACTIVE / COMPLETED / PAUSED / REVISED / NO_LONGER_RELEVANT`. There is no `FAILED` status. Direction changes are framed as learning. Blockers are positional, not permanent.

### 8.3 Confidence is Behavioural (Phase Five)

Confidence in Phase Five is expressed as bands (`LOW / BUILDING / STEADY / STRONG`), not numeric scores. This contrasts with Phases Two and Three, which use numeric scores (0-100) for assessment and capability confidence. The shift is deliberate — Phase Five confidence is about human observation, not calculation.

### 8.4 Engine Does Not Interpret (All Phases)

Engines never interpret free text. They validate, persist, calculate, and gate. All interpretation is Smudge's role. This separation is preserved across every engine.

### 8.5 Checkpoints Are Sparse (Phase Five)

JourneyCheckpoints are created on material change only — not on every action. The seven trigger types are listed in §5.3. The objective is meaningful delta tracking, not an activity log.

---

## 9. Known Inconsistencies (Documented, Not Fixed)

These are documented for awareness. Per the boundary of this contract, no changes are made.

1. **`tos_phase` casing:** The schema enum uses uppercase (`EVALUATING`, `READY_TO_ACT`). The Capability Intelligence Engine writes `Evaluate` (title case) to `tos_phase`. The Decision Readiness Engine checks for `EVALUATING` (uppercase). This works because the Base44 entity system may be case-insensitive on enum matching, but it is a latent inconsistency.

2. **`confidence_scores` field naming:** The schema has both `evidence_ref` (singular string) and `evidence_refs` (plural intent but stored as string). The Capability Intelligence Engine writes `evidence_refs` as a comma-joined string and `evidence_ref` as the first ref. This is a schema inconsistency, not a bug.

3. **`assessment_confidence` storage:** The schema defines this as `number`, but the Understanding Engine writes an object `{ overall_score, rating, areas }`. The stored type does not match the schema declaration.

4. **`goals` and `operational_context` typing:** The schema declares both as `string`, but the Understanding Engine treats them as arrays in some code paths. The engine handles both gracefully through the merge logic, but the schema is not authoritative here.

5. **Substance threshold:** The 15-character minimum is a heuristic, not a validated threshold. It is acceptable for MVP but will need review for production.

---

## 10. Versioning

### 10.1 Contract Version

This is Interface Contract **v0.1**. It documents the engines as deployed on 22 July 2026. Any future engine changes that alter the action interface (new actions, changed request/response shapes, changed preconditions) must increment the contract version.

### 10.2 Engine Versions

Each engine carries a version in its file header comment (Design Intent version). The engines do not currently return a version in their API response. For production, engines should return their version in every response.

### 10.3 Backward Compatibility

For the MVP, backward compatibility is not a concern — there is only one consumer (Smudge via Base44). When the engine becomes a shared API consumed by multiple products, the action interface must be versioned and backward-compatible changes must be additive only.

---

## 11. Deployment Reference

All four engines are deployed as Base44 backend functions:

| Engine | Function Name | Endpoint |
|---|---|---|
| Understanding | `engineUnderstanding` | `POST /functions/engineUnderstanding` |
| Capability Intelligence | `engineCapabilityIntelligence` | `POST /functions/engineCapabilityIntelligence` |
| Decision Readiness | `engineDecisionReadiness` | `POST /functions/engineDecisionReadiness` |
| Transition Partnership | `engineTransitionPartnership` | `POST /functions/engineTransitionPartnership` |

All functions accept `POST` with JSON body. All return JSON responses. CORS headers are set for `OPTIONS` preflight. Authentication is handled by the Base44 platform (`createClientFromRequest`).

---

*End of MATE Engine Interface Contract v0.1.*
