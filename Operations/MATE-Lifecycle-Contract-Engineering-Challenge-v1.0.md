# MATE Lifecycle Boundary & Authority Contract — Engineering Challenge

**Document type:** Engineering Challenge / Gap Assessment
**Date:** 25 August 2026
**Author:** Ash (Engineering)
**Status:** COMPLETE — no remediation authorised
**Purpose:** Challenge the accepted Lifecycle Boundary & Authority Contract against the deployed code baseline. Factual input for Paul & Cipher to agree Design Intent and engineering sequence before build authority.

**Reference:** `Operations/MATE-Lifecycle-Boundary-Authority-Audit-Baseline-v1.0.md` (commit f98d101)

---

## Reading Guide

- **COMPLIANT** — architecture already behaves this way
- **PARTIAL** — some mechanisms exist but contract is incomplete
- **CONFLICT** — current implementation contradicts the accepted contract
- **MISSING** — no implementation exists

Change type key: **Contract/Schema** | **Orchestration** | **Engine Wiring** | **Frontend** | **Persistence** | **Generation/Prompt**

---

## Part 1: Architectural Invariant

### "No lifecycle state may disable the companion relationship."

**ASSESSMENT: CONFLICT**

**Current behaviour:** The orchestrator (line 953) returns a static PHASE_OUT_OF_SCOPE response for five of seven lifecycle states: CONFIRMED, EVALUATING, READY_TO_ACT, IN_TRANSITION, SETTLED. Every user message in these states receives: *"I'm still learning how to help with this stage of your journey. Your dashboard has more information about what's available."* — indefinitely, with no state-specific content, no mechanism to continue, no ability to ask questions, correct, reconsider, or return.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` — phase routing at line 953.

**Required behavioural change:** Replace the binary EXPLORING/CONFIRMING gate with state-aware conversational support for all seven lifecycle states. Smudge must be able to: acknowledge where the user is, explain what's available, answer questions, accept corrections, support discussion, and facilitate the next boundary — in every state.

**Change type:** Orchestration + Generation/Prompt

**Dependencies:** This is the foundational fix. Every other boundary fix depends on Smudge being able to converse in the destination state. You cannot wire "Smudge explains what happens next" at CONFIRMED → EVALUATING if Smudge returns a static response in CONFIRMED.

**Regression risk to R1-C.1E:** LOW. The phase routing gate is BEFORE the extraction/sufficiency pipeline. Adding state-aware handling for post-CONFIRMED states does not touch the EXPLORING/CONFIRMING pipeline that R1-C.1E proved. The risk is in expanding the generation prompt to handle new states — but this is additive, not modifying existing proven behaviour.

---

## Part 2: Boundary-by-Boundary Assessment

---

### Boundary 1 — EXPLORING → CONFIRMING

**Contract:** "Smudge may determine that sufficient understanding exists to initiate a Reflection Moment. This is Smudge/system authority to offer reflection, not authority to progress the user."

**ASSESSMENT: PARTIAL**

**Current behaviour:** The sufficiency gate (line 1336) determines `sufficient === true` + deterministic floor passes → orchestrator writes `tos_phase: "CONFIRMING"` to the database (line 1342) AND shifts the generation prompt to offer reflection. The sufficiency determination and the lifecycle state change happen in the same operation — there is no separation between "offer reflection" and "progress the user."

**What's COMPLIANT:** The sufficiency gate determining "enough to reflect" IS system authority. The contract explicitly grants this. The sufficiency gate's LLM judgment ("True if you understand enough of this person to reflect your understanding back usefully and honestly") is exactly the system judgement the contract authorises.

**What's PARTIAL:** The code conflates "initiate a Reflection Moment" with "advance lifecycle state." If CONFIRMING is understood as "the reflection conversation" (a conversational activity, not a lifecycle progression), then writing tos_phase = CONFIRMING is acceptable — it's tracking the conversational mode. But the code treats tos_phase as a lifecycle progression, and the PHASE_OUT_OF_SCOPE gate downstream uses it to restrict conversation. The contract says this is "not authority to progress the user" — the code makes it authority to progress.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` — lines 1336-1346 (sufficiency result handling, tos_phase write).

**Required behavioural change:** The sufficiency gate's JUDGMENT stays unchanged. What changes is what the orchestrator DOES with it. Two options:
- Option A: Keep writing tos_phase = CONFIRMING (it's just the reflection state) — but ensure CONFIRMING is never a conversational dead-end and never restricts the companion relationship.
- Option B: Stop writing tos_phase on sufficiency. Keep the user in EXPLORING, shift the generation prompt to offer reflection, and only advance to CONFIRMING when the user agrees to hear the reflection.

The contract seems to support Option A — CONFIRMING is where reflection happens, and entering it is system authority. The key is that CONFIRMING → CONFIRMED is where user authority is required (Boundary 2).

**Change type:** Orchestration (minor — only if Option B is chosen) or none (if Option A).

**Dependencies:** None if Option A. If Option B, depends on the EXPLORING generation prompt supporting a reflection offer without a state change.

**Regression risk to R1-C.1E:** LOW. The sufficiency gate's floor check and LLM judgment remain unchanged. Only the downstream action (write vs. don't write tos_phase) would change. R1-C.1E proved the sufficiency gate works — that's the judgment, not the tos_phase write.

---

### Boundary 2 — CONFIRMING → CONFIRMED

**Contract:** "Reflection validation and lifecycle progression are separate. The user's confirmation that 'yes, you've understood me correctly' confirms the accuracy of the Operational Picture. It does not itself authorise progression. Once the picture is validated, Smudge separately explains/invites the next stage. The user decides whether to proceed."

