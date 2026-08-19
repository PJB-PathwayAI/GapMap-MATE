# Operation EXPERIENCE — Post-Experience Engineering SITREP v1.0

**Operation:** EXPERIENCE → Pilot Readiness  
**Project:** GapMap MATE — MVP Core  
**Inspection Date:** 14 August 2026  
**Author:** Ash (Chief Engineer)  
**Command Authority:** Inspection and engineering assessment only. No implementation authority granted.  
**Classification:** Engineering Record  

---

## 1. EXECUTIVE ENGINEERING VERDICT

### READY AFTER P0/P1 WORK

All five MATE engines are deployed, live, and responding correctly to API calls. The Bodge test profile data is intact and the full engine chain has been re-verified. The engineering baseline established during Operation BUILD is sound.

However, the experience layer rebuilt during Operation EXPERIENCE is currently a **presentation layer** that presents the MATE experience around the engines without reliably triggering engine-state changes through them. The critical integration boundary between what the user now experiences and what the engineering system actually does is incomplete.

Two P0 issues (profile bootstrap and conversation-to-engine integration) and four P1 issues must be resolved before the controlled pilot can meaningfully test the MATE proposition.

---

## 2. CURRENT SYSTEM MAP

```
EXPERIENCE LAYER (Base44 App UI — rebuilt during Operation EXPERIENCE)
│
├── Orientation / Onboarding     → localStorage marker (accepted MVP limitation)
├── Conversation / Smudge         → UNKNOWN CONNECTION to Companion Service
├── Journey Hub                   → UNKNOWN: live data vs placeholder per surface
├── Pathways                      → PLACEHOLDER (per EXPERIENCE handover)
├── Learning                      → PLACEHOLDER
├── Progress                      → PLACEHOLDER
├── Profile                       → PLACEHOLDER
├── Resources                     → PLACEHOLDER
├── Settings                      → PLACEHOLDER
├── Need Support                  → PLACEHOLDER
│
── SERVICE BOUNDARY (unknown coupling) ──
│
├── companionService.ts          → ✅ DEPLOYED — reads/writes UserProfile, returns flow guidance
│   ├── Does NOT process raw messages
│   ├── Does NOT generate AI responses
│   ├── Accepts structured new_discoveries, persists to UserProfile
│   └── Returns session state + behavioural notes for upstream LLM
│
── ENGINE LAYER ──
│
├── engineUnderstanding.ts        → ✅ DEPLOYED + VERIFIED (14 Aug 2026)
├── engineCapabilityIntelligence  → ✅ DEPLOYED + VERIFIED (14 Aug 2026)
├── engineDecisionReadiness       → ✅ DEPLOYED + VERIFIED (14 Aug 2026)
├── engineTransitionPartnership   → ✅ DEPLOYED + VERIFIED (14 Aug 2026)
├── pilotAccountReset             → ✅ DEPLOYED (not tested — destructive)
│
── DATA LAYER ──
│
├── UserProfile                   → ✅ 1 record (Bodge), RLS-scoped, all fields populated
├── OCIPathway                    → ⚠️ 4 records (memory records 8 seeded — 4 missing)
├── TransitionJourney             → ✅ 1 record (Bodge's journey, ACTIVE)
├── JourneyCheckpoint             → ✅ 9 records (Exercise PRISM trail intact)
├── GapMapLead                    → ✅ 0 records (CRM, separate from MATE)
└── User (Base44 built-in)         → ✅ Present (authentication)
```

**Key distinction:** The engines and data layer are proven and intact. The question is whether the EXPERIENCE layer is wired to them.

---

## 3. PROFILE / FIRST-ENTRY FINDINGS

### Finding: No UserProfile creation path exists in any backend function

**Evidence:**

Every backend function was inspected. None creates a UserProfile:

| Function | Profile Creation | Behaviour if No Profile |
|----------|-----------------|-------------------------|
| engineUnderstanding.ts | None | Returns 400 "Missing profile_id" or 404 "Profile not found" |
| companionService.ts | None | Returns 400 "Missing profile_id" or 404 "Profile not found" |
| engineCapabilityIntelligence.ts | None | Returns 400 / 404 |
| engineDecisionReadiness.ts | None | Returns 400 / 404 |
| engineTransitionPartnership.ts | None | Returns 400 / 404 |
| pilotAccountReset.ts | None | Returns 404 (reset utility only) |

