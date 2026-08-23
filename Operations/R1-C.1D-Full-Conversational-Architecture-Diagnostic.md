# MATE — FULL CONVERSATIONAL ARCHITECTURE DIAGNOSTIC

**Date:** 23 August 2026  
**Engineer:** Ash  
**Status:** READ-ONLY SYSTEM DIAGNOSTIC — NO ENGINEERING AUTHORITY  
**Authority:** Paul (diagnostic only, no fixes)  

---

## A. Current Architecture Map

### End-to-end conversational path

```
User types message in Chat.jsx
        │
        ├── Frontend stores message in React state + localStorage
        │   (key: gapmap_chat_${user.id})
        │
        ├── Frontend sends POST to smudgeOrchestrator
        │   Payload: { user_message, recent_context }
        │   recent_context = last 3-4 exchanges as [{role, text}]
        │
        ▼
smudgeOrchestrator (backend function, 1003 lines)
        │
        ├── Step 1: PROFILE ACQUISITION
        │   base44.entities.UserProfile.list() → profiles[0]
        │   Auto-creates EXPLORING profile if none exists
        │   deserializeProfile() — JSON-string fields → native objects
        │   currentPhase = profile.tos_phase || "EXPLORING"
        │
        ├── Step 1b: SAFETY PENDING CHECK
        │   If safety_clarification_pending OR safety_concern_pending:
        │     → safetyClassificationCall (separate LLM call)
        │     → benign: clear flags, acknowledge, return
        │     → concern: safety response, retain flags, return
        │     → ambiguous: re-clarify, retain flags, return
        │   [SHORT-CIRCUITS: no discoveries, no companionCore, no generation]
        │
        ├── Step 2: PHASE ROUTING
        │   Only EXPLORING and CONFIRMING supported
        │   Other phases → canned "not yet supported" response
        │
        ├── Step 3: OPERATIONAL AREAS SNAPSHOT
        │   6 areas: Who/What/Where/Where-going/Influences/Confidence
        │   isSubstantive() = field exists AND ≥15 chars
        │   areas_explored / areas_outstanding computed
        │
        ├── Step 4: INTERPRETATION LLM CALL (first of 2 LLM calls)
        │   Prompt includes:
        │     • currentPhase
        │     • areas_explored / areas_outstanding
        │     • profile.professional_identity, profile.service_branch
        │     • recent_context (last 4 exchanges) ← ONLY PLACE recent_context is used
        │     • user_message
        │   LLM returns: candidate_discoveries, intent, user_response_type,
        │     interpretation_confidence, ambiguity_flag, clarification_needed,
        │     safety_classification
        │
        ├── Step 5: VALIDATION — fail closed if interpretation invalid
        │
        ├── Step 6: SAFETY CLASSIFICATION (three-way)
        │   clear_concern → write safety_concern_pending, return safety response
        │   ambiguous → write safety_clarification_pending, generate clarification, return
        │   none → continue
        │
        ├── Step 7: FLOW CONTROL (skip flag `g`)
        │   authoritativeIntent = mapAuthoritativeIntent(interpretation.intent)
        │     frustration → STOP_EXPLORING
        │     asking_orientation → EXPLAIN
        │     correcting → ACCEPT_CORRECTION
        │     other → null (flexible)
        │
        ├── Step 8: AMBIGUITY CHECK
        │   If ambiguity_flag → set clarification, skip to generation
        │
        ├── Step 9: DETERMINISTIC VALIDATION GATE
        │   buildNewDiscoveries() — filters to direct_statement/high_confidence only
        │   If all rejected + has non-direct → clarification needed
        │   If no discoveries at all → no_discoveries flag
        │
        ├── Step 10: USER_RESPONSE_TYPE DOWNGRADE
        │   safeUserResponseType() — lifecycle-aware (CONFIRMING required for confirming)
        │
        ├── Step 11: COMPANIONCORE CALL
        │   companionCore({ profile, currentMode, newDiscoveries, userResponseType, persist })
        │     → assessAreas() — 6-area substance check
        │     → merge discoveries into profile
        │     → lifecycle transition (EXPLORING→CONFIRMING when 4 core areas substantive)
        │     → CONFIRMING→CONFIRMED when user confirms + all 6 substantive
        │     → generateFlowGuidance() — behavioural_notes, next_area_to_explore
        │     → persist via callback (UserProfile.update)
        │
        ├── Step 12: RESPONSE GENERATION (second LLM call)
        │   genContext = {
        │     user_message,
        │     accepted_discoveries,        ← this turn only
        │     rejected_discoveries,        ← this turn only
        │     areas_explored,              ← from companionCore assessment
        │     areas_outstanding,           ← from companionCore assessment
        │     confirmed, ready_to_confirm, ← lifecycle state
        │     lifecycle_transition,        ← this turn only
        │     clarification_needed,        ← this turn only
        │     companion_error, no_discoveries,
        │     behavioural_notes,           ← from companionCore flow guidance
        │     canonical_phase,             ← current tos_phase
        │     profile_content,             ← buildProfileContext() — 7 static fields
        │     evidence_sufficient,         ← ready_to_confirm || confirmed
        │     authoritative_intent         ← from conductor mapping
        │   }
        │   ⚠️ NO recent_context in genContext
        │   ⚠️ NO interpretation.intent in genContext (only mapped authoritative_intent)
        │   ⚠️ NO record of previous Smudge responses
        │   ⚠️ NO record of topics discussed/closed/parked
        │   ⚠️ NO record of user corrections
        │   ⚠️ NO record of what Smudge said last
        │
        │   buildGenerationPrompt(genContext) → 22 rules + context → LLM
        │   Post-generation validation: identity + grounding checks
        │
        ├── Step 13: RESPONSE
        │   Returns: response_text, response_intent, asks_question,
        │   tos_phase, state_changed, companion_result, _internal telemetry
        │
        ▼
Frontend receives response
        │
        ├── Adds Smudge response to React state + localStorage
        ├── Displays response_text
        └── No conversation state sent to backend for next turn
            (only recent_context array, which is rebuilt from localStorage)
```

