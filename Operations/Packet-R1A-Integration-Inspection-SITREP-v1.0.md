# Packet R1-A SITREP — Smudge ↔ Engine Integration & Runtime Inspection

**Operation:** PROOF — Human Test Readiness Gate R1  
**Packet:** R1-A — Integration Readiness Inspection  
**Authority:** INSPECTION ONLY — No implementation, no production changes  
**Date:** 18 August 2026  
**Author:** Ash (Chief Engineer)  

---

## Verdict

**R1-A FAIL — Material integration bridge absent**

The five MATE engines and companionService are deployed, callable, and individually proven. The action contract is documented and the lifecycle guards are correct. However, the actual integration bridge between the conversational layer (Smudge/UI) and the engine layer cannot be evidenced as functional. No UI files exist in the repository. The app is not publicly accessible for inspection. No UserProfile updates have occurred since Operation BUILD testing (8 August 2026), strongly suggesting the conversation UI does not currently call the engines through the designed action interface.

The machinery is proven. The bridge to the machinery is not.

---

## A. Deployed Integration Architecture

### Actual-Flow Trace

```
User → UI (Base44 app, pages not in repo)
         → [UNKNOWN: conversation component?]
            → [UNKNOWN: calls companionService?]
               → companionService (POST /api/functions/companionService)
                  → reads UserProfile (user-scoped, RLS)
                  → deserializes profile (explicit adapter)
                  → processes new_discoveries + user_response_type
                  → persists to UserProfile (service-role write, serialized)
                  → returns session + flow_guidance + profile
               ← [UNKNOWN: UI consumes response?]
            ← [UNKNOWN: UI reflects state to user?]
         ← [UNKNOWN: response rendered?]
      ← User sees response
```

**Missing links (marked UNKNOWN):**

1. Whether the UI conversation component calls companionService with structured `new_discoveries`
2. Whether the UI passes the correct `profile_id` from the authenticated user's session
3. Whether the UI passes `user_response_type` for confirmation/correction signals
4. Whether the UI consumes the `flow_guidance` to shape conversational responses
5. Whether the UI calls any of the other four engines directly (capability, decision, partnership)
6. Whether the UI reads `tos_phase` from UserProfile or from another source
7. Whether the UI generates AI responses using Base44's built-in AI or an external LLM

### Smudge Architecture — What Is Known

| Question | Answer | Evidence |
|----------|--------|----------|
| Where is Smudge defined? | UNKNOWN — no UI files in repo; app is in Base44 builder (not inspectable via repo) | Repo file listing: 0 page/component files |
| System/prompt/instruction sources | UNKNOWN — not accessible | App is private, in error state |
| Conversation/session persistence | NONE — no conversation entity exists | Entity schema list: 6 entities, none for chat/conversation |
| Tools/actions available to Smudge | UNKNOWN — not accessible | UI code not in repo |
| Can Smudge invoke any of the five engines? | UNKNOWN — not evidenced | No UserProfile updates since 8 Aug 2026 (Operation BUILD) |
| How is profile_id obtained? | UNKNOWN — profileBootstrap exists and creates profiles (user-scoped, RLS), but whether the UI calls it on entry is unconfirmed | profileBootstrap.ts: user-scoped list → create if missing |
| Does Smudge read tos_phase? | UNKNOWN — companionService returns `profile_phase` in response, but whether Smudge reads or uses it is unconfirmed | companionService response: `session.profile_phase` |
| Does Smudge maintain its own lifecycle concept? | UNKNOWN | — |
| Hard-coded phase terminology in UI? | UNKNOWN — no UI files to search | — |
| Direct entity/database access by conversational layer? | UNKNOWN | — |

### companionService — The Designed Bridge

The companionService is the only designed integration point between conversation and engines. Its interface:

```
POST /api/functions/companionService
Body: {
  profile_id: string,           // required
  current_mode: string,          // optional, defaults to 'EXPLORING'
  new_discoveries: object,       // optional, structured profile fields
  user_response_type: string     // optional, 'answering'|'correcting'|'confirming'|'rejecting'
}
```

