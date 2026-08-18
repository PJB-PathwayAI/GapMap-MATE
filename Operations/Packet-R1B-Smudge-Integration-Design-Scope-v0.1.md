# Packet R1-B Design Scope — Minimum Smudge Integration Contract

**Operation:** PROOF — Human Test Readiness Gate R1  
**Packet:** R1-B — Smudge Integration Design (DESIGN ONLY — NO IMPLEMENTATION)  
**Authority:** Design scope proposal. Requires Paul + Cipher + Ash agreement before implementation.  
**Date:** 18 August 2026  
**Author:** Ash (Chief Engineer)  

---

## Purpose

Define the minimum integration contract to wire the Chat/Smudge conversational layer to the MATE backend engine layer. This is design only — no implementation, no code changes, no builder messages.

R1-A proved:
- Dashboard.jsx already connects to the MATE backend (profileBootstrap, UserProfile, tos_phase, structured data)
- Chat.jsx is disconnected — hard-coded placeholder responses, no engine calls, no profile context
- The missing seam is specifically Chat/Smudge → MATE backend conversational + engine layer

This document proposes the minimum contract to bridge that seam while preserving all locked doctrine.

---

## Principles to Preserve (non-negotiable)

Every design decision in R1-B must honour these:

1. **Understand Before Advising** — the conversational layer must respect the lifecycle. It cannot provide advice before understanding is established. It cannot jump ahead of tos_phase.

2. **User Decides** — the conversational layer cannot infer lifecycle transitions. It can only pass explicit user signals to the engines. Confirmation requires explicit user_response_type='confirming'. Settlement requires explicit conclude_journey or update_partnership_state with INDEPENDENT.

3. **Evidence Rule** — no capability without traceable evidence_log reference. The conversational layer cannot create capabilities. It can only submit capabilities with evidence_refs that resolve to the evidence_log.

4. **Canonical Lifecycle Ownership** — companionService owns EXPLORING→CONFIRMING and CONFIRMING→CONFIRMED. Each engine owns its domain transitions. The conversational layer NEVER writes tos_phase directly. It reads tos_phase to know where the user is. It calls engines that own the transitions.

5. **Packet 1 Ownership Boundary** — each engine owns its domain. The conversational layer calls engines through their action interface. It never bypasses an engine. It never calls another engine's actions.

6. **Packet 2 Engine Contracts** — the action interface IS the contract. Parameters in, structured response out. The conversational layer does not interpret engine internals. It consumes the response.

7. **No Lifecycle Inference by Conversational Layer** — Smudge reads tos_phase from UserProfile. Smudge does NOT set tos_phase. Smudge passes user_response_type to companionService. Smudge does NOT decide confirmation. The engine decides. Smudge reports.

---

## Minimum Smudge Integration Contract

### 1. Profile Context Acquisition

Chat.jsx must acquire profile context on entry. The pattern already exists in Dashboard.jsx.

**Required:**
- Call profileBootstrap on authenticated entry (same pattern as Dashboard.jsx)
- Obtain canonical profile_id
- Load UserProfile
- Read tos_phase

**Constraint:** Profile context must be established BEFORE any conversation occurs. A user without a profile cannot interact with Smudge.

### 2. Lifecycle Awareness

Smudge must know where the user is in the lifecycle to route conversation correctly.

**Required:**
- Read tos_phase from UserProfile at conversation start
- Use tos_phase to determine which engine to call
- Refresh tos_phase after each engine call (engines update it)

**tos_phase → engine routing:**

| tos_phase | Engine Called | Action |
|-----------|--------------|--------|
| EXPLORING | companionService | (implicit — process discoveries) |
| CONFIRMING | companionService | (implicit — process discoveries + response type) |
| CONFIRMED | engineCapabilityIntelligence | (depends on capability state) |
| EVALUATING | engineDecisionReadiness | (depends on soak state) |
| READY_TO_ACT | engineTransitionPartnership | start_journey |
| IN_TRANSITION | engineTransitionPartnership | (depends on user action) |
| SETTLED | engineTransitionPartnership | get_journey_status (read-only) |

**Constraint:** Smudge does NOT decide which engine to call based on conversation content. It decides based on tos_phase. The lifecycle drives the conversation, not the other way around.

### 3. Conversational Interpretation

Smudge must extract structured data from natural language conversation to pass to engines.

**Required for companionService (EXPLORING/CONFIRMING):**
- Extract new_discoveries from user messages (structured profile fields)
- Determine user_response_type from conversational signals:
  - 'answering' — user is sharing information
  - 'correcting' — user is correcting something Smudge said
  - 'confirming' — user is confirming the operational picture
  - 'rejecting' — user is rejecting the operational picture

**Required for engineCapabilityIntelligence (CONFIRMED):**
- Extract capability submissions with evidence_refs
- Call validate_preconditions before any capability work
- Call seed_evidence if evidence_log is empty
- Call submit_capabilities with extracted capabilities
- Call get_capability_picture for presentation

**Required for engineDecisionReadiness (EVALUATING):**
- Extract decision factors from conversation
- Call evaluate_pathways for pathway matching
- Call initiate_soak / complete_soak / bypass_soak based on user signals

**Required for engineTransitionPartnership (READY_TO_ACT/IN_TRANSITION):**
- Extract commitments, blockers, milestones from conversation
- Call appropriate actions based on user intent

**Constraint:** Smudge does NOT decide lifecycle transitions. It passes structured data and explicit user signals to the engines. The engines decide.

### 4. Response Generation

Smudge must generate conversational responses using engine output.

**Required:**
- Use companionService `flow_guidance` to shape conversation (next_area, reflection_content, behavioural_notes)
- Use engine responses to generate natural language responses
- Preserve Smudge's voice (warm, grounded, walk-beside)