### Key files inspected

| File | Lines | Role |
|------|-------|------|
| smudgeOrchestrator.ts | 1003 | Main orchestrator — interpretation, safety, conductor, generation |
| shared/companionCore.ts | 389 | Domain logic — assessment, lifecycle, flow guidance, persistence |
| functions/companionService.ts | 74 | Thin wrapper — auth boundary for companionCore |
| functions/engineUnderstanding.ts | 339 | Assessment engine (called by companionCore internally via assessAreas) |
| entities/UserProfile.json | — | Schema — 25 fields, all profile/engine state, NO conversational state |
| Chat.jsx | — | Frontend — localStorage persistence, sends recent_context (inspected R1-A + builder wiring) |

---

## B. State / Context Inventory

### What Smudge knows when generating a response

| Source | Available at generation? | Authoritative? | Persistent? | Origin |
|--------|-------------------------|----------------|-------------|--------|
| Current user message | ✅ YES (in genContext) | Authoritative | N/A (per-turn) | Frontend POST |
| Recent conversation (last 3-4 exchanges) | ❌ NO (interpretation only) | Temporary | Frontend localStorage only | Frontend POST body |
| UserProfile.service_branch | ✅ YES (in buildProfileContext) | Authoritative | Persistent (DB) | companionCore persistence |
| UserProfile.rank | ✅ YES | Authoritative | Persistent | companionCore persistence |
| UserProfile.years_served | ✅ YES | Authoritative | Persistent | companionCore persistence |
| UserProfile.professional_identity | ✅ YES | Authoritative | Persistent | companionCore persistence |
| UserProfile.personal_context | ✅ YES | Authoritative | Persistent | companionCore persistence |
| UserProfile.goals | ✅ YES (if array with content) | Authoritative | Persistent | companionCore persistence |
| UserProfile.user_confidence | ✅ YES (if not null) | Authoritative | Persistent | companionCore persistence |
| UserProfile.service_history | ❌ NO (not in buildProfileContext) | Authoritative | Persistent | companionCore persistence |
| UserProfile.operational_context | ❌ NO (not in buildProfileContext) | Authoritative | Persistent | companionCore persistence |
| UserProfile.evidence_log | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.capability_map | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.confidence_scores | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.decision_factors | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.milestones | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.recommended_pathways | ❌ NO | Authoritative | Persistent | Engine writes |
| UserProfile.safety_flags | ❌ NO (checked in step 1b only) | Authoritative | Persistent | Safety flows |
| UserProfile.operational_picture_confirmed | ❌ NO (reduced to `confirmed` boolean) | Authoritative | Persistent | companionCore |
| UserProfile.operational_picture_history | ❌ NO | Authoritative | Persistent | companionCore |
| UserProfile.tos_phase | ✅ YES (as canonical_phase) | Authoritative | Persistent | companionCore lifecycle |
| Areas explored (6-area labels) | ✅ YES (as areas_explored) | Derived | Recomputed each turn | companionCore assessAreas |
| Areas outstanding (6-area labels) | ✅ YES (as areas_outstanding) | Derived | Recomputed each turn | companionCore assessAreas |
| Assessment confidence (LOW/MOD/HIGH) | ❌ NO (not in genContext) | Derived | Persistent (but not sent) | companionCore calcConfidence |
| Behavioural notes | ✅ YES (from companionCore guidance) | Derived | Ephemeral (recomputed each turn) | companionCore generateFlowGuidance |
| Authoritative intent (conductor) | ✅ YES (STOP_EXPLORING/EXPLAIN/ACCEPT_CORRECTION/null) | Derived | Ephemeral | mapAuthoritativeIntent |
| Interpretation intent (answering/asking/etc) | ❌ NO (only mapped to authoritative_intent) | Derived | Ephemeral | Step 4 LLM |
| Candidate discoveries (all) | ❌ NO (only accepted/rejected summary) | Derived | Ephemeral | Step 4 LLM |
| Lifecycle transition (this turn) | ✅ YES (as lifecycle_transition) | Derived | Ephemeral | companionCore |
| Clarification needed | ✅ YES | Derived | Ephemeral | Step 8/9 |
| What Smudge said last turn | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Topics discussed/closed/parked | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| User corrections (cumulative) | ❌ NO | N/A | NOT STORED (correction is per-turn only) | — |
| User preferences/instructions | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Current user objective | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Direct requests awaiting action | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Previous generation intent/act | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Decisions Smudge made | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Unresolved questions | ❌ NO | N/A | NOT STORED ANYWHERE | — |
| Whether Smudge has enough info to move forward | Partial (areas_outstanding heuristic only) | Derived | Recomputed each turn | companionCore |