**ASSESSMENT: CONFLICT**

**Current behaviour:** companionCore (line 370-371): when `userResponseType === 'confirming' && userConfirmed && tos_phase === 'CONFIRMING'`, the code sets `newPhase = 'CONFIRMED'` and `operational_picture_confirmed = true` in the SAME operation. The user saying "yes, you understood me correctly" simultaneously:
1. Validates the reflection accuracy
2. Sets operational_picture_confirmed = true
3. Advances tos_phase to CONFIRMED

There is no "Smudge separately explains/invites" step. There is no "user decides whether to proceed" step. Validation and progression are the same signal.

**What the contract requires (3 separate signals):**
1. User validates: "Yes, you understood me correctly" → sets operational_picture_confirmed = true (stays in CONFIRMING)
2. Smudge explains/invites: "Here's what happens next — would you like to move forward?" → conversational, no state change
3. User decides: "I'm ready to move on" → advances tos_phase to CONFIRMED

**Exact component responsible:** `companionCore.ts` — line 355 (operational_picture_confirmed), line 370-371 (newPhase = CONFIRMED).

**Required behavioural change:**
1. Decouple validation from progression. When userResponseType = 'confirming': set operational_picture_confirmed = true but do NOT change tos_phase. The user stays in CONFIRMING.
2. After validation, the generation prompt must include an "explain/invite next stage" instruction — Smudge explains what capability intelligence is and asks if the user wants to proceed.
3. Add a new user response classification or signal for "user authorises progression" — distinct from "user validates reflection accuracy." This could be a new userResponseType value (e.g., 'advancing') or a separate LLM classification.
4. Only when the user explicitly authorises progression does tos_phase advance to CONFIRMED.

**Change type:** Orchestration + Generation/Prompt + companionCore (contract change to separate validation from progression)

**Dependencies:** Depends on conversational support in CONFIRMED (Invariant fix) — because once the user advances to CONFIRMED, Smudge must be able to converse (explain, invite, support) rather than hitting a dead-end.

**Regression risk to R1-C.1E:** MEDIUM. The confirming signal and its processing are part of the proven EXPLORING/CONFIRMING pipeline. Decoupling validation from progression changes the companionCore flow. However, the extraction, sufficiency gate, and discovery merge logic are untouched. The risk is in the confirmation flow — specifically, the LLM classification of userResponseType. Adding a new signal ('advancing') requires the interpretation LLM to distinguish three things where it currently distinguishes two. This needs careful prompt engineering and testing.

---

### Boundary 3 — CONFIRMED → EVALUATING

**Contract:** "Capability Intelligence may only begin when: its deterministic/evidence preconditions are satisfied; and Smudge has explained what happens next; and the user explicitly authorises progression. System ready + User ready = handover authorised. Capability Intelligence works for Smudge. The user remains in a relationship with Smudge rather than being handed off to an engine."

**ASSESSMENT: MISSING + CONFLICT**

**Current behaviour:**
- engineCapabilityIntelligence exists, is tested, and has 5 actions (validate_preconditions, seed_evidence, submit_capabilities, get_capability_picture, advance_phase)
- It advances CONFIRMED → EVALUATING based on: operational_picture_confirmed === true, assessment_confidence.rating in HIGH/MODERATE, non-empty evidence_log, valid evidence_refs
- It checks DATA preconditions. It does NOT check user intent. No Smudge explanation. No user authorisation.
- The engine is NOT wired to Smudge. The orchestrator has zero references to it. The frontend has zero calls to it.
- A user in CONFIRMED receives PHASE_OUT_OF_SCOPE static response.

**The contract's desired flow (User → Smudge → engine → Smudge → User):**
1. User is in CONFIRMED. Smudge explains what capability intelligence is and what it will do.
2. User says "yes, let's do it."
3. Smudge invokes engineCapabilityIntelligence (validate_preconditions, seed_evidence, submit_capabilities).
4. Engine returns capability map, confidence scores.
5. Smudge presents results conversationally to the user.
6. User continues conversation with Smudge about their capabilities.

