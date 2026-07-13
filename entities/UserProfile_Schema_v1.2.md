# UserProfile Entity Schema — v1.2
# Operation PROOF, GapMap MATE
# Locked: 13 July 2026

## tos_phase lifecycle (Phase Four correction)

tos_phase is the single source of truth for the individual's lifecycle phase.
soak_period.state is the single source of truth for the Soak Period.
These are non-overlapping — SOAKING does NOT appear in tos_phase.

### tos_phase enum
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT

### soak_period.state enum
NOT_STARTED → SOAKING → COMPLETED | BYPASSED

### Invariant
During soak:   tos_phase = EVALUATING,    soak_period.state = SOAKING
On completion: tos_phase = READY_TO_ACT,  soak_period.state = COMPLETED
On bypass:     tos_phase = READY_TO_ACT,  soak_period.state = BYPASSED

## Fields

### Core identity
- full_name: string
- rank: string
- service_branch: string
- years_served: number
- service_history: array[object]

### Operational picture
- professional_identity: string
- personal_context: string
- goals: string
- operational_context: string
- operational_picture_confirmed: boolean
- operational_picture_version: number
- operational_picture_history: array[object]

### Phase lifecycle
- tos_phase: string (enum — see above)

### Capability Intelligence (Phase Three)
- capability_map: array[object] — {capability, confidence, evidence_refs, category}
- confidence_scores: array[object]
- evidence_log: array[object] — {id, content, source, date}
- assessment_confidence: number
- user_confidence: number
- milestones: array[object]

### Decision Readiness (Phase Four)
- decision_factors: object — eight categories (family, financial, lifestyle, location,
  purpose, learning, confidence_factor, health_wellbeing)
  Each: {expressed: boolean, notes: string, evidence_ref: string}
- soak_period: object — {state, initiated_date, completed_date, bypassed_date,
  bypass_reason, reflection_notes}
- recommended_pathways: array[object] — {pathway_id, pathway_name, confidence_level,
  matching_capabilities, capability_explanation, decision_factor_alignment,
  lifestyle_fit_notes, unresolved_gaps, generated_at}
- action_plan: string

### System fields
- communication_preferences: object
- safety_flags: array[object]

## Hard Rules (Phase Four)
- No Decision Factor without user expression (evidence_ref must resolve to evidence_log)
- No capability matched without traceable evidence_ref
- Pathway matches only generated on explicit evaluate_pathways action
- Soak Period state machine transitions validated — invalid transitions blocked
- Bypass is explicit and auditable (bypass_reason required, min 10 chars)