### Summary

**25 UserProfile fields** store profile and engine state. **Zero fields** store conversational state.

**7 profile fields** reach the generation LLM via `buildProfileContext()`. The other 18 are stored but never sent to generation.

**`recent_context`** (conversation history) reaches the interpretation LLM but is **never passed to the generation LLM**.

---

## C. Turn-to-Turn Information-Flow Map

### Turn N → Turn N+1: What survives?

```
TURN N
├── User sends message
├── Interpretation LLM sees: message + recent_context + profile snapshot
├── Discoveries extracted → companionCore → persisted to UserProfile
├── Generation LLM sees: message + profile snapshot + this-turn results
├── Smudge generates response
├── Response sent to frontend
└── Frontend stores in localStorage

TURN N+1
├── User sends message
├── Frontend builds recent_context from localStorage (last 3-4 exchanges)
├── Interpretation LLM sees: new message + recent_context + updated profile
├── Generation LLM sees: new message + updated profile + this-turn results
└── ⚠️ Generation LLM does NOT see:
    ├── What Smudge said in Turn N (not in genContext)
    ├── What was discussed in Turn N (beyond what made it to UserProfile fields)
    ├── Whether a topic was closed in Turn N
    ├── Whether the user corrected Smudge in Turn N
    ├── What the user's current focus is
    └── What Smudge's last conversational act was
```

### What persists across turns

| Information | Persisted? | Where? | Retrieved at generation? |
|-------------|-----------|--------|------------------------|
| UserProfile fields (service_branch, rank, etc.) | ✅ DB | UserProfile entity | ✅ 7 of 25 fields |
| Safety pending state | ✅ DB | safety_flags field | ❌ Not at generation (step 1b only) |
| tos_phase | ✅ DB | UserProfile | ✅ As canonical_phase |
| Assessment confidence | ✅ DB | UserProfile | ❌ Not in genContext |
| Recent conversation | ✅ Frontend localStorage | Browser only | ❌ Not sent to generation |
| What Smudge said last | ❌ NOT PERSISTED | — | ❌ |
| Topics covered | ❌ NOT PERSISTED | — | ❌ |
| Topics closed/parked | ❌ NOT PERSISTED | — | ❌ |
| User corrections | ❌ NOT PERSISTED | — | ❌ |
| User focus/objective | ❌ NOT PERSISTED | — | ❌ |
| Smudge's last conversational act | ❌ NOT PERSISTED | — | ❌ |

---

## D. Information-Loss Points

### D1. recent_context not passed to generation LLM (P0)

**Where:** Step 4 receives `recent_context` and includes it in the interpretation prompt. Step 12 builds `genContext` WITHOUT `recent_context`.

**Impact:** The generation LLM has no knowledge of what was said in previous turns. It cannot reference previous topics, avoid repeating itself, or maintain conversational continuity. It generates each response as if it's the first turn.

**This is the single largest information loss in the system.**

### D2. interpretation.intent computed then partially discarded (P1 — previously identified, conductor mitigated)

**Where:** Step 4 produces `interpretation.intent` (answering, asking_question, expressing_frustration, seeking_reassurance, sharing_milestone, asking_orientation, correcting, other). Step 7 maps 3 of 8 intents to `authoritative_intent` (STOP_EXPLORING, EXPLAIN, ACCEPT_CORRECTION). The other 5 map to `null` (flexible).

**Impact:** Intents like `seeking_reassurance`, `sharing_milestone`, `asking_question` are computed but discarded. The generation LLM never sees the interpretation's intent classification. It must re-infer the user's intent from the message alone.

**Mitigation:** Conductor wiring (R1-C.1D) handles 3 cases. The remaining 5 are left to generation inference.