**Current flow:** User → (static response, no engine, no Smudge) → User. Dead-end.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` (no engine wiring), `engineCapabilityIntelligence.ts` (no user authority gate).

**Required behavioural change:**
1. Add conversational support in CONFIRMED (Invariant fix — prerequisite)
2. Add an authority gate: Smudge explains → user authorises → only then invoke engine
3. Wire the orchestrator to call engineCapabilityIntelligence via `base44.asServiceRole.functions.invoke()` or equivalent
4. Engine results must flow back through Smudge's generation layer — Smudge presents them, not a raw JSON dump
5. The tos_phase advance to EVALUATING must be triggered by user authority (via Smudge), not by engine data checks alone

**Change type:** Orchestration (major) + Engine Wiring (major) + Generation/Prompt (new state-specific prompts) + Frontend (if dashboard actions are needed — though the contract says Smudge orchestrates, so frontend may stay minimal)

**Dependencies:** Depends on Invariant fix (conversational support in CONFIRMED). Depends on Boundary 2 fix (user must be in CONFIRMED through proper authority, not conflated signal).

**Regression risk to R1-C.1E:** LOW. This is entirely additive — wiring a new path that doesn't exist. The EXPLORING/CONFIRMING pipeline is untouched. The engine itself is already tested (16/16 tests per memory).

---

### Boundary 4 — EVALUATING → READY_TO_ACT

**Contract:** "Decision Readiness may determine that the analytical work is sufficiently complete, but it cannot determine that the person is ready. Smudge briefs the findings, supports discussion/reflection and the existing soak mechanism, then asks the user whether they feel ready to begin practical action. Soak can be completed normally or explicitly bypassed by the user using the existing auditable mechanism. READY_TO_ACT means the user has indicated they are ready to move from evaluating possibilities into practical action."

**ASSESSMENT: MISSING + PARTIAL**

**What's PARTIAL:** The soak mechanism exists in engineDecisionReadiness with 6 actions. It has audit requirements (reflection_notes ≥ 15 chars, bypass_reason ≥ 10 chars, ≥1 pathway, ≥1 expressed decision factor). The sub-state machine (NOT_STARTED → SOAKING → COMPLETED/BYPASSED) is implemented and guarded.

**What's MISSING:**
- engineDecisionReadiness is NOT wired to Smudge. Orchestrator has zero references. Frontend has zero calls.
- No Smudge briefing of findings. No conversational support for discussion/reflection during soak.
- No "asks the user whether they feel ready" — the engine checks data completeness, not human readiness.
- EVALUATING is a conversational dead-end (PHASE_OUT_OF_SCOPE).
- The tos_phase advance to READY_TO_ACT is triggered by complete_soak/bypass_soak (data completeness + action parameter), not by user expressing readiness through Smudge.

**The contract's desired flow (User → Smudge → engine → Smudge → User):**
1. User is in EVALUATING. Smudge presents capability intelligence findings.
2. User discusses, reflects, explores pathways. Smudge supports via conversation.
3. Smudge introduces the soak period concept. User enters soak (initiate_soak).
4. During soak: Smudge checks in, supports reflection, records decision factors.
5. Smudge asks: "Do you feel ready to begin practical action?"
6. User says yes → Smudge invokes complete_soak (with reflection_notes) → tos_phase = READY_TO_ACT
7. OR user says they want to bypass → Smudge invokes bypass_soak (with bypass_reason) → tos_phase = READY_TO_ACT

**Current flow:** User → (static response, no engine, no Smudge) → User. Dead-end.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` (no engine wiring), `engineDecisionReadiness.ts` (no user readiness check).

