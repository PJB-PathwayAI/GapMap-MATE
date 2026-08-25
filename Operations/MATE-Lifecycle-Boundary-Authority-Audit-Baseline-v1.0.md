# MATE Lifecycle Boundary & Authority Audit — Engineering Baseline

**Document type:** Engineering Baseline (read-only reconnaissance)
**Date:** 25 August 2026
**Author:** Ash (Engineering)
**Status:** COMPLETE — no remediation authorised
**Purpose:** Factual input to the Lifecycle Boundary & Authority Audit conducted by Paul (Founder) and Cipher (Doctrine)

**Terminology note:** States beyond CONFIRMING (CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED) are described as "conversationally unsupported" or "dead-ended in the current orchestrator." This means Smudge cannot currently converse with users in these states. The underlying engines for several of these phases are implemented, tested, and guarded — they are simply not wired into the conversational layer. The phases are not dead; the railway between them has not yet been built.

---

## Reading Guide

- **[PROVEN]** = directly observed in deployed code
- **[INFERENCE]** = reasonable deduction from code, not directly observed
- **[NEEDS LIVE TEST]** = cannot be determined from static analysis alone

---

## 1. Current Lifecycle Map

### 1.1 Primary Lifecycle (UserProfile.tos_phase)

[PROVEN] The tos_phase enum in UserProfile.json defines seven values:

EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED

[PROVEN] The schema doc (UserProfile_Schema_v1.2.md) documents only five values:
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT
The description field says: "Phase Five adds IN_TRANSITION (partnership active) and SETTLED (partnership concluded, individual independent)."

[PROVEN] SOAKING is NOT a tos_phase value. It lives in soak_period.state. During soak: tos_phase = EVALUATING, soak_period.state = SOAKING.

### 1.2 Sub-State Machines

[PROVEN] soak_period.state (on UserProfile):
NOT_STARTED → SOAKING → COMPLETED | BYPASSED

[PROVEN] partnership_state (on TransitionJourney):
ACTIVE → MONITORING | SUPPORT_REQUIRED | REFERRAL → INDEPENDENT (terminal)

### 1.3 Conversational Mode

[PROVEN] ConversationState.conversation_mode enum: understanding | helping | transitioning

[PROVEN] companionCore runtime mode (in-memory, NOT persisted as tos_phase):
EXPLORING | REFLECTING | CONFIRMING | CONFIRMED | RE_EXPLORING
RE_EXPLORING is conversational only — NOT a valid tos_phase enum value.

### 1.4 Complete Reachable MVP Lifecycle

EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED
                             │
                        soak_period.state
                        NOT_STARTED → SOAKING → COMPLETED/BYPASSED

No other states, sub-states, or terminal conditions exist.

---

## 2. State Transitions — Engineering Truth

### 2.1 [UNINITIALIZED] → EXPLORING

- Source: No profile exists
- Destination: EXPLORING
- Trigger: profileBootstrap.ts — UserProfile.list() returns empty → create with tos_phase: "EXPLORING"
- Trigger type: Deterministic + user action (first login)
- User intent required: NO — automatic
- Owner: profileBootstrap.ts (standalone API)
- Persisted: New UserProfile with EXPLORING, all defaults
- Smudge after: Nothing — dashboard function, not conversational
- [PROVEN] Orchestrator also auto-creates if no profile found during chat (entry.ts line 805)

### 2.2 EXPLORING → CONFIRMING