**What it does:**
- Reads UserProfile by profile_id (user-scoped, RLS-enforced)
- Deserializes profile (explicit adapter)
- If `new_discoveries` provided: merges into profile, recalculates assessment, persists
- Returns: session context (mode, areas, phase, confidence, confirmed), flow guidance (next area, reflection content, behavioural notes), full profile

**What it does NOT do:**
- Does NOT accept raw text messages
- Does NOT generate conversational/AI responses
- Does NOT parse natural language
- Does NOT persist conversation history
- Does NOT call any other engine

**Design intent:** companionService is an orchestration layer for an upstream LLM. Smudge (the conversational AI) is expected to:
1. Receive the user's message
2. Extract structured discoveries from the conversation
3. Call companionService with those discoveries
4. Use the returned flow guidance to shape the next response
5. Generate the conversational reply using the LLM

**Deployed evidence:** companionService works correctly (smoke-tested with Bodge, 200 OK, all fields deserialized). But no evidence that any UI component calls it.

---

## B. Actual Smudge → Engine Capability

| Capability | Engine Status | UI Connection | Evidence |
|-----------|---------------|---------------|----------|
| Profile bootstrap | profileBootstrap deployed, user-scoped, RLS | UNKNOWN | Function exists; UI calls not confirmed |
| Discovery/Understanding | companionService deployed, verified | UNKNOWN | No profile updates since BUILD |
| Assessment confidence | companionService deployed, verified | UNKNOWN | — |
| Operational Picture confirmation | companionService deployed, verified | UNKNOWN | — |
| Capability Intelligence | engineCapabilityIntelligence deployed, verified | UNKNOWN | — |
| Decision Readiness (soak, pathways) | engineDecisionReadiness deployed, verified | UNKNOWN | — |
| Transition Partnership (journey, commitments) | engineTransitionPartnership deployed, verified | UNKNOWN | — |
| Journey checkpoints | engineTransitionPartnership deployed, verified | UNKNOWN | — |

**Summary:** Every engine capability is deployed and individually verified. Zero are confirmed connected to the UI.

---

## C. Five-Engine Action-Contract Matrix

### Engine 1: engineUnderstanding.ts (Assessment Only)

| Property | Value |
|----------|-------|
| Action model | None — processes discovery fields directly |
| Required | `profile_id` |
| Optional | `full_name`, `contact_email`, `service_branch`, `rank`, `years_served`, `professional_identity`, `service_history`, `personal_context`, `goals`, `operational_context`, `user_confidence` |
| Lifecycle preconditions | None enforced (operates on any existing profile) |
| Evidence requirements | 15-char substance threshold for 6 operational areas |
| State-changing | **NO** — does NOT persist `tos_phase` or `operational_picture_confirmed` (Packet 2B v1.1) |
| Response | `profile`, `operational_picture`, `area_assessments`, `assessment_confidence`, `missing_areas`, `phase`, `ready_for_confirmation`, `can_proceed_to_phase_three` |
| Explicit user decision | No — assessment engine only |

### Engine 2: companionService.ts (Orchestration + Lifecycle Ownership)

| Property | Value |
|----------|-------|
| Action model | None — processes discoveries + response type |
| Required | `profile_id` |
| Optional | `current_mode` (EXPLORING\|REFLECTING\|CONFIRMING\|CONFIRMED\|RE_EXPLORING), `new_discoveries` (object), `user_response_type` (answering\|correcting\|confirming\|rejecting) |
| Lifecycle preconditions | Active profile in EXPLORING or CONFIRMING for state changes |
| Evidence requirements | All 6 areas substantive (≥15 chars) for readyForConfirmation |
| State-changing | **YES** — owns EXPLORING→CONFIRMING and CONFIRMING→CONFIRMED |
| Response | `session` (mode, areas, phase, confidence, confirmed), `flow_guidance` (next_area, reflection_content, behavioural_notes), `profile`, `engine_result` |
| Explicit user decision | **YES** — `user_response_type: 'confirming'` triggers CONFIRMED; `'rejecting'`/`'correcting'` triggers RE_EXPLORING |

**Internal vocabulary:** ConversationMode type includes REFLECTING and RE_EXPLORING — these are session-only states, NOT persisted to `tos_phase`. Correct behaviour.

### Engine 3: engineCapabilityIntelligence.ts (5 Actions)