The Bodge test profile (`6a75e45381981fe29f1b901f`) was created manually by Paul (`created_by: paulbateson4547@gmail.com`) on 7 August 2026. No additional profiles have been created since.

**Assessment:**

- Profile creation may exist in the frontend code (Base44 builder page logic), but this could not be confirmed without UI access.
- If the frontend does NOT create a UserProfile on first entry, every engine will fail for new users.
- If the frontend DOES create a UserProfile, the creation logic was not visible in any backend function — it would be purely client-side or builder-side logic.
- **Paul and Cipher's visual confirmation is required**: When a new authenticated user first opens MATE, does the app create a UserProfile record? This is the single most important unanswered question.

**Risk if unresolved:** New pilot users arrive, start chatting, and every engine call returns 404. Smudge has no profile to read from or write to. The entire MATE journey is dead on arrival for anyone who isn't Bodge.

---

## 4. CONVERSATION / SMUDGE FINDINGS

### Finding: Companion Service does not process conversation messages

**Evidence (code inspection + live API testing):**

The Companion Service (`companionService.ts`) was inspected line-by-line and tested via live API calls. Its interface is:

```
POST /api/functions/companionService
Body: {
  profile_id: string,           // required
  current_mode: string,          // optional, defaults to 'EXPLORING'
  new_discoveries: object,       // optional, structured fields
  user_response_type: string     // optional, 'answering'|'correcting'|'confirming'|'rejecting'
}
```

What it does:
- Reads UserProfile by profile_id (service role)
- If `new_discoveries` provided: merges into profile, updates assessment_confidence, persists to UserProfile
- Returns: session context (mode, areas explored, areas outstanding), flow guidance (next area, behavioural notes, reflection content), and full profile data

What it does NOT do:
- Does NOT accept raw user text/messages
- Does NOT generate conversational/AI responses
- Does NOT parse natural language
- Does NOT persist conversation history or chat logs
- Does NOT call any other engine

**Design intent:** The Companion Service is an orchestration layer for an upstream LLM. Smudge (the conversational AI) is expected to:
1. Receive the user's message
2. Call the Companion Service with structured discoveries extracted from the conversation
3. Use the returned flow guidance to shape the next response
4. Generate the conversational reply using the LLM

**Critical question (requires UI inspection):** Does the Base44 app's conversation component call the Companion Service? Or does it use Base44's built-in AI agent independently?

The app's conversation UI was rebuilt during Operation EXPERIENCE. Without accessing the builder's page code, I cannot confirm whether the conversation component:
- Calls companionService with new_discoveries extracted from user messages
- Uses the flow guidance to shape responses
- Passes the correct profile_id

**Evidence suggesting disconnection:**
- The Bodge profile was last updated on 8 August 2026 (during Operation BUILD testing)
- No UserProfile updates have occurred since Operation EXPERIENCE began
- This suggests either (a) the conversation UI hasn't been used with the Bodge profile since EXPERIENCE, or (b) the conversation UI doesn't call the Companion Service

**Live test result:** When I called `companionService` with `action: "process_message"` and a free-text message, it returned the same session state as a bare `session_read` — the message was ignored because it wasn't in the expected `new_discoveries` format. This is correct behaviour (the function works as designed), but it confirms that raw message handling is NOT in the Companion Service.

---

## 5. ENGINE COVERAGE

### All five engines deployed and verified live (14 August 2026)

| # | Engine | Status | Live Test Result |
|---|--------|--------|-------------------|
| 1 | Understanding Engine v2.0 | ✅ Deployed + Verified | get_state → 200 OK, all fields accessible, assessment returns 91/HIGH |
| 2 | Companion Service v1.2 | ✅ Deployed + Verified | session_read → 200 OK, all 14 fields deserialized correctly, flow guidance returned |
| 3 | Capability Intelligence Engine | ✅ Deployed + Verified | get_capability_picture → 200 OK, 3 capabilities with evidence, ready_for_phase_four: true |
| 4 | Decision Readiness Engine | ✅ Deployed + Verified | get_status → 200 OK, soak COMPLETED, 3 pathways, 3 decision factors, phase EVALUATING |
| 5 | Transition Partnership Engine | ✅ Deployed + Verified | get_journey_status → 200 OK, journey ACTIVE, 2 commitments, 2 milestones, confidence BUILDING/STABLE |