### D3. 18 of 25 UserProfile fields not sent to generation (P1)

**Where:** `buildProfileContext()` includes only 7 fields: service_branch, rank, years_served, professional_identity, personal_context, goals, user_confidence. The other 18 (service_history, operational_context, evidence_log, capability_map, confidence_scores, decision_factors, milestones, recommended_pathways, safety_flags, operational_picture_confirmed, operational_picture_history, operational_picture_version, assessment_confidence, soak_period, communication_preferences, action_plan, full_name, contact_email) are not included.

**Impact:** The generation LLM knows the user is "Army, 9 years" but not their service history, operational context, or evidence log. It cannot reference specific roles, achievements, or influencing factors that were previously discussed and stored. This contributes to the "restarting" feeling — the LLM doesn't know what it already knows in detail.

**Notable:** `service_history` is the richest profile field (role, responsibilities, achievements, leadership_scope per entry). Its exclusion means Smudge cannot reference what the user actually did in the military, even though it was explicitly captured and stored.

### D4. Assessment confidence not in genContext (P2)

**Where:** companionCore computes `assessment_confidence` (LOW/MODERATE/HIGH + score). This is stored in the profile but not included in `genContext`.

**Impact:** The generation LLM doesn't know how much understanding has been built. It sees "areas_outstanding" (labels) but not the confidence score. This means it can't calibrate its tone between "I'm still getting to know you" and "I've got a good picture now" based on the actual assessment.

### D5. Per-turn discoveries discarded after persistence (P2)

**Where:** Step 9 extracts `candidate_discoveries`, filters to `accepted_discoveries` and `rejected_discoveries`. These are passed to genContext as this-turn summaries. But the FULL discovery objects (with source_text, source_type, confidence) are not persisted — only the field values are written to UserProfile via companionCore.

**Impact:** The provenance of each discovery (what the user actually said, how confident the interpretation was) is lost after the turn. Future turns can see "service_branch: Army" but not "the user said 'I've been in the Army for about 9 years' with high confidence." The evidence_log field exists for this purpose but is never written to by companionCore.

### D6. Behavioural notes are ephemeral and recomputed each turn (P2)

**Where:** `generateFlowGuidance()` in companionCore produces `behavioural_notes` — these include checkpoint notifications, next-area suggestions, low-confidence flags, and wrap-up prompts. These are computed fresh each turn based on current profile state.

**Impact:** If the user says "let's move on from that topic" in Turn N, the behavioural notes in Turn N+1 have no memory of this instruction. The notes are derived from profile state only, not conversational history. A topic that was verbally closed by the user will reappear as "areas_outstanding" if the profile field hasn't been filled.

### D7. No conversational state entity (P0)

**Where:** The UserProfile schema has 25 fields, all profile/engine state. There is no field, entity, or mechanism for storing conversational state: current focus, topics covered, topics closed, user corrections, user preferences, current objective, previous acts, pending requests.

**Impact:** This is the structural root cause. The system was designed to persist WHO the user IS, not WHERE the conversation IS. The generation LLM is asked to maintain conversational continuity with zero conversational memory.

### D8. No "Smudge's last response" in generation context (P0)

**Where:** The generation prompt includes the user's current message but not Smudge's previous response. The LLM doesn't know what it just said.

**Impact:** Smudge cannot avoid repeating itself, reference what it just discussed, or maintain a natural conversational flow. It generates each response in a vacuum. This is why users experience repetition and "restarting" — the LLM literally doesn't know what it said last turn.

### D9. Frontend localStorage is the only conversation store (P1)

**Where:** Chat.jsx stores conversation in localStorage (`gapmap_chat_${user.id}`). This survives page refreshes but not device changes, browser data clears, or different devices. It is never sent to the backend except as `recent_context` (last 3-4 exchanges for interpretation only).

**Impact:** If a user returns to MATE on a different device, or after clearing browser data, the conversation history is gone. The backend has no record of any conversation. The user must start from scratch. "Where were we?" cannot be answered because the backend doesn't know.

---

## E. Root Causes — Ranked

### P0-1: No conversational state persistence

**Symptoms:** Reopening topics, repeating questions, "restarting" feeling, user corrections not remembered, user focus not tracked.

**Contributing factors:** UserProfile was designed for profile/engine state, not conversational state. No entity, field, or mechanism exists to store what happened in the conversation.

**Root cause:** The architecture treats conversation as ephemeral and profile as persistent. But a companion experience requires conversational continuity as the PRIMARY persistent state — profile is a DERIVATIVE of conversation, not a replacement for it.

### P0-2: Generation LLM has no conversation history

**Symptoms:** Repetition, "robotic" behaviour, reopening closed topics, ignoring previous context.

**Contributing factors:** `recent_context` is passed to interpretation (step 4) but not to generation (step 12). The generation LLM sees only the current message and static profile state.