| Action | Required | Optional | Preconditions | State-Changing | User Decision |
|--------|----------|----------|---------------|----------------|--------------|
| `validate_preconditions` | action, profile_id | — | None (evaluates state) | No | No |
| `seed_evidence` | action, profile_id | — | None | Populates evidence_log | No |
| `submit_capabilities` | action, profile_id, capabilities[] | transferability_notes | opc=true, assessment ≥ MODERATE, branch+history present, evidence_log non-empty; tos_phase in CONFIRMED/EVALUATING/Evaluate | Updates capability_map, confidence_scores, tos_phase→EVALUATING | No (Smudge submits) |
| `get_capability_picture` | action, profile_id | — | Preconditions met | No (read-only) | No |
| `advance_phase` | action, profile_id | — | Preconditions met, capability_map non-empty, tos_phase in CONFIRMED/EVALUATING/Evaluate | tos_phase→EVALUATING | Yes (authorises evaluation) |

**Evidence Rule (hard gate):** Every capability must include ≥1 valid `evidence_ref` resolving to evidence_log. Capabilities without evidence are rejected.

**Legacy compatibility:** Accepts `'Evaluate'` alongside `'EVALUATING'` (line 328) — backwards compatibility for PROOF-era profiles.

### Engine 4: engineDecisionReadiness.ts (6 Actions)

| Action | Required | Optional | Preconditions | State-Changing | User Decision |
|--------|----------|----------|---------------|----------------|--------------|
| `get_status` | action, profile_id | — | tos_phase in EVALUATING/READY_TO_ACT, capability_map non-empty | No | No |
| `record_decision_factor` | action, profile_id, decision_factors_update | — | tos_phase in EVALUATING/READY_TO_ACT, capability_map non-empty | Updates decision_factors | Yes (expressed priorities) |
| `evaluate_pathways` | action, profile_id | — | tos_phase in EVALUATING/READY_TO_ACT, capability_map non-empty | Updates recommended_pathways | No (algorithmic) |
| `initiate_soak` | action, profile_id | — | soak_period.state=NOT_STARTED | soak_period.state→SOAKING (tos_phase stays EVALUATING) | Yes |
| `complete_soak` | action, profile_id, reflection_notes (≥15 chars) | — | soak_period.state=SOAKING, pathways non-empty, ≥1 decision factor | soak_period→COMPLETED, tos_phase→READY_TO_ACT | Yes |
| `bypass_soak` | action, profile_id, soak_bypass_reason (≥10 chars) | — | soak_period.state=SOAKING, pathways non-empty, ≥1 decision factor | soak_period→BYPASSED, tos_phase→READY_TO_ACT | Yes |

### Engine 5: engineTransitionPartnership.ts (15 Actions)

| Action | Required | Optional | Preconditions | State-Changing | User Decision |
|--------|----------|----------|---------------|----------------|--------------|
| `start_journey` | action, profile_id | — | tos_phase=READY_TO_ACT, soak completed/bypassed, capability_map non-empty | Creates TransitionJourney, tos_phase→IN_TRANSITION | Yes |
| `get_journey_status` | action, profile_id | — | Journey exists | No | No |
| `record_commitment` | action, profile_id, description | target_date | Active journey | Appends commitment | Yes |
| `update_commitment` | action, profile_id, commitment_id, new_status | revised_description | Active journey, commitment exists | Updates status, auto-checkpoint | Yes |
| `update_transition_status` | action, profile_id, transition_status_update | — | Active journey | Updates transition_status | Yes |
| `record_blocker` | action, profile_id, blocker | — | Active journey | Appends blocker, auto-checkpoint | Yes |
| `resolve_blocker` | action, profile_id, blocker | — | Active journey | Removes blocker, auto-checkpoint | Yes |
| `record_milestone` | action, profile_id, milestone_text | — | Active journey | Appends milestone | Yes |
| `record_referral` | action, profile_id, organisation, reason | — | Active journey | Appends referral, auto-checkpoint | Yes |
| `update_confidence` | action, profile_id, confidence_band | confidence_trend | Active journey | Updates confidence, auto-checkpoint on band shift | No (observation) |
| `update_wellbeing` | action, profile_id, observation | — | Active journey | Sets wellbeing_awareness, auto-checkpoint if new | Yes |
| `update_partnership_state` | action, profile_id, new_state | reason (≥15 chars if INDEPENDENT) | Active journey, valid state transition | Updates partnership_state, auto-checkpoint; if INDEPENDENT→ tos_phase→SETTLED | Yes |
| `update_operational_readiness` | action, profile_id, operational_readiness | — | Active journey | Updates operational_readiness | No |
| `conclude_journey` | action, profile_id, summary (≥15 chars) | — | Active journey, valid state for INDEPENDENT | partnership_state→INDEPENDENT, tos_phase→SETTLED, auto-checkpoint | Yes |
| `update_direction` | action, profile_id, new_direction | — | Active journey | Updates direction, auto-checkpoint on change | Yes |