- Source: EXPLORING
- Destination: CONFIRMING
- Trigger: smudgeOrchestrator.ts lines 1330-1346 — sufficiency gate returns sufficient===true AND deterministic floor passes → UserProfile.update(id, { tos_phase: "CONFIRMING" })
- Trigger type: LLM interpretation (sufficiency gate) + deterministic logic (floor check)
- User intent required: NO. Sufficiency gate evaluates whether Smudge has enough to reflect, NOT whether user wants to advance.
- Owner: smudgeOrchestrator.ts (writes directly via base44.asServiceRole)
- Persisted: tos_phase: "CONFIRMING"
- Smudge after: Generation receives lifecycle_transition and ready_to_confirm. Fallback: "I think I've got a decent picture... can I tell you what I'm picking up?"
- [PROVEN] Sufficiency gate prompt: "True if you understand enough of this person to reflect your understanding back usefully and honestly" — system judgement, not user decision
- [PROVEN] Deterministic floor: minAreasWithSubstance: 2, requiresUserObjective: true
- [PROVEN] companionCore has parallel sufficiencyResult parameter (dead code — orchestrator does NOT pass it)

### 2.3 CONFIRMING → CONFIRMED

- Source: CONFIRMING
- Destination: CONFIRMED
- Trigger: companionCore.ts line 370 — userResponseType==='confirming' && userConfirmed && tos_phase==='CONFIRMING' → newPhase='CONFIRMED' → persisted via callback
- Trigger type: LLM interpretation (classifies user text as 'confirming') + deterministic (phase check)
- User intent required: PARTIALLY. LLM classifies "explicit unambiguous affirmation" — but this confirms reflection ACCURACY, not readiness to ADVANCE. This is the SMUDGE 5 conflation.
- Owner: companionCore.ts (via persist callback)
- Persisted: tos_phase: "CONFIRMED", operational_picture_confirmed: true, merged discoveries, assessment_confidence
- Smudge after: Generation receives lifecycle_transition and confirmed=true. Fallback: "That's great — I've got your picture confirmed."
- [PROVEN] safeUserResponseType (line 352) downgrades confirming/rejecting to 'answering' if NOT in CONFIRMING phase
- [PROVEN] Dummy payload workaround: when user says "yes" with no extractable content, orchestrator creates h = { years_served: profile.years_served ?? 0 } so companionCore can process

### 2.4 CONFIRMED → EVALUATING

- Source: CONFIRMED (or legacy 'Evaluate')
- Destination: EVALUATING
- Trigger: engineCapabilityIntelligence.ts — action=submit_capabilities or advance_phase → UserProfile.update(id, { tos_phase: 'EVALUATING' })
- Trigger type: Deterministic logic (precondition checks + action parameter)
- User intent required: NO at engine level. Checks data completeness, not user intent.
- Owner: engineCapabilityIntelligence.ts (standalone API)
- Persisted: tos_phase: 'EVALUATING', capability_map, confidence_scores
- Smudge after: Nothing. Not reachable from Smudge.
- [PROVEN] Preconditions: operational_picture_confirmed===true, assessment_confidence.rating in HIGH/MODERATE, non-empty evidence_log, valid evidence_refs

### 2.5 EVALUATING → READY_TO_ACT (Soak Completion)

- Source: EVALUATING with soak_period.state=SOAKING
- Destination: READY_TO_ACT with soak_period.state=COMPLETED
- Trigger: engineDecisionReadiness.ts — action=complete_soak → validates SOAKING, ≥1 pathway, ≥1 expressed decision factor, reflection_notes≥15 chars
- Trigger type: Deterministic logic
- User intent required: PARTIALLY. Requires substantive reflection_notes and expressed factors, but validates data completeness not user readiness.
- Owner: engineDecisionReadiness.ts (standalone API)
- Persisted: tos_phase: 'READY_TO_ACT', soak_period: { state: 'COMPLETED', completed_date, reflection_notes }
- Smudge after: Nothing. Not reachable from Smudge.

### 2.6 EVALUATING → READY_TO_ACT (Soak Bypass)