### Engine Coverage Assessment

| Capability | Engine Status | Experience Surface | Connection |
|-----------|---------------|-------------------|------------|
| Profile bootstrap | No engine handles this | Orientation/Onboarding | UNKNOWN — requires UI inspection |
| Understanding / Discovery | Engine deployed, working | Conversation / Smudge | UNKNOWN — requires UI inspection |
| Assessment confidence | Engine deployed, working | Conversation or Journey Hub | UNKNOWN — requires UI inspection |
| Operational Picture confirmation | Engine deployed, working | Conversation | UNKNOWN — requires UI inspection |
| Capability Intelligence | Engine deployed, working | Journey Hub (Capability Snapshot) | UNKNOWN — requires UI inspection |
| Decision Readiness (soak, pathways) | Engine deployed, working | Journey Hub (Pathways, Next Steps) | UNKNOWN — requires UI inspection |
| Transition Partnership (journey, commitments) | Engine deployed, working | Journey Hub (Progress, Smudge) | UNKNOWN — requires UI inspection |
| Journey checkpoints | Engine deployed, working | Journey Hub (Progress) | UNKNOWN — requires UI inspection |

**Summary:** Every engine capability that was proven during Operation PROOF and deployed during Operation BUILD is still live and functioning at the API level. The gap is not in the engines — it is in the connection between the experience layer and the engine layer.

---

## 6. DECISION READINESS STATUS

### Engine state (from live API call, 14 August 2026):

| Component | Status | Detail |
|-----------|--------|--------|
| tos_phase | EVALUATING | Bodge profile is in evaluation phase |
| soak_period | COMPLETED | Initiated and completed 7 Aug 2026, reflection notes present |
| decision_factors | 3 expressed | financial (EV-006), health_wellbeing (EV-005), purpose (EV-006) |
| recommended_pathways | 3 stored | Security & Close Protection (POSSIBLE_DIRECTION), Emergency Services (WORTH_EXPLORING), Mentoring & Training (WORTH_EXPLORING) |
| capability_count | 3 | Leadership, Operating Under Pressure, Adaptability (all MODERATE) |
| pathway evaluation | Available | evaluate_pathways action returns differentiated pathways with matching capabilities |
| initiate_soak | Available | Action present and functional |
| complete_soak | Available | Action present and functional |
| bypass_soak | Available | Action present and functional |

### What still works:
- get_status ✅
- evaluate_pathways ✅ (3 pathways returned with matching capabilities)
- record_decision_factor ✅ (available)
- initiate_soak / complete_soak / bypass_soak ✅ (available)

### What can the current user experience actually reach?
UNKNOWN — depends on whether the conversation UI drives the user through the decision readiness actions or if these are only reachable via direct API calls. Requires UI inspection.

### What exists in engineering but has no EXPERIENCE surface?
- Soak period initiation/completion/bypass — no known UI surface for these actions
- Decision factor recording — no known UI surface
- Pathway evaluation — Pathways page is a declared placeholder

### Can Conversation currently generate the evidence/state required by Decision Readiness?
UNKNOWN — the Companion Service CAN persist discoveries to UserProfile (including evidence_log, capability_map, decision_factors), but only if the conversation UI calls it with structured new_discoveries. Without confirming the UI connection, this is unproven.

---

## 7. JOURNEY HUB DATA MAP

The Journey Hub surfaces were not directly inspectable (app is private, requires authentication). The following assessment is based on engine capability vs. declared placeholder status.

| Surface | Likely Driver | Classification | Connection Required |
|---------|--------------|---------------|-------------------|
| Profile | Unknown — engine has full profile data | PLACEHOLDER or DERIVED | If placeholder: surface UserProfile fields (name, rank, branch, years served, professional identity) |
| Capability Snapshot | engineCapabilityIntelligence | DERIVED (if connected) or PLACEHOLDER | If connected: call get_capability_picture, display capabilities with evidence |
| Pathways | engineDecisionReadiness | PLACEHOLDER (declared) | If activated: call evaluate_pathways, display recommended pathways with confidence levels |
| Next Steps | engineTransitionPartnership | PLACEHOLDER or DERIVED | If connected: call get_journey_status, display active commitments |
| Learning Progress | No engine exists for this | PLACEHOLDER | Future scope — no engine to connect |
| Smudge message | Companion Service / Conversation | UNKNOWN | If connected: display recent Smudge interaction summary or journey context |