**Total across all engines:** 26 actions + 1 implicit (engineUnderstanding) = 27 callable entry points.

---

## D. Explicit-Decision Boundary Findings

### CONFIRMING → CONFIRMED

**Engine:** companionService  
**Action:** Implicit (no action parameter)  
**Required signal:** `user_response_type: 'confirming'`  
**Guarded by:** Three conditions must ALL be true:
1. `profile.tos_phase === 'CONFIRMING'` (persisted state at start of call)
2. `user_response_type === 'confirming'` (explicit caller signal)
3. `readyForConfirmation === true` (all 6 areas substantively ready)

**Result:** `tos_phase` → `CONFIRMED`, `operational_picture_confirmed` → `true`

**Can the system infer this without explicit user expression?** No. The `user_response_type` parameter must be explicitly set to `'confirming'` by the caller. The engine does not infer confirmation from data content or area completion. The guard on `tos_phase === 'CONFIRMING'` prevents premature confirmation.

**Does any deployed Smudge/UI route generate `user_response_type: 'confirming'`?** UNKNOWN — no UI files to inspect. No evidence of this parameter being used in any deployed call.

### IN_TRANSITION → SETTLED

**Engine:** engineTransitionPartnership  
**Actions:** `conclude_journey` OR `update_partnership_state` (with `new_state: 'INDEPENDENT'`)

**conclude_journey:** Requires `summary` ≥15 chars. Sets partnership_state→INDEPENDENT, tos_phase→SETTLED.  
**update_partnership_state:** Requires `reason` ≥15 chars when new_state=INDEPENDENT. Sets tos_phase→SETTLED.

**Can the system infer this without explicit user expression?** No. Both routes require a substantive text submission (≥15 chars). The engine does not infer settlement from time, activity, or state.

**Does any deployed Smudge/UI route call `conclude_journey` or `update_partnership_state` with INDEPENDENT?** UNKNOWN — no UI files to inspect. No evidence of these actions being called from any deployed UI route.

**Assessment:** Both decision boundaries are correctly guarded in the engine layer. The risk is not that the engine would infer the decision — it's that no deployed route is confirmed to generate the required signal.

---

## E. UI ↔ Lifecycle Mapping

**Finding:** The repository contains zero UI files. All UI/page/component code lives in the Base44 app builder and is not synced to the GitHub repo. The app (ID: `6a75d6b58496a73bf2165dec`) is in `error` state and not publicly accessible.

| Lifecycle State | UI Reaction | Evidence |
|----------------|-------------|----------|
| EXPLORING | UNKNOWN | No UI files |
| CONFIRMING | UNKNOWN | No UI files |
| CONFIRMED | UNKNOWN | No UI files |
| EVALUATING | UNKNOWN | No UI files |
| READY_TO_ACT | UNKNOWN | No UI files |
| IN_TRANSITION | UNKNOWN | No UI files |
| SETTLED | UNKNOWN | No UI files |

**Phase-specific components:** UNKNOWN  
**Phase-specific prompts:** UNKNOWN  
**Progress indicators:** UNKNOWN  
**Buttons/actions:** UNKNOWN  
**Redirects:** UNKNOWN  
**Hard-coded assumptions:** UNKNOWN  
**Lifecycle states producing no visible behavioural change:** UNKNOWN  

**Source of lifecycle truth for UI:** UNKNOWN — whether the UI reads `UserProfile.tos_phase` or maintains its own concept.