**Root cause:** The generation prompt was designed to produce a response from the current turn's processing results, not from conversational context. This is a design assumption that a single-turn response can be sufficient if the profile state is rich enough. The exercises proved this assumption is wrong — profile state cannot substitute for conversational memory.

### P0-3: No "what Smudge said last" in generation context

**Symptoms:** Repetitive language, repeating the same question, not knowing when a topic was already discussed.

**Contributing factors:** The response from Turn N is sent to the frontend but not stored on the backend. Turn N+1's generation LLM has no access to Turn N's response.

**Root cause:** Same as P0-1 — the architecture has no conversational state persistence. The generation LLM's response is fire-and-forget from the backend's perspective.

### P1-1: areas_outstanding as the dominant discovery pressure

**Symptoms:** Smudge defaults to asking another question. Direct requests for help converted to discovery questions. "Interview" feeling.

**Contributing factors:**
1. `areas_outstanding` is a prominent part of the generation prompt: "Areas you haven't explored yet (for your awareness, not a checklist to work through)"
2. `behavioural_notes` from companionCore includes: `Still exploring — N area(s) need substance before reflecting` and `Suggested next area: "X"`
3. The fallback response for `no_discoveries` is: "I hear you. Tell me a bit more about what's on your mind." — this IS a discovery question.
4. Rule 20 says "not a checklist" but the areas are still listed, creating implicit pressure.
5. The generation prompt's structure puts areas_outstanding in the "what happened this turn" section, making it salient.

**Root cause:** The 6-area assessment model was designed to measure understanding completeness, but its output (areas_outstanding) has become the de facto conversation driver. The generation LLM sees what's missing and naturally asks about it, regardless of what the user actually wants to talk about. The prompt says "not a checklist" but structurally presents it as one.

### P1-2: 18 of 25 profile fields not sent to generation

**Symptoms:** Smudge doesn't reference detailed information it previously captured. "Restarting" feeling.

**Contributing factors:** `buildProfileContext()` was written as a minimal summary, not a full profile dump. The richer fields (service_history, operational_context, evidence_log) are complex nested objects that would need formatting.

**Root cause:** The generation prompt was designed to be lean (avoid token costs, reduce noise). But the trade-off was too aggressive — the LLM doesn't have enough information to demonstrate that it remembers what was discussed.

### P1-3: No mechanism for "sufficient discovery → move to helping"

**Symptoms:** Smudge doesn't know when to move from understanding to helping. Keeps asking questions even when the user wants advice.

**Contributing factors:**
1. The lifecycle transition EXPLORING → CONFIRMING requires 4 core areas to have substance (≥15 chars). This is a data-completeness heuristic, not a conversational signal.
2. The lifecycle transition CONFIRMING → CONFIRMED requires explicit user confirmation. But there's no mechanism to transition from CONFIRMED to "helping" mode — CONFIRMED just triggers "not yet supported" in step 2.
3. The `areas_outstanding` heuristic doesn't account for conversational signals like "I think I've covered enough" or "Can you help me with X?" — these are interpreted as messages but don't change the area assessment.
4. The generation prompt includes `areas_outstanding` but no "the user wants help with X" signal.

**Root cause:** The lifecycle model assumes discovery is complete when 4 data areas are filled. But conversational completeness is different from data completeness. A user can feel understood after discussing 2 areas, or feel uninformed after all 6 are filled. The architecture has no mechanism to bridge "data complete" to "conversationally ready to help."

### P2-1: Returning-user continuity is frontend-only

**Symptoms:** Returning to MATE feels like starting over. "Where were we?" results in re-orientation.

**Contributing factors:** Conversation history exists only in frontend localStorage. The backend has profile state but no conversation log. If localStorage is lost, there's no way to reconstruct the conversation.

**Root cause:** No backend conversation persistence. The architecture assumed the frontend would maintain conversation context and the backend would maintain profile state. But a companion experience requires the backend to know where the conversation left off.

### P2-2: Safety state can overwrite conversational context

**Symptoms:** After a safety event, the conversation may lose its previous flow.

**Contributing factors:** Safety pending state is stored in `safety_flags`. When safety fires, the turn short-circuits (step 1b or step 6) — no discoveries, no companionCore, no generation. After the safety event is resolved (benign), the profile is unchanged but the conversation has lost a turn. The generation LLM in the next turn has no knowledge that a safety event occurred.

**Assessment:** This is LOW risk. Safety state is stored in `safety_flags` only and doesn't overwrite profile fields. The main impact is the lost turn (safety response instead of normal conversation). After resolution, normal processing resumes. The generation LLM doesn't know about the safety event, but this is arguably correct — the safety event was a side-channel, not part of the main conversation.

---

## F. Architectural Strengths Worth Preserving