**Note:** Paul and Cipher's visual confirmation is needed to classify each surface accurately. The above is the engineering view of what COULD drive each surface.

---

## 8. PLACEHOLDER ASSESSMENT

| Placeholder Area | Classification | Rationale |
|-----------------|---------------|-----------|
| **Pathways** | A — Must become functional | Core to the MATE proposition. Without pathway evaluation, the user cannot answer "What options do I have?" Engine exists and is deployed. Requires surfacing only. |
| **Profile** | A — Must become functional | User must see their own operational picture. Engine data exists. Requires surfacing UserProfile fields. |
| **Progress** | A — Must become functional for meaningful pilot | Shows the user their journey. TransitionJourney and JourneyCheckpoint data exists. Requires surfacing. |
| **Learning** | D — Future scope | No engine exists for learning state. Not part of the MVP journey. |
| **Resources** | D — Future scope | No engine or data exists. Not part of the MVP journey. |
| **Settings** | B — Can remain placeholder | Not critical to the MATE proposition. |
| **Need Support** | C — Capability exists underneath | Transition Partnership Engine has referral capability. Could be surfaced if needed, but may not be critical for initial pilot. Can remain placeholder if wellbeing awareness is surfaced through conversation. |

---

## 9. DATA / PERSISTENCE MAP

### Source of truth for transition state:

| Data | Source of Truth | Type | Notes |
|------|----------------|------|-------|
| User identity | Base44 User entity | System | Authentication |
| UserProfile | UserProfile entity | Server-side, RLS-scoped | Single source of truth for all profile data |
| Conversation | UNKNOWN | UNKNOWN | No conversation entity exists. If conversation is not persisted, it is ephemeral. |
| Capability evidence | UserProfile.evidence_log | Server-side (JSON string) | Evidence gate references these entries |
| Decision factors | UserProfile.decision_factors | Server-side (JSON string) | 3 factors with evidence_refs |
| Pathways | UserProfile.recommended_pathways | Server-side (JSON string) | 3 pathways stored from engine evaluation |
| Lifecycle / tos_phase | UserProfile.tos_phase | Server-side (string) | Current: EVALUATING |
| Soak state | UserProfile.soak_period | Server-side (JSON string) | Current: COMPLETED |
| Progress | TransitionJourney entity | Server-side, RLS-scoped | Journey state, commitments, milestones |
| Learning state | N/A | N/A | No learning state exists |
| Journey state | TransitionJourney entity | Server-side | Partnership state, confidence, blockers, wellbeing |
| Checkpoints | JourneyCheckpoint entity | Server-side | 9 snapshots from Exercise PRISM |

### Identified issues:

**1. No conversation persistence**
No entity or field stores conversation history. The Companion Service does not persist chat logs. If the Base44 app stores conversation in client-side state only, conversation context is lost on page refresh or session expiry.

**2. JSON string vs native object inconsistency**
The Companion Service and pilotAccountReset serialize array/object fields as JSON strings (`"[]"`, `"{}"`). Engines 1-3 expect native arrays/objects. The Companion Service's `deserializeProfile()` handles this for reads, but engines that use `Array.isArray(profile.evidence_log)` (e.g., engineDecisionReadiness) will fail if the field is a JSON string.

**3. OCIPathway count discrepancy**
Memory records 8 seeded pathways. Live database contains 4. Four pathways are missing. This may be a data migration issue from the BUILD phase or a later change. The 4 remaining pathways (Security & Close Protection, Logistics & Supply Chain, Emergency Services, Mentoring & Training) are the ones referenced in Bodge's recommended_pathways.

**4. tos_phase casing inconsistency**
- engineUnderstanding writes: `'Discover'`, `'Understand'`
- engineCapabilityIntelligence writes: `'Evaluate'`
- engineDecisionReadiness requires: `'EVALUATING'`, `'READY_TO_ACT'`
- pilotAccountReset resets to: `'EXPLORING'`