**Prior evidence (Operation EXPERIENCE SITREP, 14 Aug 2026):**
- Pathways page: PLACEHOLDER
- Profile page: PLACEHOLDER
- Progress page: PLACEHOLDER
- Learning page: PLACEHOLDER
- Resources page: PLACEHOLDER
- Settings page: PLACEHOLDER
- Need Support page: PLACEHOLDER
- Conversation/Smudge: UNKNOWN CONNECTION to companionService

**Assessment:** The UI ↔ lifecycle integration is the single largest unknown in the MATE system. Without UI inspection, 7 of the 11 SITREP sections contain UNKNOWN as a primary finding. This is the critical gap.

---

## F. Serialization/Runtime Matrix

| Engine | parseJSON | deserializeProfile | serializeForPersistence | JSON.parse | JSON.stringify | Classification |
|--------|-----------|-------------------|----------------------|------------|----------------|----------------|
| engineUnderstanding | ✅ Defined (L72) | ✅ Defined (L78) | ❌ Absent | ✅ (L75) | ✅ (L309, response only) | **SAFE — explicit boundary** (proven Packet 2C) |
| companionService | ✅ Defined (L4) | ✅ Defined + Called (L20, L304, L364) | ✅ Defined + Called (L10, L359) | ✅ (L7) | ✅ (L14, L406) | **SAFE — explicit boundary** (original pattern source) |
| engineCapabilityIntelligence | ❌ Absent | ❌ Absent | ❌ Absent | ❌ | ❌ | **UNPROVEN** |
| engineDecisionReadiness | ❌ Absent | ❌ Absent | ❌ Absent | ❌ | ❌ | **UNPROVEN** |
| engineTransitionPartnership | ❌ Absent | ❌ Absent | ❌ Absent | ❌ | ❌ | **UNPROVEN** |

### Detailed Analysis

**engineUnderstanding.ts** — Defines `parseJSON` and `deserializeProfile` but does NOT call `deserializeProfile` in the request handler after `UserProfile.get()`. Reads rely on SDK auto-deserialization with fallback arrays. Does NOT call `serializeForPersistence` on write — passes native objects to `update()`. Classified SAFE because Packet 2C-T2 proved this works in deployed state, but the write path relies on SDK auto-serialization.

**companionService.ts** — Full bidirectional adapter pipeline: `deserializeProfile` called immediately after every `get()` and `update()`, `serializeForPersistence` called before every `update()`. This is the canonical pattern. SAFE.

**engineCapabilityIntelligence.ts** — No adapters. Reads `profile.service_history`, `profile.evidence_log`, `profile.capability_map` directly. Uses `Array.isArray()` on `capabilities` (input parameter, safe). Uses `profile.evidence_log?.length`, `profile.assessment_confidence?.rating` directly. If fields are JSON strings, `.length` returns string length (not array length) and `.rating` returns `undefined`. Currently works because SDK auto-deserializes. UNPROVEN.

**engineDecisionReadiness.ts** — No adapters. Uses defensive `Array.isArray()` guards on `profile.capability_map`, `profile.evidence_log`, `profile.recommended_pathways`. Uses `Object.entries(profile.decision_factors || {})`. If fields are JSON strings: `Array.isArray()` returns false → false-positive precondition failures; `Object.entries("string")` iterates characters → incorrect behaviour. Currently works because SDK auto-deserializes. UNPROVEN.

**engineTransitionPartnership.ts** — No adapters. Uses `Array.isArray()` on `profile.capability_map`, `profile.recommended_pathways`. Uses `journey.active_commitments`, `journey.current_blockers` with `Array.isArray()` guards. Same risk profile. Currently works because SDK auto-deserializes. UNPROVEN.

### Key Insight

All three UNPROVEN engines currently pass smoke tests with Bodge's profile. This means the Base44 SDK IS auto-deserializing structured fields on `get()` in the current deployed state. However, Packet 2 proved that SDK implicit conversion can break after function redeployment. The safe contract is explicit adapters — the current working state is not a guarantee.

**Smoke test evidence (18 Aug 2026):**
- engineCapabilityIntelligence `get_capability_picture` → 200 OK, 3 capabilities returned correctly
- engineDecisionReadiness `get_status` → 200 OK, capability_count=3, pathway_count=3, soak COMPLETED
- companionService (bare session read) → 200 OK, all 14 structured fields deserialized correctly