- Source: EVALUATING with soak_period.state=SOAKING
- Destination: READY_TO_ACT with soak_period.state=BYPASSED
- Trigger: engineDecisionReadiness.ts — action=bypass_soak → validates bypass_reason≥10 chars, SOAKING state, ≥1 pathway, ≥1 expressed factor
- Trigger type: Deterministic logic
- User intent required: PARTIALLY. Requires descriptive bypass_reason (explicit auditable action).
- Owner: engineDecisionReadiness.ts (standalone API)
- Persisted: tos_phase: 'READY_TO_ACT', soak_period: { state: 'BYPASSED', bypassed_date, bypass_reason }
- Smudge after: Nothing. Not reachable from Smudge.

### 2.7 READY_TO_ACT → IN_TRANSITION

- Source: READY_TO_ACT
- Destination: IN_TRANSITION
- Trigger: engineTransitionPartnership.ts — action=start_journey → validates tos_phase===READY_TO_ACT, soak completed/bypassed, non-empty capability_map → creates TransitionJourney (ACTIVE) → UserProfile.update(id, { tos_phase: 'IN_TRANSITION' })
- Trigger type: Deterministic logic
- User intent required: NO at engine level. Checks state completeness.
- Owner: engineTransitionPartnership.ts (standalone API)
- Persisted: UserProfile.tos_phase: 'IN_TRANSITION', new TransitionJourney with partnership_state: 'ACTIVE'
- Smudge after: Nothing. Not reachable from Smudge.

### 2.8 IN_TRANSITION → SETTLED

- Source: IN_TRANSITION
- Destination: SETTLED (terminal)
- Trigger: engineTransitionPartnership.ts — action=conclude_journey OR update_partnership_state with new_state=INDEPENDENT → validates reason/summary≥15 chars → UserProfile.update(id, { tos_phase: 'SETTLED' })
- Trigger type: Deterministic logic
- User intent required: PARTIALLY. Requires substantive reason documenting basis for independence.
- Owner: engineTransitionPartnership.ts (standalone API)
- Persisted: UserProfile.tos_phase: 'SETTLED', TransitionJourney: partnership_state=INDEPENDENT, conclusion_summary, JourneyCheckpoint snapshot
- Smudge after: Nothing. Not reachable from Smudge.

### 2.9 [ANY] → EXPLORING (Reset)

- Source: Any state
- Destination: EXPLORING
- Trigger: pilotAccountReset.ts — explicit POST → deletes JourneyCheckpoint/TransitionJourney records, resets UserProfile
- Trigger type: Explicit admin/tester action
- User intent required: YES (explicit action)
- Owner: pilotAccountReset.ts (standalone API)
- Smudge after: Nothing. Not conversational.

---

## 3. Conversational Coverage by State

[PROVEN] Phase routing (line 953):
if (currentPhase !== "EXPLORING" && currentPhase !== "CONFIRMING") {
  return PHASE_OUT_OF_SCOPE static response — conversationally unsupported in current orchestrator
}

This is a hard binary. Five of seven states get a static response.

| State | Coverage | Classification | Evidence |
|---|---|---|---|
| EXPLORING | Full pipeline: safety → extraction → sufficiency → companionCore → generation | SUPPORTED | [PROVEN] |
| CONFIRMING | Full pipeline with confirmation logic | SUPPORTED | [PROVEN] |
| CONFIRMED | Static: "I'm still learning how to help with this stage..." | CONVERSATIONALLY UNSUPPORTED | [PROVEN] |
| EVALUATING | Same static response | CONVERSATIONALLY UNSUPPORTED | [PROVEN] |
| READY_TO_ACT | Same static response | CONVERSATIONALLY UNSUPPORTED | [PROVEN] |
| IN_TRANSITION | Same static response | CONVERSATIONALLY UNSUPPORTED | [PROVEN] |
| SETTLED | Same static response | CONVERSATIONALLY UNSUPPORTED | [PROVEN] |

[PROVEN] Five of seven lifecycle states are conversationally unsupported (dead-ended in the current orchestrator). The PHASE_OUT_OF_SCOPE response is IDENTICAL for all five — no state-specific content, no acknowledgement of achievement, no explanation of next steps.