1. **Deterministic engine architecture** — The 5 engines (Understanding, Capability, Decision, Partnership, Transition) are deterministic, auditable, and have clear contracts. This is a genuine strength. The LLM should not replace them.

2. **Evidence gate** — No capability without traceable evidence_log reference. This prevents the LLM from inventing capabilities. The evidence gate is a structural safeguard that should be preserved.

3. **Lifecycle authority model** — companionCore owns lifecycle transitions, not the LLM. The LLM cannot write tos_phase directly. This is correct and should be preserved.

4. **Conductor wiring** — mapAuthoritativeIntent provides a deterministic override for specific interpretation intents (frustration → stop, orientation → explain, correction → accept). This is a lightweight, effective mechanism that should be preserved and potentially extended.

5. **Safety classification system** — Three-way classification (none/ambiguous/clear_concern) with recovery state is structurally sound. The narrowed definitions (post-safety-fix) correctly distinguish anger from crisis.

6. **Post-generation validation** — Identity integrity and grounding checks catch LLM hallucinations. This is a valuable safety net.

7. **companionCore as shared domain logic** — One implementation, two entry points. Clean separation between trust boundary (wrapper) and domain logic (companionCore).

8. **Deserialization adapter** — Explicit handling of JSON-string fields. Not glamorous, but prevents a class of bugs.

9. **22 generation rules** — The rules are well-crafted and address real behavioural issues. The problem is not the rules — it's that the LLM doesn't have enough context to follow them.

10. **Thin frontend** — Chat.jsx is a presentation layer. All logic is server-side. This is correct and should be preserved.

---

## G. Architectural Weaknesses

### G1. Profile memory ≠ conversational memory (fundamental)

The system treats UserProfile as the memory. But UserProfile answers "what do we know about this person?" — not "where are we in the conversation?" These are different questions requiring different state.

**What we know about Paul:** Army, 9 years, signals, enjoys problem-solving, wants to work in tech. (Profile state)

**Where Paul and Smudge are in their conversation:** We just discussed his signal corps experience, he asked about civilian equivalents, I explained, he said "that makes sense" and asked about CVs. (Conversational state — NOT STORED)

The architecture expects profile state to substitute for conversational state. It cannot. Profile state is a DERIVATIVE of conversation — it's what remains after the conversation is distilled. But the conversation itself — the flow, the focus, the open threads — is lost.

### G2. Generation is stateless by design

Each generation call is independent. The LLM has no memory of:
- What it said last turn
- What topics were covered
- What the user asked for
- What was closed
- What corrections were made

This means the LLM must infer all of this from the current message + profile state. When the profile state is thin (early conversation), the LLM has almost nothing to work with. When it's rich (later conversation), the LLM has data but no conversational context.

### G3. areas_outstanding drives discovery by default

The 6-area assessment model is a data-completeness check, not a conversational readiness check. But its output (areas_outstanding + behavioural_notes) is the primary signal the generation LLM receives about "what to do next." When areas are outstanding, the LLM naturally asks about them. The prompt says "not a checklist" but structurally presents it as one.

The conductor wiring mitigates this for 3 specific cases (frustration, orientation, correction). But for the 5 other intents (answering, asking_question, seeking_reassurance, sharing_milestone, other), the LLM has no override and defaults to discovery.

### G4. No bridge from understanding to helping

The lifecycle model transitions EXPLORING → CONFIRMING → CONFIRMED. But there's no "HELPING" state. After CONFIRMED, the system says "not yet supported." The user can be fully understood and still have no way to ask for help within the conversational flow.

The generation prompt doesn't include a "the user wants help with X" signal. If the user says "can you help me with my CV?", the interpretation extracts this as a candidate discovery (or doesn't), but the generation LLM has no signal that the user is requesting help rather than providing information.

### G5. No "enough" signal

The system knows when areas are complete (all 6 substantive). But it doesn't know when the CONVERSATION is complete for a topic. A user can say "that's all I want to say about that" and the system has no mechanism to record this. The area will still show as "outstanding" if the profile field is empty, or "explored" if it's filled — regardless of what the user said about wanting to move on.

### G6. Frontend localStorage is fragile and unidirectional

Conversation history exists only in the frontend. It's lost on:
- Device change
- Browser data clear
- Different browser
- localStorage quota exceeded
- Incognito mode

And it's never sent to the backend except as a 3-4 exchange window for interpretation only.

---

## H. Minimum Correction Options (Not Implementation)

### H1. Pass recent_context to the generation LLM (P0-2 fix)

**What:** Add `recent_context` to `genContext` and include it in `buildGenerationPrompt()`.

**Scope:** smudgeOrchestrator.ts only. One field added to genContext. One section added to the generation prompt.

**Impact:** The generation LLM would see the last 3-4 exchanges, allowing it to reference previous topics, avoid repetition, and maintain continuity.