---

## G. Competing Lifecycle / Source-of-Truth Findings

### Competing Sources (require resolution)

| # | Location | Finding | Classification |
|---|----------|---------|----------------|
| G-1 | engineCapabilityIntelligence.ts:324-328 | Accepts `'Evaluate'` alongside `'EVALUATING'` for backwards compatibility with PROOF-era profiles | COMPETING SOURCE (legacy alias) |
| G-2 | Operations/MATE-Engine-Interface-Contract-v0.1.md:81, 256, 287 | Describes engineUnderstanding writing `tos_phase` and `operational_picture_confirmed` (pre-Packet 2B) and uses `'Evaluate'` as persisted phase | COMPETING SOURCE (stale documentation) |
| G-3 | Operations/Consolidation-Report-v1.0.md:117, 122, 123 | Architecture diagram shows `Discover`, `Understand`, `Evaluate` as tos_phase values | COMPETING SOURCE (stale documentation) |

### Internal Vocabulary (correct, not competing)

| # | Location | Finding | Classification |
|---|----------|---------|----------------|
| G-4 | companionService.ts:63 | `ConversationMode` type includes `REFLECTING` and `RE_EXPLORING` — session-only modes, NOT persisted to tos_phase | INTERNAL VOCABULARY (correct) |
| G-5 | Packet-2B-v1.1-LOCKED.md:168-175 | Internal term mapping: Discover→EXPLORING, Understand→CONFIRMING, Evaluate→EVALUATING | INTERNAL VOCABULARY (documented) |

### Legacy/Test Files (not deployed, but in repo)

| # | File | Finding | Classification |
|---|------|---------|----------------|
| G-6 | functions/createTestProfile.ts | Test profile creation utility. Writes tos_phase='EXPLORING'. NOT deployed. | LEGACY/TEST |
| G-7 | functions/engineUnderstanding_mate.ts | Duplicate of engineUnderstanding with Packet 2C changes. NOT deployed. | LEGACY/TEST |
| G-8 | functions/engineUnderstanding_r2.ts | Duplicate of engineUnderstanding with runtime restoration. NOT deployed. | LEGACY/TEST |
| G-9 | functions/pilotAccountReset.ts | Admin reset utility. Resets tos_phase='EXPLORING'. Deployed but NOT part of MVP core journey. | LOCKED CONTRACT (admin tool) |

### No Competing Source Found In

- **UI/page/component files:** None exist in repo
- **Entity schemas:** UserProfile.json correctly defines 7-value tos_phase enum
- **profileBootstrap.ts:** Correctly initialises tos_phase='EXPLORING'
- **engineUnderstanding.ts:** Correctly omits tos_phase and operational_picture_confirmed from writes

---

## H. Findings Classified

### C0 — Critical (blocks pilot readiness)

| # | Finding | Evidence |
|---|---------|----------|
| C0-1 | **Smudge ↔ Engine integration bridge not confirmed** — No evidence that the conversation UI calls companionService or any engine. No UserProfile updates since 8 Aug 2026. No UI files to inspect. | KNOWN: repo has 0 UI files; app not publicly accessible; Operation EXPERIENCE SITREP states "presentation layer without reliably triggering engine-state changes" |
| C0-2 | **No conversation persistence** — No entity or field stores conversation history. If the UI stores conversation in client-side state only, context is lost on page refresh. | KNOWN: entity schema list contains no conversation entity |
| C0-3 | **Serialization adapters missing from 3 engines** — engineCapabilityIntelligence, engineDecisionReadiness, engineTransitionPartnership have no explicit adapters. Currently work via SDK auto-deserialization, which Packet 2 proved is not a safe contract. | KNOWN: code inspection; UNPROVEN classification per Packet 2 Test Receipt |

### C1 — Significant (should resolve before pilot)