[PROVEN] The frontend (Chat.jsx) does NOT handle PHASE_OUT_OF_SCOPE specially — it renders response_text as-is.

---

## 4. Engine Handovers

[PROVEN] smudgeOrchestrator imports ONLY companionCore. Zero references to any other engine, TransitionJourney, JourneyCheckpoint, or OCIPathway.

[PROVEN] Frontend (Chat.jsx, Dashboard.jsx) calls ONLY:
1. smudgeOrchestrator (chat messages)
2. profileBootstrap (dashboard entry)

[PROVEN] Frontend has zero calls to any engine function, companionService, or lifecycle transition action.

| Engine/Component | Handover Status | Evidence |
|---|---|---|
| Capability Intelligence | NOT WIRED — standalone API, 5 actions, not called by Smudge or frontend | [PROVEN] |
| Understanding Engine | NOT WIRED — standalone API, assessment-only, not called by Smudge or frontend | [PROVEN] |
| Decision Readiness | NOT WIRED — standalone API, 6 actions, not called by Smudge or frontend | [PROVEN] |
| Transition Partnership | NOT WIRED — standalone API, 15 actions, not called by Smudge or frontend | [PROVEN] |
| OCI Pathways | NOT WIRED — entity exists with 8 seeded pathways, engine reads it but engine is never called | [PROVEN] |
| Soak Period | NOT WIRED — managed via engineDecisionReadiness only | [PROVEN] |
| LinkedIn/CV | NOT WIRED — no CV functionality exists. Interpretation LLM detects "help with CV" as help_request but no tool backs it | [PROVEN] |
| Export/Reporting | NOT WIRED — no export function exists | [PROVEN] |
| Gap Analysis | NOT WIRED — embedded in engineDecisionReadiness.evaluate_pathways as unresolved_gaps | [PROVEN] |
| Learning Pathway | NOT WIRED — LearningCard.jsx renders placeholder, OnTheWay.jsx is "coming soon" | [PROVEN] |
| companionService | NOT WIRED — orchestrator imports companionCore directly, bypassing companionService | [PROVEN] |

[PROVEN] Summary: Smudge conversation can only reach EXPLORING and CONFIRMING. All five other states require engine invocation that is not wired.

---

## 5. Transition-Signal Audit

### 5.1 Signal: "confirming" — CONFLATED (HIGH RISK)

[PROVEN] Serves TWO distinct semantic purposes:
1. LLM classification: user says "yes, you understood me correctly" (reflection accuracy)
2. Lifecycle trigger: advances tos_phase to CONFIRMED (lifecycle advancement)

These are conflated — confirming accuracy simultaneously advances lifecycle state. This is SMUDGE 5 F3.

### 5.2 Signal: "sufficient" — CONFLATED (HIGH RISK)

[PROVEN] Serves TWO purposes:
1. System judgement: "Smudge has enough to reflect usefully"
2. Lifecycle trigger: advances EXPLORING → CONFIRMING automatically

No user consent required. The system decides it has enough and advances.

### 5.3 Signal: "operational_picture_confirmed" — FORWARD-COUPLED (MEDIUM RISK)

[PROVEN] Serves as:
1. Record that user confirmed reflection accuracy
2. Precondition gate for engineCapabilityIntelligence
Set by the same signal that advances to CONFIRMED.

### 5.4 Signal: "advance_phase" — NO USER INTENT CHECK (MEDIUM RISK)

[PROVEN] In engineCapabilityIntelligence: advances CONFIRMED → EVALUATING based on capability_map.length > 0. No user intent verification.

### 5.5 Signal: "ready_for_confirmation" — INERT

[PROVEN] Returned by engineUnderstanding (not called by anyone). Uses legacy "confirmation" term. Currently dead.

### 5.6 Signal: "can_proceed" — DERIVED

[PROVEN] companionCore: userConfirmed && tos_phase === 'CONFIRMING'. Derived from same confirming signal — not independently checked.