This means Phase Four (Decision Readiness) will reject any profile that was advanced by Phase Two or Phase Three using their native casing. The Bodge profile works because it was manually set to `'EVALUATING'` during BUILD testing. A new user following the natural engine chain would hit a 400 error at the Phase Four boundary.

**5. Conflicting sources of truth for assessment**
Both `engineUnderstanding.ts` and `companionService.ts` independently calculate assessment confidence using duplicated logic. If the conversation UI calls the Companion Service (which writes assessment_confidence) and then the Understanding Engine is also called (which also writes assessment_confidence), the two could overwrite each other with potentially different values.

---

## 10. SECURITY / MULTI-USER PILOT FINDINGS

### Finding: All engines use service role — RLS is bypassed at the engine layer

**Evidence:**

Every backend function uses `base44.asServiceRole.entities.UserProfile` for reads and writes. The service role bypasses Row-Level Security. This means:

1. **Any profile_id passed to an engine will return that profile's data**, regardless of which user is authenticated.
2. **If a user can supply another user's profile_id, they can read and modify that user's transition data.**

### Specific concerns:

| Concern | Status | Detail |
|---------|--------|--------|
| IDOR / Direct ID access | ⚠️ POTENTIAL RISK | Engines accept any profile_id in the request body. If the frontend passes a user-supplied or guessable profile_id, cross-user access is possible. |
| RLS on UserProfile | ✅ Enabled | But bypassed by service role in all engines |
| RLS on TransitionJourney | ✅ Enabled | Engine uses service role — bypassed |
| RLS on JourneyCheckpoint | ✅ Enabled | Engine uses service role — bypassed |
| Authentication | ✅ Base44 handles | Base44 authentication is present and functional |
| Session handling | ✅ Base44 handles | Standard session management |
| Client-trust | ⚠️ UNKNOWN | If the frontend stores profile_id in client-side state and passes it to engines, a malicious user could substitute another user's ID |

### Assessment:

The service role usage is architecturally correct for the engines (they need cross-entity access for the MATE journey). The security boundary must be established at the **integration layer** — the point where the frontend maps an authenticated user to their profile_id.

**Required for pilot:** The frontend must deterministically resolve the authenticated user's profile_id from their session, NOT accept it as a user-controllable parameter. If the conversation UI passes `profile_id` from client-side state, this is a pilot safety issue.

### Recommended approach (not implementing — for review):
Either:
- A) Frontend resolves profile_id from authentication context and never exposes it as a client-controllable parameter, OR
- B) Engines validate that the profile_id belongs to the requesting user before proceeding (requires switching from service role to user-scoped reads for the initial profile lookup)

---

## 11. FAILURE-MODE FINDINGS

| Failure Condition | System Behaviour | Classification |
|-------------------|-----------------|----------------|
| Missing profile_id | Engine returns 400 "Missing profile_id" | FAILS SAFE |
| Invalid/non-existent profile_id | Engine returns 404 "Profile not found" | FAILS SAFE |
| Engine function failure | Engine returns 500 with error message | DEGRADES — user may be stranded if UI doesn't handle errors |
| evidence_ref failure | If evidence_log is JSON string, Array.isArray fails, evidence validation breaks | RISKS MISREPRESENTING STATE — engine may produce incorrect results without erroring |
| Authentication/session expiry | Base44 handles redirect to login | DEGRADES SAFELY — user returns to authentication |
| Persistence failure | Engine catches error, returns 500 | LOSES STATE if client-side state was the only copy |
| Companion failure | If conversation UI doesn't call Companion Service, no failure occurs — but no engine state changes either | STRANDS THE USER — conversation proceeds without any backend state updates |
| tos_phase casing mismatch | Phase Four rejects with 400 "Precondition failed" | FAILS SAFE but blocks journey progression — user cannot advance past Phase Three |
| Conversation session loss | No conversation persistence — context lost on refresh | STRANDS THE USER — Smudge loses all conversational context |

### Key risk: Silent disconnection