| # | Finding | Evidence |
|---|---------|----------|
| C1-1 | **Profile bootstrap → engine connection not confirmed** — profileBootstrap exists and creates profiles correctly, but whether the UI calls it on first authenticated entry is unknown. If not, new users get 404 on every engine call. | INFERRED: function exists, UI connection unknown |
| C1-2 | **UI lifecycle awareness unknown** — Operation EXPERIENCE identified 7 placeholder surfaces. Whether any surface reacts to tos_phase is unconfirmed. | KNOWN: SITREP v1.0 placeholder assessment |
| C1-3 | **Legacy 'Evaluate' alias in engineCapabilityIntelligence** — Accepts non-canonical `'Evaluate'` alongside `'EVALUATING'`. Backwards compatibility for PROOF-era profiles, but introduces a competing source of truth. | KNOWN: code line 328 |
| C1-4 | **Legacy non-deployed files in functions/** — 3 test/duplicate files (createTestProfile, engineUnderstanding_mate, engineUnderstanding_r2) remain in repo. Not deployed but create confusion. | KNOWN: repo file listing |

### C2 — Minor (visibility/defer)

| # | Finding | Evidence |
|---|---------|----------|
| C2-1 | Stale documentation (MATE Engine Interface Contract v0.1, Consolidation Report v1.0) describes pre-Packet 2B lifecycle behaviour | KNOWN: documentation review |
| C2-2 | companionService `current_mode` defaults to EXPLORING regardless of persisted tos_phase — if called without correct mode, returns incorrect flow guidance | KNOWN: code line 290 |
| C2-3 | Duplicated assessment confidence logic in engineUnderstanding and companionService — could produce different values if both are called | KNOWN: code inspection |
| C2-4 | engineUnderstanding defines deserializeProfile but does not call it in handler — relies on SDK auto-deserialization for reads | KNOWN: code inspection |
| C2-5 | `user_confidence` stored as string "6" but schema defines type: number — type mismatch persists from Packet 2 | KNOWN: smoke test response |

---

## I. What Is Already Pilot-Ready

| Component | Status | Evidence |
|-----------|--------|----------|
| engineUnderstanding | ✅ Pilot-ready | Deployed, verified, Packet 2C proven |
| companionService | ✅ Pilot-ready | Deployed, verified, canonical adapters, lifecycle guards correct |
| engineCapabilityIntelligence | ✅ Pilot-ready (with serialization risk) | Deployed, verified, works via SDK auto-deserialization |
| engineDecisionReadiness | ✅ Pilot-ready (with serialization risk) | Deployed, verified, works via SDK auto-deserialization |
| engineTransitionPartnership | ✅ Pilot-ready (with serialization risk) | Deployed, verified, works via SDK auto-deserialization |
| profileBootstrap | ✅ Pilot-ready | Deployed, user-scoped, RLS-compliant, idempotent |
| Canonical lifecycle contract | ✅ Pilot-ready | 7-state, single-owner, guards proven across Packets 1-2 |
| Lifecycle guards (both decision boundaries) | ✅ Pilot-ready | CONFIRMING→CONFIRMED and IN_TRANSITION→SETTLED correctly guarded |
| Entity schemas | ✅ Pilot-ready | 5 MATE entities + User, RLS-enabled |
| Bodge regression baseline | ✅ Intact | 1 profile, 1 journey, 9 checkpoints |

---

## J. What Specifically Prevents Pilot Readiness

### 1. The integration bridge (C0-1)

The single largest gap. The engines are proven. The companionService bridge is designed and deployed. But the actual connection between the conversation UI and the engine layer is not evidenced. Without this bridge, a user talking to Smudge is talking to a presentation layer — no engine state changes, no lifecycle progression, no evidence persistence.

**What is needed:** Confirm whether the Base44 app's conversation component calls companionService. If it does, verify the call parameters (profile_id, new_discoveries, user_response_type). If it does not, build the integration.

**Blocker:** UI code is not in the repo and the app is not publicly accessible. This requires either (a) Paul granting UI access for inspection, or (b) Paul confirming the UI behaviour visually.

### 2. Conversation persistence (C0-2)

No conversation entity exists. If conversation is stored only in client-side state, context is lost on refresh. For a companion that is supposed to maintain continuity, this is a design gap.

**What is needed:** Either a conversation entity or a documented decision that conversation is ephemeral and companionService provides sufficient session context on each call.

### 3. Serialization safety (C0-3)

Three engines lack explicit adapters. They work now, but Packet 2 proved SDK auto-deserialization is not a safe contract. If any of these engines are redeployed and the SDK behavior changes, they will break silently — returning incorrect results without erroring.

**What is needed:** Install the companionService adapter pattern (parseJSON, deserializeProfile, serializeForPersistence) in all three engines. This is bounded, mechanical work — the pattern is proven and the code is small.

### 4. UI lifecycle awareness (C1-2)

7 placeholder surfaces identified. The UI needs to react to tos_phase changes and drive the correct engine actions. Without this, the user sees static pages regardless of their journey state.

**What is needed:** Wire each UI surface to the corresponding engine action. This is the bulk of the integration work.

### 5. Profile bootstrap confirmation (C1-1)

profileBootstrap exists and works, but whether the UI calls it on first entry is unknown. If it doesn't, new users hit 404 on every engine call.

**What is needed:** Confirm the UI calls profileBootstrap on authenticated entry. If not, add the call.

---

## K. Minimum Recommended R1 Implementation Scope

The following is the minimum bounded work to move from R1-A FAIL to pilot readiness. Implementation is NOT authorised in this packet — this is the recommended scope for R1-B.

### Phase 1: Inspection Resolution (no code changes)

1. **Grant UI access for inspection** — Paul provides access to the Base44 builder page code, or confirms UI behaviour visually. This resolves C0-1 and C1-1 for the majority of UNKNOWNs.
2. **Clean legacy files from repo** — Remove createTestProfile.ts, engineUnderstanding_mate.ts, engineUnderstanding_r2.ts from functions/. (C1-4)

### Phase 2: Serialization Hardening (bounded, mechanical)

3. **Install adapters in 3 engines** — Add `parseJSON`, `deserializeProfile`, `serializeForPersistence` to engineCapabilityIntelligence, engineDecisionReadiness, engineTransitionPartnership. Pattern is proven in companionService. (C0-3)
4. **Call deserializeProfile after every get()** — In all engines that read UserProfile. (C0-3)
5. **Call serializeForPersistence before every update()** — In all engines that write UserProfile. (C0-3)
6. **Remove 'Evaluate' legacy alias** — Once all profiles use canonical 'EVALUATING'. (C1-3)

### Phase 3: Integration Bridge (the core work)

7. **Confirm or build the Smudge → companionService call** — If the UI does not call companionService, build the integration. (C0-1)
8. **Confirm or build the engine call routing** — Smudge needs to call the right engine at the right lifecycle phase. (C0-1)
9. **Wire UI surfaces to engine state** — Replace placeholders with live data from engine responses. (C1-2)
10. **Confirm profileBootstrap is called on entry** — Ensure new users get a profile. (C1-1)

### Phase 4: Conversation Architecture (design decision)

11. **Decide on conversation persistence** — Either add a conversation entity or document that companionService provides sufficient session context. (C0-2)

### Phase 5: Verification

12. **Fresh-profile E2E** — Create a new profile via profileBootstrap, run the full MATE journey through the UI, verify every engine is called and every lifecycle transition fires correctly.
13. **Disruption exercise** — Failed interview → confidence drop → pause → return → recovery.

---

## Evidence Discipline

| Classification | Count | Items |
|---------------|-------|-------|
| KNOWN (directly evidenced) | 18 | All engine actions, serialization patterns, entity schemas, profileBootstrap behaviour, Bodge integrity, lifecycle guards |
| INFERRED (strongly indicated) | 3 | UI does not call engines (no profile updates since BUILD), SDK auto-deserializes on get() (smoke tests pass without adapters), profileBootstrap is not called on entry (no new profiles since BUILD) |
| UNKNOWN (requires later proof) | 11 | All UI ↔ lifecycle interactions, conversation persistence, Smudge architecture, profile_id routing, AI response generation, phase-specific UI components |

**NO ADVANCEMENT WITHOUT EVIDENCE.**

---

## Document Control

**Status:** R1-A SITREP — Inspection Complete  
**Verdict:** R1-A FAIL — Material integration bridge absent  
**Next:** Awaiting Paul's decision on R1-B implementation scope  
**Authority:** Inspection only. No implementation authorised.

---

*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