**Required behavioural change:**
1. Add conversational support in EVALUATING (Invariant fix — prerequisite)
2. Wire orchestrator to call engineDecisionReadiness actions
3. Add authority gate: Smudge briefs → user reflects → Smudge asks readiness → user authorises → engine invoked
4. The soak sub-state machine can remain as-is (it's well-guarded)
5. The tos_phase advance must be user-authorised through Smudge, not engine-determined

**Change type:** Orchestration (major) + Engine Wiring (major) + Generation/Prompt (new state-specific prompts for EVALUATING, SOAKING conversation)

**Dependencies:** Depends on Boundary 3 (user must be in EVALUATING through proper authority). Depends on Invariant fix (conversational support in EVALUATING).

**Regression risk to R1-C.1E:** LOW. Entirely additive. Soak sub-state machine is untouched.

---

### Boundary 5 — READY_TO_ACT → IN_TRANSITION

**Contract:** "Discussion, curiosity and questions are not action authority. Transition occurs when the user explicitly commits to or begins a meaningful transition activity. Examples: starting CV work, undertaking development/training, beginning an application, engaging a transition partner/referral. Transition Partnership/specialist capabilities work through Smudge. Smudge remains the conversational owner."

**ASSESSMENT: MISSING + CONFLICT**

**What's CONFLICT:** engineTransitionPartnership.start_journey advances READY_TO_ACT → IN_TRANSITION based on: tos_phase === READY_TO_ACT, soak completed/bypassed, non-empty capability_map. It checks STATE completeness, not USER ACTION. A user who is in READY_TO_ACT and has completed soak but hasn't actually started any transition activity could be advanced. The contract explicitly says "Discussion, curiosity and questions are not action authority."

**What's MISSING:**
- engineTransitionPartnership is NOT wired to Smudge. 15 actions exist but are unreachable.
- No mechanism to verify the user has actually committed to or begun a transition activity.
- READY_TO_ACT and IN_TRANSITION are both conversational dead-ends.
- No Smudge-mediated introduction of the transition partnership.

**The contract's desired flow (User → Smudge → engine → Smudge → User):**
1. User is in READY_TO_ACT. Smudge supports discussion about practical next steps.
2. User commits to a specific activity (e.g., "I'm going to start my CV," "I'm applying for that course").
3. Smudge acknowledges the commitment → invokes engineTransitionPartnership.start_journey.
4. Smudge introduces the transition journey support, explains what's available.
5. User continues in relationship with Smudge throughout IN_TRANSITION.

**Current flow:** User → (static response, no engine, no Smudge) → User. Dead-end.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` (no engine wiring), `engineTransitionPartnership.ts` (checks state not action).

**Required behavioural change:**
1. Add conversational support in READY_TO_ACT and IN_TRANSITION (Invariant fix)
2. Wire orchestrator to call engineTransitionPartnership actions
3. Add authority gate: user expresses concrete commitment/activity → Smudge confirms → engine invoked
4. The engine's start_journey precondition (tos_phase === READY_TO_ACT, soak completed) can remain as a deterministic floor — but the TRIGGER must be user action verified through Smudge, not API invocation alone
5. All 15 engine actions (record_commitment, update_commitment, record_blocker, record_milestone, etc.) must be accessible through Smudge conversation, not direct API

**Change type:** Orchestration (major) + Engine Wiring (major) + Generation/Prompt (new state-specific prompts)

**Dependencies:** Depends on Boundary 4 (user must be in READY_TO_ACT through proper authority). Depends on Invariant fix.

**Regression risk to R1-C.1E:** LOW. Entirely additive.

---

### Boundary 6 — IN_TRANSITION → SETTLED

**Contract:** "Employment, training completion, service exit or administrative completion must not independently declare the person SETTLED. SETTLED means the user considers themselves sufficiently established that they no longer require active transition support from MATE. Smudge/system evidence may prompt that conversation, but the person determines completion. SETTLED closes the active transition journey. It does not close the Smudge relationship."

**ASSESSMENT: MISSING + CONFLICT**

**What's CONFLICT:**
- engineTransitionPartnership.conclude_journey advances to SETTLED based on: summary ≥ 15 chars + valid transition to INDEPENDENT. It checks for a substantive string, not that the person considers themselves established. Any API caller with a 15-char reason can trigger it.
- SETTLED triggers PHASE_OUT_OF_SCOPE — a static dead-end. This directly violates "SETTLED does not close the Smudge relationship."

**What's MISSING:**
- engineTransitionPartnership not wired to Smudge
- No Smudge-mediated "do you feel established enough?" conversation
- No conversational support in IN_TRANSITION or SETTLED
- No mechanism for a SETTLED user to return and talk to Smudge (without lifecycle state change — Boundary 8)

**The contract's desired flow (User → Smudge → engine → Smudge → User):**
1. User is in IN_TRANSITION. Smudge supports throughout (milestones, blockers, referrals, confidence changes).
2. Smudge notices indicators of establishment — prompts: "You seem like you're finding your feet. How are you feeling about where you are?"
3. User says they feel sufficiently established.
4. Smudge invokes engineTransitionPartnership.conclude_journey (with the user's reason as summary).
5. tos_phase = SETTLED. Smudge acknowledges the milestone.
6. User can still talk to Smudge. SETTLED doesn't end the relationship.

**Current flow:** User → (static response, no engine, no Smudge) → User. Dead-end. Both IN_TRANSITION and SETTLED are dead-ends.

**Exact component responsible:** `smudgeOrchestrator/entry.ts` (no engine wiring, PHASE_OUT_OF_SCOPE), `engineTransitionPartnership.ts` (checks string length, not person determination).

**Required behavioural change:**
1. Add conversational support in IN_TRANSITION and SETTLED (Invariant fix)
2. Wire orchestrator to call engineTransitionPartnership conclude_journey
3. Add authority gate: Smudge prompts → user determines → Smudge invokes engine
4. SETTLED must be conversational — Smudge can acknowledge, support, answer questions, and remain available
5. The 15-char summary requirement can remain as an audit floor — but the trigger must be the person's determination, expressed through Smudge

**Change type:** Orchestration (major) + Engine Wiring + Generation/Prompt (new state-specific prompts, including SETTLED as an active conversational state)

**Dependencies:** Depends on Boundary 5. Depends on Invariant fix. Depends on Boundary 8 (SETTLED user can return without state change).

**Regression risk to R1-C.1E:** LOW. Entirely additive.

---

### Boundary 7 — Reconsideration, Re-entry & Backwards Movement

**Contract:** "Enrichment — update evidence; lifecycle need not change. Reconsideration — material change affecting current decisions; re-evaluate affected work, potentially within the current phase. Re-entry — material change undermines an earlier established picture and may require returning to previous work. Smudge may identify and recommend reconsideration/re-entry, but material lifecycle re-entry is explained and user-authorised. Do not silently reset or erase history. Preserve what was previously known, what changed and when."

**ASSESSMENT: MISSING**

**Current behaviour:** No mechanism exists for reconsideration or re-entry. No backwards transition exists anywhere in the deployed code. The only reversal path is pilotAccountReset (admin tool that silently resets everything to EXPLORING, deleting all JourneyCheckpoint and TransitionJourney records — the opposite of "preserve what was previously known").

There is no distinction between:
- Enrichment (adding evidence within current state — this DOES happen in EXPLORING/CONFIRMING via the extraction pipeline, but not in post-CONFIRMED states where PHASE_OUT_OF_SCOPE blocks everything)
- Reconsideration (re-evaluating within current phase)
- Re-entry (returning to previous work)

**What exists that's partially relevant:**
- companionCore's RE_EXPLORING mode (conversational, when user rejects/corrects during CONFIRMING) — but this is within CONFIRMING only, doesn't change tos_phase, and doesn't exist for other states
- operational_picture_confirmed is set to false when user rejects during CONFIRMING — this is the closest thing to "reconsideration" but it's scoped to CONFIRMING only
- operational_picture_version and operational_picture_history fields exist on UserProfile — designed for versioning, but no code reads or writes operational_picture_history (confirmed: zero references in deployed code)

**Exact component responsible:** No component — this is entirely missing.

**Required behavioural change:**
1. Add enrichment support for all states (currently only EXPLORING/CONFIRMING can accept new evidence)
2. Add reconsideration mechanism: user reports material change → Smudge identifies affected work → re-evaluate within current phase (no tos_phase change)
3. Add re-entry mechanism: material change undermines earlier picture → Smudge explains → user authorises → tos_phase moves backwards (e.g., EVALUATING → CONFIRMING, or READY_TO_ACT → EVALUATING)
4. Preserve history: use operational_picture_history (field exists, not wired) to record what changed and when
5. NEVER silently reset — the current pilotAccountReset pattern (delete everything) must NOT be the model for re-entry

**Change type:** Orchestration (major) + Persistence (new history tracking) + Generation/Prompt (new reconsideration/re-entry prompts) + companionCore (backwards transition support)

**Dependencies:** Depends on Invariant fix (Smudge must be conversational in all states to identify and recommend reconsideration). Depends on all forward boundaries being wired (you can't re-enter a state that doesn't work).

**Regression risk to R1-C.1E:** MEDIUM. Adding backwards transitions to companionCore changes the state machine. The RE_EXPLORING mode in CONFIRMING is proven — extending this pattern to other states is new but follows an established pattern. The risk is in the persistence layer — tracking history without corrupting current state.

---

### Boundary 8 — Pause, Disengagement & Return

**Contract:** "Absence does not change lifecycle state. Short return → resume naturally. Longer/material return → proportionately re-establish context and check whether circumstances have changed. Material change invokes Boundary 7. A SETTLED user can return and speak to Smudge without automatically changing lifecycle state. Explicit disengagement from MATE is an engagement/relationship matter and must not be falsely represented as SETTLED."

**ASSESSMENT: PARTIAL**

**What's COMPLIANT:**
- tos_phase is preserved across absences (session boundary at 30 min does not change tos_phase — only resets conversation_mode and session_started_date)
- 7-day reset only resets conversation_mode to "understanding", not tos_phase
- Absence does not change lifecycle state ✓

**What's PARTIAL:**
- Short return: ConversationState tracks topics_covered, topics_closed, last_smudge_response — but ONLY in EXPLORING/CONFIRMING. Post-CONFIRMED states hit PHASE_OUT_OF_SCOPE before session context is even loaded.
- Longer/material return: No "check whether circumstances have changed" mechanism exists. The 7-day mode reset is the closest thing, but it just resets conversation_mode without any substantive check.
- SETTLED user returning: hits PHASE_OUT_OF_SCOPE. Cannot speak to Smudge. Directly violates the contract.

**What's MISSING:**
- No distinction between short return and material return (beyond the 30-min/7-day session boundary, which is about conversation_mode, not lifecycle)
- No "proportionately re-establish context" mechanism
- No mechanism for a SETTLED user to converse without lifecycle state change
- No "explicit disengagement" concept separate from SETTLED

**Exact component responsible:** `smudgeOrchestrator/entry.ts` — deriveConversationState (lines 77-99 for session boundary), `smudgeOrchestrator/entry.ts` — PHASE_OUT_OF_SCOPE (line 953).

**Required behavioural change:**
1. Invariant fix (conversational support in all states) resolves most of this — a SETTLED user returning can talk to Smudge
2. Add "material return" detection: if absence > threshold (e.g., 14 days), Smudge proactively checks for changed circumstances
3. If material change detected → invoke Boundary 7 (reconsideration/re-entry)
4. Add explicit disengagement concept: user can say "I don't need this anymore" — this is an engagement state (not tos_phase = SETTLED), tracked separately

**Change type:** Orchestration + Generation/Prompt + Persistence (if explicit disengagement needs a field — could use existing communication_preferences or a new field)

**Dependencies:** Depends on Invariant fix. Depends on Boundary 7 (for material return → reconsideration). Depends on all forward boundaries being wired (for re-establishment to be meaningful).

**Regression risk to R1-C.1E:** LOW. Session boundary logic is additive. The 30-min/7-day logic is untouched.

---

## Part 3: The 10 Locked Rules — Compliance Matrix

| # | Rule | Assessment | Key Finding |
|---|---|---|---|
| 1 | Smudge may initiate an activity; the user authorises lifecycle progression | CONFLICT | EXPLORING→CONFIRMING: system progresses (PARTIAL if CONFIRMING is just "reflection mode"). CONFIRMING→CONFIRMED: validating signal = progression signal. All post-CONFIRMED: no progression possible at all (engines not wired). |
| 2 | Validation of understanding is not authority to progress | CONFLICT | companionCore line 370: confirming = both validation AND progression. |
| 3 | Engines advise and analyse; Smudge orchestrates; the user decides | MISSING | Engines are standalone, not orchestrated by Smudge. User has no decision interface. |
| 4 | System completeness is not human readiness | CONFLICT | All engine transitions check data completeness. None check human readiness. |
| 5 | Interest is not commitment; discussion is not action | MISSING | No mechanism to distinguish interest from commitment at READY_TO_ACT→IN_TRANSITION. |
| 6 | Transition completion is defined by the person, not by an event | CONFLICT | conclude_journey checks for 15-char reason, not person's determination. |
| 7 | Lifecycle progression must be reversible when circumstances materially change | MISSING | No reversal mechanism exists. Only pilotAccountReset (admin, silent, destructive). |
| 8 | Changing your mind is part of transition, not a failure of transition | MISSING | No mind-change mechanism. No "go back" path. |
| 9 | Absence is not a lifecycle event | PARTIAL | tos_phase preserved (good). Post-CONFIRMED states can't resume conversation (bad). SETTLED user can't converse (bad). |
| 10 | Product engagement state and human transition state are not the same thing | CONFLICT | tos_phase conflates both. EXPLORING/CONFIRMING = both product and human. CONFIRMED onwards = product state exists but human transition state has no conversational support. |

---

## Part 4: Engine Handover Trace

### Current Architecture — What the User Actually Experiences

```
EXPLORING/CONFIRMING:
  User → Chat.jsx → smudgeOrchestrator → companionCore → Smudge generation → User
  ✓ WIRE: User → Smudge → companionCore → Smudge → User (WORKS)

CONFIRMED:
  User → Chat.jsx → smudgeOrchestrator → PHASE_OUT_OF_SCOPE static response → User
  ✗ DEAD-END: No engine, no Smudge conversation, no handover

EVALUATING:
  User → Chat.jsx → smudgeOrchestrator → PHASE_OUT_OF_SCOPE → User
  ✗ DEAD-END: engineCapabilityIntelligence exists but not wired

READY_TO_ACT:
  User → Chat.jsx → smudgeOrchestrator → PHASE_OUT_OF_SCOPE → User
  ✗ DEAD-END: engineDecisionReadiness exists but not wired

IN_TRANSITION:
  User → Chat.jsx → smudgeOrchestrator → PHASE_OUT_OF_SCOPE → User
  ✗ DEAD-END: engineTransitionPartnership exists but not wired

SETTLED:
  User → Chat.jsx → smudgeOrchestrator → PHASE_OUT_OF_SCOPE → User
  ✗ DEAD-END: No conversational support at all
```

### Dashboard Exposure

```
Dashboard.jsx → profileBootstrap → UserProfile.get → display phase badge
  ProfileCard: phase label (presentational only, no actions)
  CapabilityCard: displays capability_map (no actions)
  PathwaysCard: displays recommended_pathways (no actions)
  NextStepsCard: displays action_plan (no actions, "Coming soon")
  LearningCard: placeholder content
  SmudgeMessageCard: displays a message (static)

NO dashboard component triggers any engine action.
NO dashboard component navigates to any engine.
The dashboard is a read-only display surface.
```

### Contract's Desired Architecture — What Should Happen

```
CONFIRMED → EVALUATING:
  User says "I'm ready" → Smudge explains capability intelligence
  → Smudge invokes engineCapabilityIntelligence (validate_preconditions,
    seed_evidence, submit_capabilities)
  → Smudge presents capability findings conversationally
  → User discusses with Smudge → Smudge advances to EVALUATING
  Flow: User → Smudge → engine → Smudge → User ✓

EVALUATING → READY_TO_ACT:
  User explores capabilities with Smudge → Smudge introduces soak
  → Smudge invokes engineDecisionReadiness (initiate_soak)
  → User reflects during soak → Smudge checks in
  → User says "I feel ready" → Smudge invokes complete_soak
  → Smudge advances to READY_TO_ACT
  Flow: User → Smudge → engine → Smudge → User ✓

READY_TO_ACT → IN_TRANSITION:
  User discusses next steps with Smudge → User commits to action
  → Smudge invokes engineTransitionPartnership (start_journey)
  → Smudge introduces transition partnership support
  → User continues with Smudge
  Flow: User → Smudge → engine → Smudge → User ✓

IN_TRANSITION → SETTLED:
  User works with Smudge throughout transition → Smudge prompts
  "How are you feeling about where you are?" → User says "I'm established"
  → Smudge invokes engineTransitionPartnership (conclude_journey)
  → Smudge acknowledges → User can still talk to Smudge
  Flow: User → Smudge → engine → Smudge → User ✓
```

### What's Exposed to the User That Shouldn't Be

Currently the user is exposed to:
1. **A static dead-end response** in 5 states — should never see this; Smudge should be conversational
2. **A read-only dashboard** with no actions — should be able to act through Smudge conversation
3. **Placeholder routes** (/pathways, /learning) — should either be wired or not presented

The user is NOT currently exposed to engines directly (because they're not wired), which is actually correct per the contract — engines should work through Smudge. The problem is that they're not wired at all, not that they're exposed.

---

## Part 5: Generic Signal Audit

Every signal currently capable of accidentally triggering lifecycle progression:

| # | Signal | Where | Current Meaning | Authority It Carries | Should It Carry? | Risk |
|---|---|---|---|---|---|---|
| 1 | `confirming` | companionCore line 370, via LLM classification | User says "yes, you understood me correctly" | Advances tos_phase to CONFIRMED | NO — validation ≠ progression | HIGH — SMUDGE 5 F3 reproduced |
| 2 | `sufficient` | smudgeOrchestrator line 1336, via sufficiency gate LLM | Smudge has enough to reflect | Advances tos_phase to CONFIRMING | PARTIAL — if CONFIRMING is just reflection mode, OK. If CONFIRMING is a lifecycle progression, NO. | MEDIUM — depends on interpretation |
| 3 | `operational_picture_confirmed` | companionCore line 355 → engineCapabilityIntelligence line 325 | User confirmed reflection accuracy | Precondition for capability intelligence (forward-coupled) | NO — should not be a precondition for the next phase until user separately authorises | MEDIUM |
| 4 | `advance_phase` | engineCapabilityIntelligence line 501 | "Capabilities exist" (capability_map.length > 0) | Advances tos_phase to EVALUATING | NO — data existence ≠ user authority | MEDIUM (latent — not currently reachable) |
| 5 | `complete_soak` | engineDecisionReadiness line 370 | "Soak data complete" (reflection_notes ≥ 15, ≥1 pathway, ≥1 factor) | Advances tos_phase to READY_TO_ACT | NO — data completeness ≠ human readiness | MEDIUM (latent) |
| 6 | `bypass_soak` | engineDecisionReadiness line 435 | "User/admin bypassed soak" (bypass_reason ≥ 10) | Advances tos_phase to READY_TO_ACT | PARTIAL — bypass is an explicit action, but doesn't verify readiness | MEDIUM (latent) |
| 7 | `start_journey` | engineTransitionPartnership line 238 | "API caller invoked start" | Advances tos_phase to IN_TRANSITION | NO — API invocation ≠ user commitment to action | MEDIUM (latent) |
| 8 | `conclude_journey` | engineTransitionPartnership line 972 | "Reason provided" (summary ≥ 15) | Advances tos_phase to SETTLED | NO — string length ≠ person's determination | MEDIUM (latent) |
| 9 | `ready_for_confirmation` | engineUnderstanding (not currently called) | "All areas substantive" | Would imply readiness for CONFIRMING | NO — system readiness ≠ user readiness | LOW (inert — engine not wired) |
| 10 | `can_proceed` | companionCore line 397 | "User confirmed + in CONFIRMING" | Sets mode to CONFIRMED | NO — derived from confirming signal, not independent | LOW (consequence of #1) |
| 11 | `ready_to_act` (tos_phase value) | Set by engineDecisionReadiness | State name implies "user is ready to act" | Set by engine data check, not user declaration | NO — name is misleading; set by system, not person | MEDIUM (semantic conflation) |
| 12 | `SETTLED` (tos_phase value) | Set by engineTransitionPartnership | State name implies "person is settled" | Set by reason string length, not person's determination | NO — name is misleading; set by data check, not person | MEDIUM (semantic conflation) |

### Summary of Signal Risk

**Currently active (reachable from Smudge):** Signals #1 and #2 are live and carry authority they shouldn't. #3 is forward-coupled. #10 is a consequence of #1.

**Currently latent (not reachable):** Signals #4-#9 exist in engines but are not wired. If wired without authority gates, each would reproduce the SMUDGE 5 failure class: system data check = lifecycle progression, without user authority.

**Semantic conflation:** #11 and #12 — the state NAMES imply human states ("ready to act", "settled") but the ENGINES that set them check data completeness. This isn't a code bug — it's an architectural naming issue. The contract addresses this: "System completeness is not human readiness" (Rule 4).

---

## Part 6: State Sufficiency Assessment

**Question:** Can the contract be implemented using the existing 7 tos_phase states and existing soak sub-state?

**Answer: YES — no new lifecycle states are needed.**

The contract introduces concepts that feel like they might need new states, but on analysis, they are authority gates and conversational behaviours, not new states:

| Contract Concept | Maps To | New State Needed? |
|---|---|---|
| "Reflection Moment" | CONFIRMING (existing) — it's an activity in CONFIRMING, not a state | NO |
| "User validates accuracy" | CONFIRMING (existing) — validation happens in CONFIRMING | NO |
| "Smudge explains/invites" | CONFIRMING (existing) — conversational, no state change | NO |
| "User decides to proceed" | Transition CONFIRMING → CONFIRMED (existing) — user authority gates the existing transition | NO |
| "Capability Intelligence works for Smudge" | EVALUATING (existing) — engine invoked through Smudge | NO |
| "Soak mechanism" | soak_period.state sub-state (existing) — NOT_STARTED/SOAKING/COMPLETED/BYPASSED | NO |
| "User feels ready" | Transition EVALUATING → READY_TO_ACT (existing) — user authority gates existing transition | NO |
| "User commits to action" | Transition READY_TO_ACT → IN_TRANSITION (existing) — user action gates existing transition | NO |
| "Person determines completion" | Transition IN_TRANSITION → SETTLED (existing) — user determination gates existing transition | NO |
| "Reconsideration" | Within current state (existing) — no state change | NO |
| "Re-entry" | Backwards transition between existing states (new transitions, not new states) | NO |
| "Pause/Return" | No state change — tos_phase preserved (existing) | NO |
| "SETTLED user converses" | SETTLED (existing) — conversational support added, no state change | NO |

**What IS needed (not new states):**
1. New backwards transitions (e.g., EVALUATING → CONFIRMING, READY_TO_ACT → EVALUATING) — these use existing states with new transition paths
2. New authority gates at each forward boundary — these are orchestration logic, not states
3. Conversational support in all 7 states — this is generation/prompt and orchestration, not states
4. Engine wiring — this is orchestration calling existing engines, not states
5. Reconsideration/re-entry tracking — this could use the existing operational_picture_history field (exists, not wired)

**Engineering evidence confirms: the 7 existing tos_phase states + soak sub-state are sufficient.** The gap is not in the state model — it's in the authority layer and conversational coverage between states.

---

## Part 7: Remediation Sequence Assessment

### Should this be one packet or several ordered packets?

**Recommendation: Several ordered packets.** A single large packet would be high-risk and difficult to review. The boundaries have a natural dependency chain, and the existing R1-C.1E-proven behaviour must be protected at each step.

### Proposed Sequence

```
Packet 1: CONVERSATIONAL LIFELINE
  - Remove PHASE_OUT_OF_SCOPE dead-end
  - Add state-aware conversational support for all 7 states
  - Smudge can acknowledge where the user is, answer questions, explain what's available
  - No engine wiring yet — just make Smudge conversational everywhere
  - Fixes: Invariant, Rule 9 (partially), Boundary 8 (partially)
  - Risk: LOW (additive — doesn't touch EXPLORING/CONFIRMING pipeline)
  - Dependency: None

Packet 2: CONFIRMATION AUTHORITY GATE
  - Decouple validation from progression at CONFIRMING → CONFIRMED
  - Add "explain/invite" step after validation
  - Add user authority signal for progression (distinct from validation)
  - Fixes: Boundary 2, Rule 1 (partially), Rule 2, Signal #1, Signal #3
  - Risk: MEDIUM (changes proven confirmation flow — needs careful testing)
  - Dependency: Packet 1 (user must be able to converse in CONFIRMED after advancing)

Packet 3: CAPABILITY HANDOVER
  - Wire CONFIRMED → EVALUATING through Smudge
  - Smudge explains → user authorises → engine invoked → Smudge presents
  - Add authority gate at CONFIRMED → EVALUATING
  - Fixes: Boundary 3, Rule 3 (partially), Signal #4
  - Risk: LOW (additive — wiring new path, engine already tested)
  - Dependency: Packets 1 & 2

Packet 4: DECISION READINESS HANDOVER
  - Wire EVALUATING → READY_TO_ACT through Smudge
  - Smudge briefs findings → supports soak conversation → asks readiness → user authorises
  - Add authority gate at EVALUATING → READY_TO_ACT
  - Soak sub-state machine remains as-is
  - Fixes: Boundary 4, Rule 4, Signal #5, Signal #6
  - Risk: LOW (additive — soak mechanism already tested)
  - Dependency: Packet 3

Packet 5: TRANSITION PARTNERSHIP HANDOVER
  - Wire READY_TO_ACT → IN_TRANSITION and IN_TRANSITION → SETTLED through Smudge
  - User commits to action → Smudge invokes start_journey
  - Smudge prompts → user determines → Smudge invokes conclude_journey
  - Add authority gates at both boundaries
  - All 15 engine actions accessible through Smudge
  - SETTLED remains conversational (from Packet 1)
  - Fixes: Boundaries 5 & 6, Rule 5, Rule 6, Signal #7, Signal #8
  - Risk: LOW (additive — engine already tested with 16/16 tests)
  - Dependency: Packet 4

Packet 6: RECONSIDERATION & RE-ENTRY
  - Add backwards transitions between existing states
  - Enrichment (update evidence, no state change) in all states
  - Reconsideration (re-evaluate within current phase) in all states
  - Re-entry (return to previous work) with user authority
  - Wire operational_picture_history for audit trail
  - Preserve history — never silently reset
  - Fixes: Boundary 7, Rule 7, Rule 8, Rule 10
  - Risk: MEDIUM (new backwards transitions — but follows RE_EXPLORING pattern from CONFIRMING)
  - Dependency: Packets 1-5 (need forward path working before backwards path is meaningful)

Cross-cutting (applies to all packets):
  - Each packet must include regression tests for EXPLORING/CONFIRMING pipeline
  - Each packet must include acceptance tests for the new behaviour
  - No packet may break the R1-C.1E-proven extraction/sufficiency/confirmation pipeline
  - Signal audit must be re-run after each packet to verify no new conflation introduced
```

### Why This Sequence

1. **Packet 1 first** because everything depends on Smudge being conversational. You can't wire "Smudge explains what happens next" if Smudge returns a static response. This is the foundational fix.

2. **Packet 2 second** because it fixes the SMUDGE 5 failure class (F3: confirming = progression) in the existing conversational layer, without requiring any engine wiring. This is the highest-risk change to proven behaviour, so it should be done in isolation.

3. **Packets 3-5 are the "railway building"** — wiring existing, tested engines through Smudge. Each is additive and depends on the previous boundary being wired. They follow the lifecycle naturally.

4. **Packet 6 last** because reconsideration/re-entry requires all forward paths to work first. You can't re-enter a state that doesn't function. This also follows the RE_EXPLORING pattern already proven in CONFIRMING, extending it to other states.

### Packet Size

Each packet is small and focused:
- Packet 1: Orchestration + generation changes (no engine work)
- Packet 2: companionCore + generation changes (no engine work)
- Packets 3-5: Orchestration + engine wiring (engines unchanged, only wiring added)
- Packet 6: Orchestration + persistence + generation

No packet requires a large rewrite. The engines are already built and tested. The work is primarily in the orchestration layer — adding authority gates, conversational support, and engine invocation. The generation layer needs new state-specific prompts, but these are additive.

---

## Part 8: Regression Risk Summary

| Packet | What It Touches | R1-C.1E Regression Risk | Mitigation |
|---|---|---|---|
| 1 (Lifeline) | Phase routing gate (line 953) — additive only | LOW | EXPLORING/CONFIRMING pipeline untouched. New code only runs for post-CONFIRMED states. |
| 2 (Authority Gate) | companionCore confirmation flow + generation prompt | MEDIUM | Extraction, sufficiency, discovery merge untouched. Only the CONFIRMING→CONFIRMED transition logic changes. Test: re-run R1-C.1E T7b, T8, T9 after change. |
| 3 (Capability) | New orchestration path for CONFIRMED→EVALUATING | LOW | Entirely additive. Engine already tested. EXPLORING/CONFIRMING untouched. |
| 4 (Decision) | New orchestration path for EVALUATING→READY_TO_ACT | LOW | Same as Packet 3. Soak sub-state machine untouched. |
| 5 (Transition) | New orchestration path for READY_TO_ACT→SETTLED | LOW | Same as Packet 3. Engine already tested (16/16). |
| 6 (Re-entry) | New backwards transitions + history tracking | MEDIUM | Follows RE_EXPLORING pattern from CONFIRMING (proven). Persistence changes need careful testing. |

**Highest risk:** Packet 2 — changes the confirmation flow that R1-C.1E proved. This is the SMUDGE 5 fix and must be carefully tested.

**Lowest risk:** Packets 1, 3, 4, 5 — additive work that doesn't modify proven paths.

---

## Summary

The contract is architecturally sound against the existing state model. The 7 tos_phase states + soak sub-state are sufficient. No new states are needed.

The gaps fall into three categories:
1. **Conversational dead-ends** (Invariant violation) — 5 of 7 states return static responses. Fix: Packet 1.
2. **Conflated signals** (SMUDGE 5 class) — validation = progression, system judgement = lifecycle authority. Fix: Packet 2 + authority gates in Packets 3-5.
3. **Unwired engines** (missing railway) — 4 engines with 26 actions exist but are disconnected from Smudge. Fix: Packets 3-5.

The remediation can be done as 6 ordered packets, each small and focused. The engines are already built and tested. The work is primarily orchestration — adding authority gates, conversational support, and engine invocation. No large rewrite is needed. The "railway between the stations" is an orchestration layer, not a rebuild of the stations themselves.

No engineering authority requested. Awaiting Paul & Cipher's review to agree Design Intent and engineering sequence.