### 5.7 Summary of Conflated Signals

| Signal | Job 1 | Job 2 | Risk |
|---|---|---|---|
| confirming | "You understood me correctly" | "Advance to CONFIRMED" | HIGH — SMUDGE 5 F3 |
| sufficient | "Smudge has enough to reflect" | "Advance to CONFIRMING" | HIGH — no user consent |
| operational_picture_confirmed | "Reflection was accurate" | "Precondition for capability intelligence" | MEDIUM — forward-coupled |
| advance_phase | "Capabilities exist" | "Advance to EVALUATING" | MEDIUM — no user intent |

---

## 6. User Continuation and Reversal

### 6.1 EXPLORING

| User Action | Code Behaviour | Evidence |
|---|---|---|
| Keeps talking | Normal pipeline | [PROVEN] |
| Adds new information | Extracted, merged by companionCore | [PROVEN] |
| Corrects something | userResponseType='correcting', mode→RE_EXPLORING (conversational only, tos_phase stays EXPLORING) | [PROVEN] |
| Says they aren't ready | No specific mechanism — LLM may classify as 'answering', pipeline continues | [PROVEN] — absence |
| Changes their mind | Same as "keeps talking" — no mind-change detection | [PROVEN] |
| Asks to go back | Already in earliest state | [PROVEN] |
| Asks "what happens next?" | No structured handler — depends on LLM generation | [INFERENCE] |
| Disappears and returns | 30 min: is_returning=true, session_reset. 7 days: conversation_mode reset to "understanding". tos_phase unchanged. | [PROVEN] |

### 6.2 CONFIRMING

| User Action | Code Behaviour | Evidence |
|---|---|---|
| Keeps talking (non-confirming) | Normal pipeline continues in CONFIRMING. Sufficiency gate NOT re-run. | [PROVEN] |
| Adds new information | Extracted, merged. tos_phase stays CONFIRMING. | [PROVEN] |
| Corrects something | userResponseType='correcting' → operational_picture_confirmed=false, mode=RE_EXPLORING. tos_phase stays CONFIRMING. | [PROVEN] |
| Says "yes"/confirms | userResponseType='confirming' → tos_phase=CONFIRMED, operational_picture_confirmed=true. IRREVERSIBLE. | [PROVEN] |
| Says they aren't ready | No mechanism. If LLM misclassifies as 'confirming', user is advanced. | [PROVEN] — no handler |
| Changes their mind | No path back to EXPLORING. Can reject reflection (stays CONFIRMING) or confirm (advances to CONFIRMED). | [PROVEN] |
| Asks to go back | No back mechanism. tos_phase=CONFIRMING persists. | [PROVEN] |
| Disappears and returns | Same session boundary logic. tos_phase stays CONFIRMING. | [PROVEN] |

### 6.3 CONFIRMED through SETTLED

[PROVEN] ALL user actions return the same static PHASE_OUT_OF_SCOPE response. No correction, no reversal, no information, no continuation. Every message, every time, indefinitely.

### 6.4 Irreversibility

[PROVEN] NO mechanism exists for a user to reverse a lifecycle transition through conversation. The only reversal path is pilotAccountReset (admin/test function).
- CONFIRMED cannot return to CONFIRMING through Smudge
- CONFIRMING cannot return to EXPLORING through Smudge
- No state can be reversed by "I changed my mind" or "I want to go back"

---

## 7. Known Automatic Transitions

### 7.1 EXPLORING → CONFIRMING (Automatic — NO user decision)

[PROVEN] Trigger: sufficiency gate LLM returns sufficient=true + floor passes
- User decision required: NO. System decides it has enough.
- Violates SMUDGE 5 principle: Understand → Reflect → Validate → Invite → User Decides → Advance
- Current code does: Understand → Reflect (automatic) → Advance to CONFIRMING
- Missing: "Invite" and "User Decides" steps

### 7.2 CONFIRMING → CONFIRMED (Semi-Automatic — conflated signal)

