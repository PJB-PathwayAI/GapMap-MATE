# PACKET 2B — CANONICAL LIFECYCLE CONTRACT CONFIRMATION SITREP v1.0

**From:** Ash (Chief Engineer)  
**To:** Paul (Product Owner) + Cipher (Doctrine & Architecture)  
**Date:** 16 August 2026  
**Subject:** Canonical lifecycle contract definition — design only, no implementation  
**Status:** CONTRACT DESIGN — awaiting three-view agreement  
**Classification:** Engineering Record  

---

## A. CANONICAL LIFECYCLE VERDICT

### VALID WITH REFINEMENT

The existing schema enum provides the correct 7-state persisted lifecycle:

```
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED
```

**Refinement required on one point:** The order's section 3 lists `SOAKING` as a persisted lifecycle value and section 13 proposes it as a `tos_phase` state. I challenge this.

`SOAKING` is currently and correctly a `soak_period.state` value, NOT a `tos_phase` value. The schema `tos_phase` enum does not include `SOAKING`. The `soak_period.state` enum does: `NOT_STARTED`, `SOAKING`, `COMPLETED`, `BYPASSED`.

The existing engineering design in engineDecisionReadiness is explicit and correct:

> *tos_phase is the single source of truth for lifecycle phase. soak_period.state is the single source of truth for the Soak Period. These are non-overlapping. tos_phase does NOT include SOAKING. During soaking: tos_phase = EVALUATING, soak_period.state = SOAKING.*

**Recommendation:** Do NOT add SOAKING to the `tos_phase` enum. Keep the two-field design. The soak period is a sub-state within EVALUATING, not a separate lifecycle phase. This avoids two sources of truth contradicting each other — exactly the concern the order raises in section 11.

---

## B. AUTHORITATIVE STATE DEFINITIONS

---

### State 1: EXPLORING

| Field | Value |
|-------|-------|
| **User meaning** | "I'm talking to Smudge. We're figuring out who I am, what I've done, where I'm going." |
| **Engineering meaning** | Discovery in progress. One or more of the six operational areas lack substance. Operational Picture is not yet ready for reflection. |
| **Entry condition** | profileBootstrap creates a new UserProfile with `tos_phase: "EXPLORING"` |
| **Exit condition** | All six operational areas have substance (Q1–Q6 has_substance = true) AND user_confidence is set |
| **Owner** | engineUnderstanding / companionService — deterministic substance check |
| **Must not happen** | No automatic phase advance based on field count or time. All six areas must genuinely have substance. No capability evaluation, no pathway matching, no journey creation. |

---

### State 2: CONFIRMING

| Field | Value |
|-------|-------|
| **User meaning** | "Smudge is showing me what it understands about me. Does this sound right? Is this me?" |
| **Engineering meaning** | Operational Picture has substance across all six areas. Smudge is presenting the picture for the user to review. `operational_picture_confirmed` is still false. |
| **Entry condition** | All six operational areas substantive (Q1–Q6) AND user_confidence set. This is the `readyForConfirmation` condition. |
| **Exit condition** | User explicitly confirms ("Yes, that's me") → CONFIRMED. OR user corrects → returns to EXPLORING for gap exploration (RE_EXPLORING in conversation mode), then back to CONFIRMING when gaps filled. |
| **Owner** | companionService — the conversational layer owns the reflection moment. engineUnderstanding performs the substance calculation but does NOT own the CONFIRMING → CONFIRMED transition. |
| **Must not happen** | No automatic transition to CONFIRMED based on assessment_confidence score. No engine may infer user confirmation. The `operational_picture_confirmed` boolean is the gate, and it must be set by an explicit user action routed through companionService. |

---

### State 3: CONFIRMED