**Risk:** Token cost increase. Prompt becomes longer. May need to limit to 3 exchanges to control cost.

**Does NOT require:** Schema changes, entity changes, new entities, lifecycle changes, companionCore changes.

### H2. Pass Smudge's last response to the generation LLM (P0-3 fix)

**What:** Include Smudge's response from the previous turn in the generation context. This could come from `recent_context` (if it includes Smudge responses) or from a new persisted field.

**Scope:** If using `recent_context` (which includes both user and Smudge messages), H1 already covers this. If `recent_context` only includes user messages, Smudge's response needs to be included separately.

**Impact:** The LLM would know what it said last, preventing repetition and enabling natural continuation.

**Risk:** Same as H1.

### H3. Add conversational state to UserProfile or a new entity (P0-1 fix)

**What:** Persist conversational state across turns. Options:
- (a) Add fields to UserProfile (e.g., `last_conversational_focus`, `topics_covered`, `topics_closed`, `last_smudge_response`)
- (b) Create a new entity (e.g., `ConversationState`) with a foreign key to UserProfile
- (c) Use a JSON field on UserProfile (e.g., `conversation_context`) that stores structured conversational state

**Scope:** Schema change (option a/c) or new entity (option b). Backend logic to read/write. Generation prompt to include.

**Impact:** The backend would know where the conversation left off. Returning users could get a grounded recap. Topics could be marked as closed. User corrections could be remembered.

**Risk:** Schema change requires builder deployment. New entity requires builder deployment. Must ensure conversation state doesn't conflict with profile state or safety state.

**This is the largest change but the most impactful.** H1 + H2 address the immediate symptoms (repetition, no continuity), but H3 addresses the root cause (no conversational memory).

### H4. Include more profile fields in buildProfileContext (P1-2 fix)

**What:** Add `service_history`, `operational_context`, and other rich fields to `buildProfileContext()`.

**Scope:** smudgeOrchestrator.ts only. One function updated.

**Impact:** The generation LLM would have access to the full profile, enabling it to reference specific roles, achievements, and factors.

**Risk:** Token cost increase. May need to format/truncate complex fields.

### H5. Add "user_request" signal to genContext (P1-3 fix)

**What:** When the interpretation detects that the user is asking for help (not just providing information), pass this as a signal to the generation LLM. This could be:
- A new interpretation field (e.g., `is_help_request: boolean`)
- A new authoritative intent (e.g., `HELP_REQUESTED`)
- A new genContext field (e.g., `user_request_type`)

**Scope:** smudgeOrchestrator.ts. Interpretation schema + genContext + generation prompt.

**Impact:** The generation LLM would know when the user wants help vs. when they're providing information. This would prevent "direct requests for help converted to discovery questions."

**Risk:** Interpretation LLM may not reliably distinguish help requests from information provision. May need few-shot examples.

### H6. Extend conductor wiring to handle more intents (P1-1 partial fix)