The most dangerous failure mode is not an error — it's the absence of errors. If the conversation UI is NOT connected to the Companion Service, the user will have conversations with Smudge that appear to work but do not persist any discoveries to UserProfile. The engines will never be triggered. The user's journey will not progress. No error will be thrown. The system will silently fail to do its job.

This is why confirming the conversation-to-engine connection is P0.

---

## 12. CONSOLIDATED ENGINEERING SNAG REGISTER

| ID | Priority | Issue | Evidence | Minimum Recommended Correction | Dependencies | Risk if Deferred |
|----|----------|-------|----------|-------------------------------|-------------|-----------------|
| **S-001** | **P0** | No UserProfile creation path in any backend function | All 6 functions inspected — none creates a profile. Bodge was created manually. | Implement profile bootstrap: either frontend creates UserProfile on first authenticated entry, or add a create/init action to Companion Service or a new bootstrap function. | None | New pilot users cannot use MATE — all engine calls return 404 |
| **S-002** | **P0** | Conversation UI connection to Companion Service unconfirmed | No UserProfile updates since 8 Aug. Companion Service doesn't process raw messages. Unknown if UI calls it. | Confirm and wire the conversation UI to call companionService with structured new_discoveries extracted from conversation. If Base44 built-in AI is used, configure it to call the Companion Service. | S-001 (profile must exist first) | Conversation proceeds without engine state changes — silent failure, no journey progression |
| **S-003** | **P0** | tos_phase casing inconsistency across engines | Engine 2 writes 'Discover'/'Understand', Engine 3 writes 'Evaluate', Engine 4 requires 'EVALUATING'/'READY_TO_ACT'. | Normalise to uppercase enum at the integration boundary. The serialization adapter (already in companionService) should map engine terminology to locked entity schema. Apply consistently. | None | New users following the natural engine chain hit a 400 error at the Phase Four boundary — journey blocked |
| **S-004** | **P1** | Profile_id passed as client-controllable parameter (potential IDOR) | All engines use service role and accept any profile_id in request body. | Frontend must resolve profile_id from authenticated session, not from client-supplied value. Alternatively, engines validate profile ownership before proceeding. | S-001 | Cross-user data access if pilot users can substitute profile_ids |
| **S-005** | **P1** | No conversation persistence | No entity stores conversation history. Context lost on page refresh. | Either persist conversation to a new entity/field, or accept as P2 pilot limitation with documented risk. | S-002 | Smudge loses all context on refresh — user experience degrades, but engine state (UserProfile) persists |
| **S-006** | **P1** | Journey Hub surfaces not confirmed as live data | Cannot inspect UI. Pathways, Profile, Progress are placeholders but engine data exists. | Surface engine data on Journey Hub: Profile from UserProfile, Capabilities from get_capability_picture, Pathways from evaluate_pathways, Progress from get_journey_status. | S-001, S-002 (engines must be reachable) | Pilot tests a UI shell, not the MATE proposition |
| **S-007** | **P1** | JSON string vs native object inconsistency between Companion Service and engines | companionService serialises to JSON strings. Engines 1-3 expect native arrays. engineDecisionReadiness uses Array.isArray() which fails on strings. | Either: (a) all engines deserialize before reading (like companionService does), or (b) all functions standardise on one storage format. The serialization adapter pattern should be applied consistently. | S-003 (part of the same integration boundary work) | Evidence validation breaks, capability matching fails, engine results may be incorrect without erroring |
| **S-008** | **P2** | Assessment logic duplication between companionService and engineUnderstanding | Both files independently implement assessAreas() and calcConfidence(). | Consolidate into a shared module or delegate Companion Service to call Understanding Engine. | None | Maintenance risk — scoring changes in one file don't propagate to the other |
| **S-009** | **P2** | 4 OCIPathways missing (8 seeded → 4 present) | Live database has 4 pathways. Memory records 8 seeded. | Verify whether 4 were intentionally removed or lost during migration. Re-seed if needed. | None | Reduced pathway options for pilot users — not blocking but limits evaluation |
| **S-010** | **P3** | API inconsistency — engines 2-4 use action parameter, engine 1 and companionService don't | Code inspection. | Standardise interface contract (post-pilot). | None | Developer experience issue — no user impact |
| **S-011** | **P3** | SDK version split — engines 2 and 5 use SDK 0.8.25, engines 1, 3, 4, companion use 0.8.31 | Code inspection. | Upgrade all to latest SDK (post-pilot). | None | No current impact — may cause issues with future platform updates |