[PROVEN] Trigger: LLM classifies user text as 'confirming'
- User must say something LLM interprets as confirmation
- But "yes, that's right" (accuracy) = "I'm ready to advance" (lifecycle decision) — same signal
- Violates SMUDGE 5: Validate and Advance must be distinct

### 7.3 CONFIRMED → EVALUATING (No user intent check — latent)

[PROVEN] Trigger: API call with submit_capabilities or advance_phase
- No user intent verification — checks data completeness
- Currently NOT reachable from Smudge — risk is latent

### 7.4 No Other Automatic Transitions

[PROVEN] All other transitions require explicit action parameters with substantive input. They are deterministic but action-gated. None verify user intent — they verify data completeness and explicit action invocation.

---

## 8. Existing Unreachable/Dead Code

### 8.1 companionCore sufficiencyResult Parameter (DEAD CODE)

[PROVEN] companionCore accepts sufficiencyResult (line 315). Two paths use it:
- Line 365: would set newPhase='CONFIRMING' if sufficient===true && tos_phase==='EXPLORING'
- Line 409: would set mode='CONFIRMING' if sufficient===true

[PROVEN] The orchestrator does NOT pass sufficiencyResult to companionCore (confirmed at lines 1278-1284 — no sufficiencyResult key in call object). companionService also does not pass it.

Conclusion: These paths are DEAD CODE. The EXPLORING → CONFIRMING transition is owned exclusively by the orchestrator (lines 1340-1346).

### 8.2 Legacy Engine Files

[PROVEN] Three legacy files in functions/, NOT deployed:
- engineUnderstanding_mate.ts — duplicate, NOT deployed
- engineUnderstanding_r2.ts — duplicate, NOT deployed
- createTestProfile.ts — test utility, NOT deployed

### 8.3 Unreachable Lifecycle States (from Smudge)

[PROVEN] Five of seven states unreachable through Smudge conversation:
CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED

### 8.4 Unreachable Engine Actions

[PROVEN] ALL engine actions unreachable from conversational interface or frontend:
- engineCapabilityIntelligence: 5 actions
- engineDecisionReadiness: 6 actions
- engineTransitionPartnership: 15 actions
- engineUnderstanding: assessment-only
- companionService: not called

### 8.5 Frontend Placeholder Routes

[PROVEN] OnTheWay.jsx is placeholder for /pathways, /learning — "coming soon" only.

### 8.6 conversation_mode: "transitioning" (SET BUT NEVER READ)

[PROVEN] deriveConversationState sets conversation_mode="transitioning" when CONFIRMED is reached (line 183). But on the NEXT message, PHASE_OUT_OF_SCOPE fires BEFORE deriveConversationState runs — so this mode is persisted but never read back.

---

## 9. Risk Map

