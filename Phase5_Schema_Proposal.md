# Phase Five Schema Proposal
## Transition Journey + Journey Checkpoints

**Proposed by:** Ash (Chief Engineer)
**Date:** 21 July 2026
**Build authority:** Granted by Cipher for schema proposal
**Status:** PROPOSED — awaiting review

---

## Architecture Summary

Two new entities:

1. **TransitionJourney** — the individual's current operational position. Living document, refreshed every interaction. This is what Smudge reads to resume a conversation seamlessly.

2. **JourneyCheckpoint** — sparse positional snapshots, created only when the operational position materially changes. These are not events. They are previous positions, preserved to establish meaningful delta, confidence trend, and adaptation history.

Both entities are RLS-scoped to the individual, linked to UserProfile via `user_profile_id`.

---

## Entity 1: TransitionJourney

The current operational position. One record per individual, created when Phase Five begins (tos_phase reaches READY_TO_ACT).

| Field | Type | Description |
|---|---|---|
| `user_profile_id` | string | Links to UserProfile (required) |
| `partnership_state` | enum | `ACTIVE` / `MONITORING` / `SUPPORT_REQUIRED` / `REFERRAL` / `INDEPENDENT` |
| `transition_status` | object | Current employment, training, and application status (see structure below) |
| `current_direction` | string | Carried from Phase Four — the individual's chosen pathway/direction |
| `active_commitments` | array | User-owned commitments (see structure below) |
| `current_blockers` | array | Current obstacles (text descriptions, not historical) |
| `confidence_current` | number | Latest confidence reading (0-100) |
| `confidence_trend` | enum | `RISING` / `STABLE` / `FALLING` / `VOLATILE` — derived from checkpoint comparison |
| `wellbeing_current` | object | Current wellbeing observation (only if voluntarily shared, see structure below) |
| `significant_milestones` | array | Achieved milestones (text + date) |
| `referral_history` | array | Referrals made to external organisations (see structure below) |
| `operational_readiness` | enum | `ON_COURSE` / `ADAPTING` / `STALLED` / `AT_RISK` |
| `last_interaction_date` | date | When Smudge last spoke with the user |
| `next_check_in_date` | date | Optional — when the next check-in should happen (Smudge's judgement) |
| `journey_started_date` | date | When Phase Five began |
| `journey_concluded_date` | date | When partnership concluded (if INDEPENDENT) |
| `conclusion_summary` | string | How the individual transitioned to independence (if concluded) |

### Sub-structures

**transition_status:**
```
{
  "employment": "string (current employment situation)",
  "training": "string (current training/learning activity)",
  "applications": "array of {role, organisation, status, date}",
  "interviews": "array of {role, organisation, date, outcome}"
}
```

**active_commitments (array of):**
```
{
  "id": "string (auto-generated)",
  "description": "string (user's own words)",
  "status": "enum: PENDING / IN_PROGRESS / COMPLETED / ABANDONED",
  "created_date": "date",
  "target_date": "date (optional — only if user sets one)",
  "completed_date": "date (when status moves to COMPLETED)",
  "evidence_ref": "string (optional — link to evidence_log)"
}
```

**wellbeing_current (only if voluntarily shared):**
```
{
  "observation": "string (Smudge's record of what was shared)",
  "date": "date",
  "flag": "enum: NONE / ADVISORY (advisory only — Smudge handles conversation)"
}
```
Note: No clinical terminology. No diagnosis. No severity scale. Just what was shared and whether Smudge should be aware.

**referral_history (array of):**
```
{
  "organisation": "string",
  "reason": "string (why referral was made)",
  "date": "date",
  "status": "enum: PENDING / ACTIVE / RESOLVED"
}
```

---

## Entity 2: JourneyCheckpoint

Sparse positional snapshots. Created only when the operational position materially changes. Not every interaction. Not every event.

| Field | Type | Description |
|---|---|---|
| `journey_id` | string | Links to TransitionJourney (required) |
| `user_profile_id` | string | Links to UserProfile (for RLS, denormalised) |
| `checkpoint_date` | date | When the checkpoint was taken |
| `partnership_state` | enum | State at time of checkpoint |
| `transition_status_snapshot` | object | Same structure as TransitionJourney.transition_status |
| `confidence_reading` | number | Confidence at time of checkpoint (0-100) |
| `active_commitments_snapshot` | array | Commitments at time of checkpoint |
| `current_blockers_snapshot` | array | Blockers at time of checkpoint |
| `wellbeing_reading` | object | Wellbeing at time of checkpoint (if shared) |
| `change_summary` | string | Brief description of what materially changed to trigger the checkpoint |

### What triggers a checkpoint:
- Partnership state transition (Active → Monitoring, etc.)
- Significant confidence shift (threshold: ±15 points or trend reversal)
- New blocker surfaced or existing blocker resolved
- Commitment completed or abandoned
- Direction change (pathway adjusted)
- Wellbeing concern surfaced (voluntarily shared)
- Referral made

### What does NOT trigger a checkpoint:
- Every conversation
- Every application submitted
- Every small update
- Routine check-ins with no positional shift

---

## Partnership Lifecycle State Machine

Proposed transitions:

```
ACTIVE → MONITORING        (sustained progress, engagement frequency naturally reducing)
MONITORING → ACTIVE         (user returns with new blocker or change)
ACTIVE → SUPPORT_REQUIRED   (progress stalls, confidence drops significantly)
MONITORING → SUPPORT_REQUIRED (same trigger)
SUPPORT_REQUIRED → ACTIVE   (blocker resolved, progress resumes)
SUPPORT_REQUIRED → REFERRAL (external org better placed — Smudge judgement, engine records)
ANY → REFERRAL              (external org better placed — Smudge judgement)
REFERRAL → ACTIVE           (referral resolved, partnership continues)
REFERRAL → MONITORING       (referral ongoing, partnership steps back to monitoring)
ANY → INDEPENDENT           (sustained confidence + stability + self-direction)
```

Transitions NOT allowed:
- INDEPENDENT → anything (partnership concluded — if user returns, a new journey begins)
- REFERRAL → SUPPORT_REQUIRED (referral and support required are parallel concerns — if both are needed, stay in referral and note support required in the referral record)

---

## Relationship to Existing Architecture

- **UserProfile** remains the single source of truth for Phases 1-4 data (operational picture, capability picture, decision readiness, decision factors, soak period).
- **TransitionJourney** is the Phase Five equivalent — the living operational position for the partnership phase.
- **JourneyCheckpoint** provides the historical delta layer.
- The engine reads UserProfile to carry forward capability and decision factors. It reads TransitionJourney to resume the conversation. It reads JourneyCheckpoints to establish trend.
- Smudge receives all three via the companion service and decides how to use them in conversation.

---

## Open Questions for Review

1. **Confidence scoring** — is 0-100 appropriate, or should it be a simpler scale (e.g., 1-5 or qualitative: LOW / MEDIUM / HIGH)? I've proposed 0-100 for granularity in trend detection, but a simpler scale might be more honest given it's conversationally inferred, not measured.

2. **operational_readiness enum** — I've proposed ON_COURSE / ADAPTING / STALLED / AT_RISK as the engine's assessment of the current position. Is this the right vocabulary, or does Cipher see a better framing?

3. **Commitment evidence_ref** — should commitments link to evidence_log? I think yes (consistent with the Evidence Rule), but commitments are user-chosen actions, not demonstrated capabilities. The evidence would be of the conversation where the commitment was made, not of capability. Is that the right use of evidence_ref?

4. **Wellbeing flag** — I've proposed NONE / ADVISORY as the only two states. ADVISORY means "Smudge should be aware of this in conversation." No clinical terminology, no severity scale. Is this sufficient, or does it need more structure before build?

---

## What I'm NOT Proposing

- No automated referral logic (Smudge decides, engine records)
- No clinical assessment or diagnosis capability
- No sentiment analysis or automated mood detection
- No surveillance or tracking beyond what the user volunteers
- No task management or reminder system
- No external API integrations for job boards, training providers, etc. (post-MVP)