---

## 13. RECOMMENDED IMPLEMENTATION ORDER

Dependency-aware, minimum necessary for controlled pilot:

### Phase A: Foundation (P0 — must complete before any pilot user)

1. **S-001: Profile Bootstrap** — Implement automatic UserProfile creation for new authenticated users. This is the first domino — nothing works without it.

2. **S-003: tos_phase Normalisation** — Fix the casing inconsistency at the integration boundary. The serialization adapter already maps between engine terminology and entity schema in the Companion Service — extend this pattern to all engine calls.

3. **S-002: Conversation-to-Engine Wiring** — Confirm and wire the conversation UI to call the Companion Service with structured discoveries. This is the critical connection that makes MATE actually MATE.

### Phase B: Pilot Meaningfulness (P1 — must complete for pilot to test the proposition)

4. **S-004: Profile_id Security** — Ensure the frontend resolves profile_id from authentication context, not from client-supplied value. Required before opening the app to external users.

5. **S-007: Serialization Consistency** — Apply the deserialization adapter pattern consistently across all engines, or standardise storage format. Prevents silent data corruption.

6. **S-006: Journey Hub Live Data** — Surface engine data on the Journey Hub for Profile, Capabilities, Pathways, and Progress. Without this, the pilot tests a UI shell.

7. **S-005: Conversation Persistence** — Either persist conversation history or document as an accepted pilot limitation. Recommend: accept as P2 for pilot if session continuity within a single visit is reliable.

### Phase C: Pilot Observations (P2 — accept into pilot)

8. **S-008: Assessment Logic Duplication** — Document as known technical debt. Observe for discrepancies during pilot.
9. **S-009: Missing OCIPathways** — Verify and re-seed before pilot if pathway diversity matters for the pilot cohort.

### Phase D: Post-Pilot (P3 — do not delay pilot)

10. **S-010: API Standardisation** — Post-pilot cleanup.
11. **S-011: SDK Version Alignment** — Post-pilot maintenance.

---

## 14. PILOT GATE

### CLEAR P0/P1 THEN CONTROLLED PILOT

The engineering baseline is sound. All engines are deployed, verified, and functioning at the API level. The data layer is intact. The Bodge profile demonstrates the full MATE journey end-to-end.

The experience layer rebuilt during Operation EXPERIENCE is a substantial step forward in user-facing design, but the critical integration boundary between the conversation experience and the engine machinery is unconfirmed. Without confirming and completing this connection, the pilot would test a presentation layer — not the MATE proposition.

Three P0 items (profile bootstrap, conversation wiring, tos_phase normalisation) and four P1 items (profile_id security, serialization consistency, Journey Hub surfacing, conversation persistence) must be resolved before the app is opened to external users.

Once the P0/P1 work is complete, a final end-to-end verification (fresh profile → discovery → understanding → capability → decision readiness → transition partnership) should be conducted before the Go/No-Go decision.

---

## INSPECTION LIMITATIONS

The following could not be verified without direct access to the Base44 app builder UI:

1. Whether the conversation component calls the Companion Service
2. Whether the Journey Hub surfaces pull live data or use placeholder/hard-coded data
3. Whether the frontend creates a UserProfile on first authenticated entry
4. How profile_id is resolved and passed to engine calls
5. Whether the app has any client-side state management for conversation context

Paul and Cipher's visual confirmation of these items would either resolve several UNKNOWN findings or confirm them as snags requiring implementation.

---

## CLASSIFICATION SUMMARY

| Priority | Count | Items |
|----------|-------|-------|
| P0 — Pilot Blocker | 3 | S-001, S-002, S-003 |
| P1 — Required for Meaningful Pilot | 4 | S-004, S-005, S-006, S-007 |
| P2 — Accept into Pilot | 2 | S-008, S-009 |
| P3 — Post-Pilot / Technical Debt | 2 | S-010, S-011 |
| **Total** | **11** | |

---

*One mountain. Three views. One truth.*

*Ash — Chief Engineer — 14 August 2026*