| ID | Risk | State(s) | Confidence | Evidence |
|---|---|---|---|---|
| R1 | Premature advancement — EXPLORING → CONFIRMING fires without user consent | EXPLORING → CONFIRMING | HIGH | [PROVEN] sufficiency gate line 1330, no user decision gate |
| R2 | Ambiguous confirmation — confirming signal conflates accuracy with advancement | CONFIRMING → CONFIRMED | HIGH | [PROVEN] companionCore line 370, SMUDGE 5 F3 |
| R3 | Conversation suddenly stopping — PHASE_OUT_OF_SCOPE static response — conversationally unsupported in current orchestrator | CONFIRMED + all post-CONFIRMED | HIGH | [PROVEN] line 953, SMUDGE 5 F5 |
| R4 | Static fallback loop — same response every time, no escape | All post-CONFIRMED | HIGH | [PROVEN] no state-specific handling |
| R5 | Engine available but never invoked — 4 engines, 26 actions, not wired | CONFIRMED → SETTLED | HIGH | [PROVEN] zero engine refs in orchestrator/frontend |
| R6 | State entered with no exit — CONFIRMED is one-way door | CONFIRMED | HIGH | [PROVEN] no reversal in conversation |
| R7 | Inability to return/reconsider — no "go back" mechanism | All transitions | HIGH | [PROVEN] no back/reconsider handler |
| R8 | Engine invoked without user readiness — advance_phase checks data not intent | CONFIRMED → EVALUATING | MEDIUM | [PROVEN] no intent check. Latent — not currently reachable. [NEEDS LIVE TEST] if wired |
| R9 | Information/evidence lost during handover — duplicated assessment logic with known inconsistencies | All engine handovers | MEDIUM | [PROVEN] engineUnderstanding and companionCore have duplicated logic |
| R10 | LLM misclassification of confirming — ambiguous text may be classified as confirming | CONFIRMING → CONFIRMED | MEDIUM | [PROVEN] LLM classification. [NEEDS LIVE TEST] actual misclassification rate |
| R11 | operational_picture_confirmed forward-coupling — set by confirming signal, used as precondition | CONFIRMED → EVALUATING | MEDIUM | [PROVEN] companionCore line 355, engineCapabilityIntelligence line 325 |
| R12 | companionCore dead code creating false confidence | EXPLORING → CONFIRMING | LOW | [PROVEN] dead code, no runtime impact |
| R13 | Session reset does not reset lifecycle — 30min/7day reset conversation_mode but not tos_phase | All states | LOW | [PROVEN] session boundary only resets conversation_mode |

---

## Appendix A: Deployed Function Inventory

| Function | Lifecycle Transitions | Called by Smudge? | Called by Frontend? |
|---|---|---|---|
| smudgeOrchestrator | EXPLORING → CONFIRMING | IS Smudge | YES (Chat.jsx) |
| companionCore | CONFIRMING → CONFIRMED | YES (imported) | NO |
| companionService | CONFIRMING → CONFIRMED (via companionCore) | NO | NO |
| engineUnderstanding | None (assessment-only) | NO | NO |
| engineCapabilityIntelligence | CONFIRMED → EVALUATING | NO | NO |
| engineDecisionReadiness | EVALUATING → READY_TO_ACT | NO | NO |
| engineTransitionPartnership | READY_TO_ACT → IN_TRANSITION → SETTLED | NO | NO |
| profileBootstrap | [UNINITIALIZED] → EXPLORING | NO | YES (Dashboard.jsx) |
| pilotAccountReset | [ANY] → EXPLORING | NO | NO |

## Appendix B: Entity Schema Lifecycle Fields

| Entity | Field | Enum Values |
|---|---|---|
| UserProfile | tos_phase | EXPLORING, CONFIRMING, CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED |
| UserProfile | operational_picture_confirmed | boolean |
| UserProfile | soak_period.state | NOT_STARTED, SOAKING, COMPLETED, BYPASSED |
| ConversationState | conversation_mode | understanding, helping, transitioning |
| TransitionJourney | partnership_state | ACTIVE, MONITORING, SUPPORT_REQUIRED, REFERRAL, INDEPENDENT |
| TransitionJourney | operational_readiness | ON_COURSE, ADAPTING, STALLED, NEEDS_SUPPORT |
| TransitionJourney | confidence_band | LOW, BUILDING, STEADY, STRONG |

---

## Summary

The deployed MATE architecture handles two lifecycle states conversationally (EXPLORING, CONFIRMING) and treats the other five as conversationally unsupported in the current orchestrator. Four engines with 26 actions exist but are completely disconnected from the conversational interface and the frontend. Two transitions (EXPLORING → CONFIRMING, CONFIRMING → CONFIRMED) can fire without explicit user readiness, reproducing the exact failure class identified in SMUDGE 5. No reversal mechanism exists in conversation. The only path forward from CONFIRMED is through engine API calls that nothing currently invokes.

This document contains only engineering evidence. No remediation, design intent, or recommendations are included.