| Field | Value |
|-------|-------|
| **User meaning** | "Yes, that's me. That picture is accurate. I understand myself better now." |
| **Engineering meaning** | Operational Picture is confirmed. `operational_picture_confirmed = true`. The user has agreed this is them. Capability evaluation may now begin. |
| **Entry condition** | Explicit user confirmation via companionService (`user_response_type: 'confirming'`). companionService sets `operational_picture_confirmed = true` AND writes `tos_phase = 'CONFIRMED'`. |
| **Exit condition** | First capability is successfully submitted with valid evidence references via engineCapabilityIntelligence. |
| **Owner** | companionService owns the entry (user confirmation). engineCapabilityIntelligence owns the exit (capability submission). |
| **Must not happen** | No silent regression to CONFIRMING. No automatic capability evaluation without explicit invocation. No pathway matching (that's Phase Four). No journey creation. |

---

### State 4: EVALUATING

| Field | Value |
|-------|-------|
| **User meaning** | "Now I can see what I'm actually good at. What options do I have? What matters most to me?" |
| **Engineering meaning** | Capability Picture is being built. Decision factors are being explored. Pathways are being matched. Soak Period may be in progress (sub-state: `soak_period.state`). |
| **Entry condition** | First capability successfully submitted with valid evidence via engineCapabilityIntelligence `submit_capabilities` action. |
| **Exit condition** | Soak Period completed (`soak_period.state = COMPLETED`) OR explicitly bypassed (`soak_period.state = BYPASSED`). |
| **Owner** | engineCapabilityIntelligence (entry — writes EVALUATING on first capability submission). engineDecisionReadiness (soak management and exit — writes READY_TO_ACT on soak completion/bypass). |
| **Must not happen** | No transition to READY_TO_ACT without soak resolution. No journey creation. No automatic soak initiation — soak must be explicitly initiated by engineDecisionReadiness `initiate_soak` action. |

**Sub-state authority during EVALUATING:**

| `soak_period.state` | Meaning | Authority |
|---------------------|---------|-----------|
| `NOT_STARTED` | Soak not yet initiated | Default (profileBootstrap / engineDecisionReadiness) |
| `SOAKING` | Soak period in progress | engineDecisionReadiness `initiate_soak` |
| `COMPLETED` | Soak completed normally | engineDecisionReadiness `complete_soak` |
| `BYPASSED` | Soak explicitly bypassed (auditable) | engineDecisionReadiness `bypass_soak` (requires bypass_reason) |

`tos_phase` remains `EVALUATING` throughout all soak sub-states. `soak_period.state` is the sole authority on soak status.

---

### State 5: READY_TO_ACT

| Field | Value |
|-------|-------|
| **User meaning** | "I know what I'm good at, I know my options, I've thought about it. I'm ready to do something." |
| **Engineering meaning** | Soak Period resolved. Capabilities evidenced. Pathways matched. Decision factors expressed. User is ready to begin transition. |
| **Entry condition** | engineDecisionReadiness `complete_soak` or `bypass_soak` action. Writes `tos_phase = 'READY_TO_ACT'`. |
| **Exit condition** | engineTransitionPartnership `start_journey` action creates a TransitionJourney. |
| **Owner** | engineDecisionReadiness (entry). engineTransitionPartnership (exit). |
| **Must not happen** | No automatic journey creation. `start_journey` must be explicitly called. No regression to EVALUATING. |

---

### State 6: IN_TRANSITION

| Field | Value |
|-------|-------|
| **User meaning** | "I'm doing it. I'm taking steps, making commitments, working with Smudge to navigate the transition." |
| **Engineering meaning** | TransitionJourney is active. `partnership_state` is ACTIVE, MONITORING, SUPPORT_REQUIRED, or REFERRAL. Commitments, milestones, blockers are being tracked. |
| **Entry condition** | engineTransitionPartnership `start_journey` action. Creates TransitionJourney with `partnership_state: 'ACTIVE'`. Writes `tos_phase = 'IN_TRANSITION'`. |
| **Exit condition** | Partnership state transitions to INDEPENDENT (journey concluded). |
| **Owner** | engineTransitionPartnership — owns all partnership state transitions, commitment management, milestone tracking, wellbeing awareness, referrals. |
| **Must not happen** | No automatic conclusion. No regression to READY_TO_ACT. Partnership state transitions must follow the validated state machine (ACTIVE → MONITORING → SUPPORT_REQUIRED → REFERRAL → INDEPENDENT). |

---

### State 7: SETTLED

| Field | Value |
|-------|-------|
| **User meaning** | "I've got this. I'm settled. I know where I am and I can navigate from here." |
| **Engineering meaning** | TransitionJourney concluded. `partnership_state = INDEPENDENT`. The user has demonstrated sustained confidence, stability, and self-direction. |
| **Entry condition** | engineTransitionPartnership `conclude_journey` action OR `update_partnership_state` with `new_state = 'INDEPENDENT'`. Writes `tos_phase = 'SETTLED'`. |
| **Exit condition** | Terminal. If the user returns, a new journey begins. profileBootstrap would need to handle the return-journey case (not yet implemented). |
| **Owner** | engineTransitionPartnership — owns the conclusion. |
| **Must not happen** | No automatic settlement. INDEPENDENT is terminal for the partnership state machine. No regression. |

---

## C. STATE TRANSITION TABLE

| # | From | To | Trigger | Evidence Required | Writer/Owner | Forbidden |
|---|------|-----|---------|-------------------|-------------|-----------|
| T1 | (none) | EXPLORING | profileBootstrap creates profile | Authenticated user exists | profileBootstrap | N/A |
| T2 | EXPLORING | CONFIRMING | All six operational areas have substance + user_confidence set | Q1–Q6 has_substance = true, user_confidence !== null | engineUnderstanding / companionService | Auto-advance on field count alone; advance without user_confidence |
| T3 | CONFIRMING | CONFIRMED | Explicit user confirmation ("Yes, that's me") | `operational_picture_confirmed = true` set by user action | companionService | AI-inferred confirmation; auto-advance on assessment_confidence score; engineUnderstanding writing CONFIRMED |
| T4 | CONFIRMED | EVALUATING | First capability successfully submitted with valid evidence | At least 1 accepted capability with evidence_refs resolving to evidence_log | engineCapabilityIntelligence | Capability evaluation without confirmed picture; auto-advance without capability submission |
| T5 | EVALUATING | (EVALUATING + soak_period.state = SOAKING) | engineDecisionReadiness `initiate_soak` action | `soak_period.state = NOT_STARTED`, `tos_phase = EVALUATING`, decision factors recorded | engineDecisionReadiness | Automatic soak initiation; soak without decision factors |
| T6 | EVALUATING + SOAKING | READY_TO_ACT | Soak completed OR explicitly bypassed | `soak_period.state = COMPLETED` (with reflection_notes) OR `BYPASSED` (with bypass_reason) | engineDecisionReadiness | Auto-completion after time threshold; bypass without reason |
| T7 | READY_TO_ACT | IN_TRANSITION | engineTransitionPartnership `start_journey` action | `tos_phase = READY_TO_ACT`, `soak_period.state = COMPLETED or BYPASSED`, `capability_map` populated | engineTransitionPartnership | Auto-journey creation; journey without capabilities |
| T8 | IN_TRANSITION | SETTLED | Partnership state → INDEPENDENT | `partnership_state = INDEPENDENT`, `journey_concluded_date` set, `conclusion_summary` recorded | engineTransitionPartnership | Auto-conclusion; conclusion without INDEPENDENT transition |

**Note on T2:** The current code has two thresholds:
- `minimumUnderstanding` (Q1–Q4 substantive) — used for phase advancement
- `allCoreAreasSubstantive` (Q1–Q6 substantive) — used for `readyForConfirmation`

The canonical contract uses the **all-six** threshold for EXPLORING → CONFIRMING, aligning with companionService's `readyToReflect` logic. The Q1–Q4 threshold is an internal developmental concept that should not gate the persisted lifecycle.

**Note on T5:** This is NOT a `tos_phase` transition. `tos_phase` stays `EVALUATING`. Only `soak_period.state` changes from `NOT_STARTED` to `SOAKING`. Included in the table for completeness.

---

## D. INTERNAL TERM MAPPING

| Internal Term | Current Usage | Classification | Canonical Mapping |
|---------------|--------------|----------------|-------------------|
| `Discover` | engineUnderstanding checks `tos_phase === 'Discover'` for phase advancement | **INTERNAL ONLY — must not be persisted** | Maps to persisted `EXPLORING` |
| `Understand` | engineUnderstanding writes `tos_phase = 'Understand'` | **INTERNAL ONLY — must not be persisted** | Maps to persisted `CONFIRMING` (minimum understanding reached, picture ready for reflection) |
| `Evaluate` | engineCapabilityIntelligence writes `tos_phase = 'Evaluate'` | **INTERNAL ONLY — must not be persisted** | Maps to persisted `EVALUATING` |
| `REFLECTING` | companionService conversation mode | **INTERNAL ONLY — conversational mode, not persisted in tos_phase** | Maps to `tos_phase = CONFIRMING` (picture being presented) |
| `RE_EXPLORING` | companionService conversation mode | **INTERNAL ONLY — conversational mode, not persisted in tos_phase** | Maps to `tos_phase = CONFIRMING` (user corrected, exploring gap, lifecycle hasn't regressed) |

**Key doctrinal point on `Understand`:** `Understand` does NOT map to `CONFIRMED`. The transition from CONFIRMING to CONFIRMED requires explicit user confirmation. `Understand` means "minimum understanding reached" — the picture has substance. It does NOT mean the user has confirmed it. The mapping is:

- `Understand` (minimum understanding) → `CONFIRMING` (persisted — picture ready for reflection)
- User confirmation → `CONFIRMED` (persisted — user agreed the picture is accurate)

**CompanionService conversation modes** (`EXPLORING`, `REFLECTING`, `CONFIRMING`, `CONFIRMED`, `RE_EXPLORING`) are conversational states that track the flow of the conversation. They are related to but not identical to `tos_phase` values. The conversation mode is more granular — multiple conversation modes can map to a single `tos_phase` value. The conversation mode informs when to transition `tos_phase`, but the two are separate concepts.

---

## E. ENGINE OWNERSHIP MATRIX

| Function | States it reads (valid entry phases) | States it writes | Transitions it owns | Transitions it must NEVER write |
|----------|--------------------------------------|-----------------|---------------------|-------------------------------|
| **profileBootstrap** | None (creates new) | `EXPLORING` | (none) → EXPLORING | Any state other than EXPLORING |
| **engineUnderstanding** | `EXPLORING`, `CONFIRMING` | `CONFIRMING` (from EXPLORING, when all six areas substantive) | EXPLORING → CONFIRMING | CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED |
| **companionService** | `EXPLORING`, `CONFIRMING`, `CONFIRMED` | `CONFIRMING` (from EXPLORING, when all six areas substantive), `CONFIRMED` (from CONFIRMING, when user confirms) | EXPLORING → CONFIRMING, CONFIRMING → CONFIRMED | EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED |
| **engineCapabilityIntelligence** | `CONFIRMED` | `EVALUATING` (on first capability submission) | CONFIRMED → EVALUATING | EXPLORING, CONFIRMING, CONFIRMED, READY_TO_ACT, IN_TRANSITION, SETTLED |
| **engineDecisionReadiness** | `EVALUATING`, `READY_TO_ACT` | `READY_TO_ACT` (on soak completion/bypass) | EVALUATING → READY_TO_ACT (via soak) | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING (does not write EVALUATING — that's Capability Intelligence), IN_TRANSITION, SETTLED |
| **engineTransitionPartnership** | `READY_TO_ACT`, `IN_TRANSITION` | `IN_TRANSITION` (on start_journey), `SETTLED` (on conclude_journey) | READY_TO_ACT → IN_TRANSITION, IN_TRANSITION → SETTLED | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING, READY_TO_ACT |
| **pilotAccountReset** | Any (admin tool) | `EXPLORING` (reset) | Any → EXPLORING (admin reset only) | N/A — admin tool, not part of natural chain |

**Important:** engineUnderstanding and companionService both own the EXPLORING → CONFIRMING transition. This is intentional — engineUnderstanding performs the deterministic substance check, and companionService performs the same check when processing discoveries. In practice, companionService is the primary entry point (Smudge calls it), and engineUnderstanding may be called directly for assessment-only updates. Both must use the same threshold (all six areas substantive). No conflict exists because both write the same value (`CONFIRMING`).

**Important:** companionService exclusively owns the CONFIRMING → CONFIRMED transition. engineUnderstanding may set `operational_picture_confirmed = true` (via `confirm_operational_picture` parameter), but it must NOT write `tos_phase = CONFIRMED`. Only companionService writes CONFIRMED, because confirmation is a user action mediated by the conversational layer.

Wait — this needs clarification. Currently, engineUnderstanding accepts `confirm_operational_picture` and sets `operational_picture_confirmed = true`. But it keeps `tos_phase` at 'Understand'. In the canonical contract, engineUnderstanding should set `operational_picture_confirmed = true` but NOT advance `tos_phase` to CONFIRMED. Only companionService should advance to CONFIRMED.

But what if engineUnderstanding is called directly (not through companionService) with `confirm_operational_picture: true`? Should it advance to CONFIRMED? 

I think NO. The confirmation is a user action that should be mediated by the conversational layer. engineUnderstanding can set the boolean flag, but the lifecycle transition should be companionService's authority. This preserves the "User Decides" doctrine — the lifecycle reflects user decisions, not engine calculations.

---

## F. CF-1 RESOLUTION DESIGN

**Problem:** profileBootstrap writes `EXPLORING`. engineUnderstanding checks `tos_phase === 'Discover'` to advance. The check never matches. Phase never advances.

**Conceptual fix:**

1. **engineUnderstanding** should check `existing.tos_phase === 'EXPLORING'` instead of `'Discover'`.

2. When all six operational areas have substance, engineUnderstanding should write `tos_phase = 'CONFIRMING'` instead of `'Understand'`.

3. **companionService** should check `profile.tos_phase === 'EXPLORING'` instead of `'Discover'`.

4. When all six areas have substance, companionService should write `tos_phase = 'CONFIRMING'` instead of `'Understand'`.

5. The internal term `Discover` may remain as a conversational concept (companionService conversation mode `EXPLORING` already covers this) but must never be used as a persisted `tos_phase` value.

6. The internal term `Understand` may remain as an engine-internal concept meaning "minimum understanding reached" but must never be persisted as `tos_phase`. The persisted value is `CONFIRMING`.

**Summary:** Two one-line mappings per engine:
- Check: `'Discover'` → `'EXPLORING'`
- Write: `'Understand'` → `'CONFIRMING'`

No new logic required. No new states. No doctrinal change.

---

## G. CF-2 RESOLUTION DESIGN

**Problem:** engineCapabilityIntelligence writes `tos_phase = 'Evaluate'`. engineDecisionReadiness checks for `'EVALUATING'`. String mismatch → hard rejection.

**Conceptual fix:**

1. **engineCapabilityIntelligence** should write `tos_phase = 'EVALUATING'` instead of `'Evaluate'` in all locations (lines 432 and 504).

2. The `advance_phase` action's check `existing.tos_phase === 'Evaluate'` (line 496) should check for `'EVALUATING'`.

3. The internal term `Evaluate` may remain as an engine-internal concept (the action name `advance_phase` and the concept of "evaluating capabilities") but must never be persisted as `tos_phase`.

4. The exact event that permits the move into `EVALUATING` is: **first capability successfully submitted with valid evidence references** via the `submit_capabilities` action. This is already the trigger — it just writes the wrong string.

**Additional recommendation:** Add `tos_phase` precondition to engineCapabilityIntelligence. Currently it checks `operational_picture_confirmed`, `assessment_confidence`, `evidence_log`, and `service_history` — but NOT `tos_phase`. The canonical contract should require `tos_phase === 'CONFIRMED'` as a precondition for capability submission. This makes the lifecycle the authoritative gate, not just the boolean flag.

**Summary:** Two one-line string changes (`'Evaluate'` → `'EVALUATING'`) plus one precondition addition (`tos_phase === 'CONFIRMED'` required).

---

## H. SOAK CONTRACT

### Relationship between `tos_phase` and `soak_period.state`

**Two separate authorities, non-overlapping:**

| Field | Authority over | Values |
|-------|----------------|--------|
| `tos_phase` | Macro lifecycle phase | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED |
| `soak_period.state` | Soak Period sub-state (within EVALUATING) | NOT_STARTED, SOAKING, COMPLETED, BYPASSED |

**Rules:**

1. `tos_phase` never includes `SOAKING`. The schema enum is correct as-is.

2. During the soak period:
   - `tos_phase = EVALUATING`
   - `soak_period.state = SOAKING`

3. The soak period is a sub-state of EVALUATING, not a separate lifecycle phase. It is initiated, completed, or bypassed within the EVALUATING phase.

4. `tos_phase` advances from `EVALUATING` to `READY_TO_ACT` ONLY when `soak_period.state` is `COMPLETED` or `BYPASSED`.

5. `soak_period.state` is NEVER set by any function other than engineDecisionReadiness.

6. If `tos_phase` is not `EVALUATING`, `soak_period.state` has no lifecycle meaning. pilotAccountReset resets both to their defaults (`EXPLORING` / `NOT_STARTED`).

**Why SOAKING is NOT a `tos_phase` value:**

Adding SOAKING to `tos_phase` would create two sources of truth for the same concept. If `tos_phase = SOAKING` and `soak_period.state = SOAKING` ever diverge (due to a bug, partial write, or race condition), the system has no way to determine which is authoritative. The current design avoids this by giving each field a distinct responsibility.

The order's proposed state machine (section 13) includes SOAKING as a `tos_phase` state. I challenge this and recommend the two-field design be preserved.

---

## I. INVALID TRANSITION POLICY

**Proposed pattern: Reject with clear precondition failure.**

Every engine that has a `tos_phase` precondition should:

1. Check `tos_phase` against its valid entry phases.
2. If `tos_phase` is not in the valid set, return HTTP 400 with:
   - The current `tos_phase` value
   - The required `tos_phase` value(s)
   - A clear message: `"Precondition failed: [Engine] requires tos_phase [X]. Current phase: [Y]"`
3. Never silently correct the phase.
4. Never auto-advance the phase.
5. Never proceed with privileged processing.

**Current compliance:**

| Engine | Has tos_phase precondition? | Pattern |
|--------|---------------------------|---------|
| engineUnderstanding | No | Should add: require EXPLORING or CONFIRMING |
| companionService | No | Should add: require EXPLORING, CONFIRMING, or CONFIRMED |
| engineCapabilityIntelligence | No | Should add: require CONFIRMED |
| engineDecisionReadiness | **Yes** ✅ | Checks `['EVALUATING', 'READY_TO_ACT']` — returns 400 |
| engineTransitionPartnership | **Yes** ✅ | Checks `'READY_TO_ACT'` — returns 400 |

**Recommendation:** Add `tos_phase` preconditions to the three engines that currently lack them (Understanding, Companion, Capability Intelligence). This makes the lifecycle the authoritative gate across the entire chain, not just the late engines.

---

## J. CANONICAL STATE MACHINE

```
                    profileBootstrap
                          │
                          ▼
                     EXPLORING
                          │
                  [all six areas substantive
                   + user_confidence set]
                          │
                          ▼
                     CONFIRMING
                          │
                  [explicit user confirmation
                   "Yes, that's me"]
                          │
                          ▼
                     CONFIRMED
                          │
                  [first capability submitted
                   with valid evidence]
                          │
                          ▼
          ┌─────→ EVALUATING ←─────────────────────┐
          │              │                          │
          │     [initiate_soak action]              │
          │              │                          │
          │              ▼                          │
          │     soak_period.state = SOAKING         │
          │     (tos_phase remains EVALUATING)      │
          │              │                          │
          │     [complete_soak or bypass_soak]      │
          │              │                          │
          │              ▼                          │
          │     soak_period.state = COMPLETED        │
          │     or BYPASSED                          │
          │              │                          │
          └──────────────┘                          │
                         │                          │
                [tos_phase advances]                │
                         │                          │
                         ▼                          │
                    READY_TO_ACT                    │
                         │                          │
                 [start_journey action]             │
                         │                          │
                         ▼                          │
                   IN_TRANSITION                     │
                         │                          │
                [partnership_state                  │
                 → INDEPENDENT]                      │
                         │                          │
                         ▼                          │
                      SETTLED (terminal)            │
                                                   │
    RE_EXPLORING (conversation mode): user corrects │
    during CONFIRMING → returns to EXPLORING         │
    behaviour, tos_phase stays CONFIRMING            │
    until gaps filled, then back to CONFIRMING ─────┘
```

**Persisted `tos_phase` values (7 — matching current schema enum):**

```
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED
```

**SOAKING is NOT a `tos_phase` value.** It is a `soak_period.state` sub-state within EVALUATING.

---

## K. IMPLEMENTATION IMPACT

Minimum code changes required once contract is approved. No implementation in this packet.

### 1. engineUnderstanding.ts

| Change | Type | Risk |
|--------|------|------|
| Line 269: `existing.tos_phase === 'Discover'` → `existing.tos_phase === 'EXPLORING'` | One-line mapping | Low |
| Line 270: `newPhase = 'Understand'` → `newPhase = 'CONFIRMING'` | One-line mapping | Low |
| Line 273: `existing.tos_phase === 'Understand'` → `existing.tos_phase === 'CONFIRMING'` | One-line mapping | Low |
| Line 275: `newPhase = 'Understand'` → `newPhase = 'CONFIRMING'` (stays — confirmation doesn't advance phase) | One-line mapping | Low |
| Add `tos_phase` precondition: reject if not `EXPLORING` or `CONFIRMING` | New logic (~5 lines) | Medium — must not break existing callers |

**Total:** 4 one-line mappings + 1 precondition addition. No deeper behaviour change.

### 2. companionService.ts

| Change | Type | Risk |
|--------|------|------|
| Line 340: `profile.tos_phase === 'Discover'` → `profile.tos_phase === 'EXPLORING'` | One-line mapping | Low |
| Line 340: `newPhase = 'Understand'` → `newPhase = 'CONFIRMING'` | One-line mapping | Low |
| Add logic: when `user_response_type === 'confirming'` and `engineResult.can_proceed`, write `tos_phase = 'CONFIRMED'` | New logic (~3 lines) | Medium — this is the CONFIRMING → CONFIRMED transition, doctrinally critical |
| Add `tos_phase` precondition: reject if not `EXPLORING`, `CONFIRMING`, or `CONFIRMED` | New logic (~5 lines) | Low |

**Total:** 2 one-line mappings + 1 transition addition + 1 precondition addition.

### 3. engineCapabilityIntelligence.ts

| Change | Type | Risk |
|--------|------|------|
| Line 432: `tos_phase: 'Evaluate'` → `tos_phase: 'EVALUATING'` | One-line mapping | Low |
| Line 496: `existing.tos_phase === 'Evaluate'` → `existing.tos_phase === 'EVALUATING'` | One-line mapping | Low |
| Line 504: `tos_phase: 'Evaluate'` → `tos_phase: 'EVALUATING'` | One-line mapping | Low |
| Add `tos_phase` precondition: require `CONFIRMED` for `submit_capabilities` and `advance_phase` | New logic (~5 lines) | Medium — must not block legitimate capability submission |

**Total:** 3 one-line mappings + 1 precondition addition.

### 4. engineDecisionReadiness.ts

| Change | Type | Risk |
|--------|------|------|
| None required | — | — |

Already uses schema enum values. Already has `tos_phase` preconditions. Already correctly separates `tos_phase` and `soak_period.state`.

### 5. engineTransitionPartnership.ts

| Change | Type | Risk |
|--------|------|------|
| None required | — | — |

Already uses schema enum values. Already has `tos_phase` preconditions.

### 6. profileBootstrap.ts

| Change | Type | Risk |
|--------|------|------|
| None required | — | — |

Already writes `EXPLORING`.

### 7. pilotAccountReset.ts

| Change | Type | Risk |
|--------|------|------|
| None required | — | — |

Already writes `EXPLORING`.

### Summary

| Function | One-line mappings | New logic | Risk |
|----------|------------------|-----------|------|
| engineUnderstanding | 4 | 1 precondition | Low-Medium |
| companionService | 2 | 1 transition + 1 precondition | Medium |
| engineCapabilityIntelligence | 3 | 1 precondition | Low-Medium |
| engineDecisionReadiness | 0 | 0 | None |
| engineTransitionPartnership | 0 | 0 | None |
| profileBootstrap | 0 | 0 | None |
| pilotAccountReset | 0 | 0 | None |
| **Total** | **9** | **4** | **Low overall** |

The companionService CONFIRMING → CONFIRMED transition is the most doctrinally significant change. It must be implemented carefully to ensure that only explicit user confirmation advances the lifecycle.

---

## L. DOCTRINAL CHECK

### 1. Does the contract preserve Understand Before Advising?

**YES.** No capability evaluation, pathway matching, or transition planning can occur until the Operational Picture is confirmed (CONFIRMED). The six-area substance threshold gates entry to CONFIRMING. Explicit user confirmation gates entry to CONFIRMED. Capability Intelligence cannot run until CONFIRMED. Decision Readiness cannot run until EVALUATING. Transition Partnership cannot run until READY_TO_ACT.

The chain is strictly sequential: Understanding → Confirmation → Capability → Decision → Transition. No phase may skip its predecessor.

### 2. Does the contract preserve User Decides?

**YES.** The CONFIRMING → CONFIRMED transition is the critical user-decision boundary. No engine may infer confirmation. No assessment score can auto-advance the lifecycle past CONFIRMING. Only explicit user confirmation (`user_response_type: 'confirming'` via companionService) writes `tos_phase = CONFIRMED`.

Similarly, the soak period is user-initiated and user-completed (or explicitly bypassed with reason). The journey is explicitly started. The journey is explicitly concluded.

Every major lifecycle transition requires either explicit user action or explicit engine invocation. No silent advancement.

### 3. Does the contract preserve the Evidence Rule?

**YES.** Capability submission requires evidence_refs that resolve to evidence_log entries (enforced by engineCapabilityIntelligence). Decision factors require evidence_refs (enforced by engineDecisionReadiness). The capability_map and confidence_scores are evidence-backed.

The lifecycle contract reinforces this: no capability evaluation until the Operational Picture is confirmed (which requires substantive content across all six areas). No decision readiness until capabilities are evidenced.

### 4. Does the contract avoid engine proliferation?

**YES.** The ownership matrix is explicit. Each engine has a defined set of states it may read, states it may write, and transitions it owns. No engine may write a state outside its authority. This prevents future engines from accidentally (or deliberately) advancing the lifecycle outside their phase.

The three engines that currently lack `tos_phase` preconditions (Understanding, Companion, Capability Intelligence) will gain them, creating a uniform boundary across the chain.

### 5. Does the contract keep Transition more than Employment?

**YES.** The SETTLED state is defined as "I've got this. I'm settled. I know where I am and I can navigate from here." — not "I got a job." The TransitionJourney tracks commitments, milestones, blockers, wellbeing, and referrals — not just employment status. The `partnership_state` machine (ACTIVE → MONITORING → SUPPORT_REQUIRED → REFERRAL → INDEPENDENT) reflects a holistic transition, not just a job placement.

The journey concludes when the individual has demonstrated sustained confidence, stability, and self-direction — not when they've secured employment.

---

## M. DISAGREEMENTS / UNCERTAINTY

### D-1: SOAKING as `tos_phase` — CHALLENGE RAISED

The order's section 3 lists SOAKING as a persisted lifecycle value and section 13 proposes it as a `tos_phase` state. I recommend against this. The current two-field design (tos_phase + soak_period.state) is correct, proven, and avoids dual-source-of-truth risk.

**Decision required from Paul + Cipher:** Should SOAKING be added to the `tos_phase` enum, or kept as a `soak_period.state` sub-state?

### D-2: EXPLORING → CONFIRMING threshold

The current code has two thresholds: Q1–Q4 (minimumUnderstanding) and Q1–Q6 (readyForConfirmation). I recommend using the all-six threshold (Q1–Q6) for the persisted lifecycle transition.

**Question for Paul + Cipher:** Is the all-six threshold doctrinally correct? Or should the lifecycle advance to CONFIRMING when only Q1–Q4 have substance, with Q5–Q6 explored during the reflection phase?

### D-3: engineUnderstanding and companionService dual ownership of EXPLORING → CONFIRMING

Both engines can advance the lifecycle from EXPLORING to CONFIRMING. I recommend this remains — both perform the same substance check and write the same value. No conflict.

**Question for Paul + Cipher:** Is dual ownership acceptable, or should only one engine own this transition?

### D-4: engineUnderstanding setting `operational_picture_confirmed` without advancing tos_phase

Currently, engineUnderstanding can set `operational_picture_confirmed = true` via the `confirm_operational_picture` parameter. In the canonical contract, I recommend it continues to set this flag but does NOT write `tos_phase = CONFIRMED`. Only companionService writes CONFIRMED.

**Question for Paul + Cipher:** Is this the correct ownership boundary? Or should engineUnderstanding be stripped of the confirmation parameter entirely?

### D-5: Return journey from SETTLED

The schema treats SETTLED as terminal, but a user may return. The current design does not handle the return-journey case (SETTLED → EXPLORING for a new journey).

**Question for Paul + Cipher:** Is the return-journey case in scope for MVP pilot, or deferred?

---

## N. PACKET 2B VERDICT

### PACKET 2B — CONTRACT READY WITH DECISIONS REQUIRED

The canonical lifecycle contract is fully defined and doctrinally validated. The implementation impact is small (9 one-line mappings + 4 small logic additions). No deep behaviour changes required.

**Five decisions are required from Paul + Cipher before implementation authority can be released:**

1. **D-1:** SOAKING as `tos_phase` or `soak_period.state` (I recommend `soak_period.state`)
2. **D-2:** All-six threshold or Q1–Q4 threshold for EXPLORING → CONFIRMING (I recommend all-six)
3. **D-3:** Dual ownership of EXPLORING → CONFIRMING acceptable (I recommend yes)
4. **D-4:** engineUnderstanding may set `operational_picture_confirmed` but not write `tos_phase = CONFIRMED` (I recommend yes)
5. **D-5:** Return journey from SETTLED in scope for MVP (I recommend deferred)

Once these five decisions are made, the contract is ready for implementation in Packet 2C.

---

**STOP.**

No lifecycle implementation. Packet 2C remains LOCKED. Serialization remains LOCKED. Smudge Integration remains LOCKED. MATE remains PRIVATE.

The lifecycle contract must be agreed by Paul (Product Owner), Cipher (Doctrine/Experience), and Ash (Chief Engineer) before code authority is released.

**NO ADVANCEMENT WITHOUT EVIDENCE.**

**ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.**

*Ash — Chief Engineer — 16 August 2026*