**What:** Map more interpretation intents to authoritative intents:
- `seeking_reassurance` → `REASSURE` (don't probe, acknowledge and validate)
- `sharing_milestone` → `ACKNOWLEDGE_MILESTONE` (don't probe, celebrate)
- `asking_question` → `ANSWER` (answer the question, don't redirect to discovery)

**Scope:** smudgeOrchestrator.ts. `mapAuthoritativeIntent()` + generation prompt rules.

**Impact:** More deterministic control over Smudge's response behaviour for specific intent types.

**Risk:** May over-constrain the LLM. Some intents genuinely need flexibility.

### H7. Add "topic closure" mechanism (P2 — G5 fix)

**What:** When the user says "that's all" or "let's move on," record this in conversational state (H3). The generation LLM would then know not to revisit that topic.

**Scope:** Depends on H3 (conversational state). Interpretation to detect closure signals. Generation prompt to respect closure.

**Impact:** Smudge would stop reopening topics the user has closed.

**Risk:** Detecting closure is non-trivial. "That's all" could mean "I'm done with this topic" or "I'm done with the whole conversation."

---

## I. MVP Architectural Fitness Judgement

### Can the existing LLM-based MATE architecture support the companion experience for MVP with bounded refinement?

**YES — with one critical addition.**

The existing architecture is fundamentally sound:
- Deterministic engines are correct and should be preserved
- Lifecycle authority model is correct
- Evidence gate is correct
- Safety system is correct (post-fix)
- Conductor wiring is correct (for 3 cases)
- 22 generation rules are correct
- companionCore is correct

The critical missing piece is **conversational state**. The architecture was designed to persist profile state and process each turn independently. This was a reasonable MVP assumption that has been disproven by the exercises. The exercises showed that a companion experience requires the system to remember where the conversation is, not just who the user is.

The minimum fix is:
1. **H1: Pass recent_context to generation** — immediate, no schema change, high impact
2. **H3: Add conversational state persistence** — requires schema/builder change, highest impact

H1 can be done immediately and would address the most visible symptoms (repetition, no continuity, "restarting" feeling). H3 is a larger change but addresses the root cause.

### Is a material architecture change necessary?

**NO — for MVP.** The architecture doesn't need to be replaced. It needs to be EXTENDED with conversational state. The existing engine/lifecycle/evidence model is sound. The gap is in the generation context, not the architecture.

**YES — for post-MVP.** If the pilot proves that users return multiple times and expect continuity across sessions, a dedicated conversation management layer (separate from UserProfile) will be needed. But this is not required for the MVP pilot where the primary test is "would a service leaver willingly keep talking to this bloke?"

---

## J. Agentic-Now: YES/NO with Reasoning

### NO.

The diagnostic does not find any problem that requires Agentic AI to solve. Every issue identified is a problem of MISSING INFORMATION, not MISSING CAPABILITY. The LLM is capable of maintaining conversational continuity — it just doesn't have the context to do so.

Specifically:

1. **Repetition** → caused by no conversation history in generation context. Fix: pass recent_context to generation. Not agentic.

2. **Reopening topics** → caused by no topic closure state. Fix: persist conversational state. Not agentic.

3. **Defaulting to discovery** → caused by areas_outstanding pressure in generation prompt. Fix: extend conductor wiring + adjust prompt. Not agentic.

4. **"Restarting" feeling** → caused by no returning-user continuity. Fix: persist conversation state. Not agentic.

5. **Not knowing when to move to helping** → caused by no "user wants help" signal. Fix: add help-request detection. Not agentic.

6. **Robotic tone** → caused by lack of situational awareness (the LLM doesn't know what it said last). Fix: pass recent_context to generation. Not agentic.

**What WOULD require Agentic AI:**
- Multi-step planning (Smudge decides to do X, then Y, then Z autonomously)
- Tool use (Smudge calls external APIs to fetch information)
- Proactive outreach (Smudge initiates conversations without user prompting)
- Complex reasoning across multiple turns (Smudge maintains a plan across many turns)

None of these are required for MVP. The MVP requirement is "a companion that maintains conversational continuity." That's a context problem, not an agency problem.

---

## K. Recommended Sequence of Work

### Phase 1: Immediate context fix (no schema change)

1. **H1: Pass recent_context to generation LLM**
   - Add `recent_context` to `genContext`
   - Add a "Recent conversation" section to `buildGenerationPrompt()`
   - Test: repetition should decrease, continuity should improve

2. **H4: Include more profile fields in buildProfileContext**
   - Add `service_history` (formatted), `operational_context` (formatted), `full_name`
   - Test: LLM should reference previously captured details

3. **H6: Extend conductor wiring**
   - Map `seeking_reassurance`, `sharing_milestone`, `asking_question` to authoritative intents
   - Test: fewer discovery questions for these intents

### Phase 2: Conversational state (schema change required)

4. **H3: Add conversational state persistence**
   - Option (c): Add `conversation_context` JSON field to UserProfile
   - Store: last_smudge_response, current_focus, topics_covered, topics_closed, last_user_request
   - Read at generation, write after generation
   - Test: returning users should get grounded recap, closed topics should not reopen

5. **H5: Add user_request signal**
   - Detect help requests in interpretation
   - Pass to generation as authoritative intent or genContext field
   - Test: "can you help me with my CV?" should get help, not a discovery question

### Phase 3: Post-pilot (if needed)

6. **H7: Topic closure mechanism**
   - Detect closure signals
   - Record in conversational state
   - Generation prompt respects closure

7. **Dedicated conversation entity** (if multi-session continuity is required)
   - Separate from UserProfile
   - Full conversation log with session boundaries
   - Enables "Where were we?" across devices and sessions

---

## Summary

The MATE architecture is sound in its deterministic layer (engines, lifecycle, evidence, safety) and weak in its conversational layer (generation context, conversational memory, returning-user continuity).

The root cause is not a flaw in the engines, the lifecycle model, or the generation rules. The root cause is that the system persists WHO the user is (profile state) but not WHERE the conversation is (conversational state). The generation LLM is asked to be a companion with amnesia — it must maintain continuity from a single message and a static profile.

The minimum fix is to give the generation LLM the conversation history it already has access to in the interpretation step (H1) and to persist conversational state across turns (H3). Neither requires Agentic AI. Neither requires replacing the architecture. Both are extensions to the existing model.

The architecture is not broken. It is incomplete. The deterministic layer was built first (correctly). The conversational layer was assumed to be handled by the LLM's inference. The exercises proved that inference alone is not sufficient — the LLM needs explicit conversational context to maintain continuity.

**One mountain. Three views. One truth.**

---

END OF DIAGNOSTIC.

STOP.

Awaiting three-view review (Paul + Cipher + Ash) before any engineering authority.