**Constraint:** Smudge does NOT generate advice that the engines have not authorised. If the engine says "ready_to_reflect: false", Smudge does not reflect. If the engine says "preconditions not met", Smudge does not present capabilities.

### 5. Conversation Persistence

**Preserve existing pattern:**
- localStorage `gapmap_chat_${user.id}` for conversation history
- Client-side persistence is PROVEN and accepted for MVP controlled pilot

**Future (deferred):**
- Server-side conversation entity for cross-device continuity

---

## Design Questions Requiring Resolution Before Implementation

These questions must be answered by Paul + Cipher + Ash before R1-B implementation begins:

### Q1: Where does the LLM sit?

Options:
- **A) Base44 built-in AI agent** — if the Base44 platform supports an in-app AI agent component that can call backend functions
- **B) External LLM via API** — Smudge calls an LLM API (OpenAI, Anthropic) with engine output as context
- **C) Base44 backend function as orchestrator** — a new backend function that receives raw user text, calls the appropriate engine, calls an LLM to generate the response, and returns the formatted reply

**Impact:** This determines the entire architecture of the conversational layer. Each option has different tradeoffs for latency, cost, and control.

### Q2: How does Smudge extract structured discoveries from natural language?

The companionService expects structured `new_discoveries` (objects with profile fields). User messages are natural language. Something must bridge this gap.

Options:
- **A) LLM extraction** — the LLM reads the user message and extracts structured fields
- **B) Structured input** — the UI guides the user to provide structured input (forms, guided conversation)
- **C) Hybrid** — the LLM extracts, but the UI provides structure for confirmation

### Q3: How does Smudge determine user_response_type?

The companionService uses `user_response_type` to gate lifecycle transitions. Something must determine whether the user is 'answering', 'correcting', 'confirming', or 'rejecting'.

Options:
- **A) LLM classification** — the LLM reads the message and classifies the response type
- **B) UI signal** — the user clicks a "Confirm" or "Correct" button
- **C) Hybrid** — the LLM classifies, but the UI provides explicit confirmation buttons

### Q4: How does the conversation shift between phases?

When companionService returns `tos_phase: CONFIRMED`, the conversation needs to shift to capability intelligence. How does this transition happen in the UI?

Options:
- **A) Automatic routing** — Smudge reads the new tos_phase and shifts conversation topic
- **B) User-initiated** — Smudge announces the shift and the user chooses to proceed
- **C) Dashboard-driven** — the Dashboard shows the phase change and the user navigates to the appropriate surface

### Q5: Does Smudge call engines directly, or through a new orchestrator?

Currently, companionService is the only orchestrator. But it only handles Phase 2 (discovery + confirmation). Phases 3-5 require direct engine calls.

Options:
- **A) Smudge calls engines directly** — the conversational layer calls engineCapabilityIntelligence, engineDecisionReadiness, engineTransitionPartnership based on tos_phase
- **B) New orchestrator function** — a new backend function that routes to the correct engine based on tos_phase (similar to companionService but broader)
- **C) companionService expanded** — companionService is expanded to route to all engines

**Constraint (Packet 1):** Each engine owns its domain. An orchestrator would route, not own.

---

## Proposed R1-B Implementation Phases (design only — not authorised)

### Phase 1: Smudge Integration Contract Definition

- Answer Q1-Q5 above
- Define the minimum conversational → engine interface
- Document the routing logic (tos_phase → engine → action)
- Define the response generation pattern
- Review against all 7 principles

**Gate:** Paul + Cipher + Ash sign-off on the contract

### Phase 2: Chat.jsx Profile Context Wiring

- Replicate Dashboard.jsx pattern: profileBootstrap → profile_id → UserProfile → tos_phase
- Add lifecycle awareness to Chat.jsx
- Remove hard-coded SMUDGE_RESPONSES

**Gate:** Chat.jsx reads tos_phase correctly

### Phase 3: Companion Service Integration

- Wire Chat.jsx to call companionService with structured new_discoveries
- Wire user_response_type from conversation signals
- Wire flow_guidance consumption for response shaping

**Gate:** Full EXPLORING → CONFIRMING → CONFIRMED lifecycle through conversation

### Phase 4: Engine Integration (Phases 3-5)

- Wire engineCapabilityIntelligence for CONFIRMED phase
- Wire engineDecisionReadiness for EVALUATING phase
- Wire engineTransitionPartnership for READY_TO_ACT/IN_TRANSITION/SETTLED phases

**Gate:** Full EXPLORING → SETTLED lifecycle through conversation

### Phase 5: Verification

- Fresh-profile E2E through the conversation UI
- Disruption exercise (failed interview → confidence drop → pause → return → recovery)
- Bodge regression baseline verification

**Gate:** R1-B Test Receipt — would we be happy introducing Bodge to Smudge tomorrow?

---

## Constraints on Implementation

1. **No lifecycle inference by conversational layer** — Smudge reads tos_phase, doesn't set it
2. **No engine bypass** — all engine work goes through the action interface
3. **No advice without engine authorisation** — Smudge does not advise unless the engine has authorised it
4. **No capability without evidence** — Smudge does not present capabilities unless evidence_log supports them
5. **No confirmation without explicit user signal** — Smudge does not confirm unless user_response_type='confirming' is explicitly passed
6. **No settlement without explicit user expression** — Smudge does not conclude unless the user explicitly says so

---

## Document Control

**Status:** R1-B Design Scope Proposal — NOT IMPLEMENTATION  
**Authority:** Design only. No implementation authorised.  
**Next:** Paul + Cipher + Ash review. Answer Q1-Q5. Define the minimum Smudge integration contract.  
**Prerequisite:** R1-A v1.2 COMPLETE (evidence complete)  

---

*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
