# Generation Context / Situational Awareness Inspection — SCOPE

**Date:** 19 August 2026
**Author:** Ash (Chief Engineer)
**Status:** RETURNED FOR THREE-VIEW APPROVAL
**Classification:** Read-only inspection scope
**Authority:** Exercise SMUDGE AAR reconciliation (Paul, Cipher, Ash). Engineering hold in force.

---

## Purpose

Map the deployed smudgeOrchestrator → InvokeLLM generation path against approved doctrine and Exercise SMUDGE evidence. Determine, for each generation turn, what Smudge actually receives versus what approved doctrine requires him to know.

**Primary inspection question:** "What does Smudge need to know, and in what form, to enact approved doctrine reliably?"

**Method:** Read-only code inspection. No code changes, no deployments, no test runs, no builder messages. The inspection inspects what is deployed, not what we think is deployed.

---

## Hypotheses Under Investigation

| ID | Hypothesis | Constraint |
|---|---|---|
| H1 | Orientation may be a conversational prerequisite to Exploration. The inspection must determine whether this requires lifecycle representation or can remain generation/context behaviour. | No new tos_phase is authorised. |
| H2 | Conductor judgement may require explicit conversational-act selection before response generation. | No additional LLM stage, engine or orchestration component is authorised. |

Both hypotheses are investigation targets only. The inspection gathers evidence; it does not authorise design.

---

## Reopened Assumptions Under Inspection

| ID | Assumption (reopened) | Consolidated Question |
|---|---|---|
| B | Behavioural doctrine supplied through generation instructions is sufficient without richer conversational context. | Are rules alone sufficient, or does the LLM need richer context to enact them? |
| C | Profile/evidence state currently supplied to generation is sufficient for grounded conversation. | Is the input data sufficient for grounded, continuous conversation? |

B and C are inspected as one consolidated question: "What does Smudge need to know, and in what form?"

---

## Out of Scope

| Item | Reason |
|---|---|
| First-run/bootstrap sequencing | Separate integration finding (OBS-SMUDGE-01). Handled outside this inspection. |
| Guardian Protocol implementation | Reopened for separate safety review. This inspection records safety-context gaps but does not propose safety design. |
| Code changes of any kind | Engineering hold in force. |
| Prompt modifications | Engineering hold in force. |
| Test execution | Read-only inspection only. |

---

## Inspection Items

For each item, the inspection will produce:

**Doctrine says Smudge needs** → **Deployed generation actually receives** → **GAP / NO GAP**

---

### Item 1 — Profile Information

**What profile information is passed to the generation LLM?**

**Doctrine expectations:**
- Experience Blueprint Ch.2: "Relationship Before Information" — Smudge needs relationship context, not just field labels.
- Behavioural Hierarchy: Understanding requires knowing what the user has shared.
- Evidence Rule: No capability without traceable evidence_log reference.

**Where to inspect:**
- `genContext` construction in `smudgeOrchestrator.ts` — what fields from `profile` are included?
- `formatAcceptedDiscoveries()` function — does it return values or just field names?
- `areas_explored` and `areas_outstanding` — are these labels or content?
- `T.guidance` from companionCore — does flow guidance include profile values?

**Key question:** Are actual profile VALUES (service_branch, rank, professional_identity, service_history content, goals content, personal_context content) passed to the generation LLM, or only LABELS indicating which areas have been explored?

---

### Item 2 — Conversation History

**What conversation history is passed to the generation LLM?**

**Doctrine expectations:**
- Chapter 2: "Listening Is an Intervention" — listening implies remembering.
- Experience Blueprint: "Continuity over humanity" — engineering continuity, structured memory.
- OBS-SMUDGE-04: Facts established earlier must be reflected in later responses.

**Where to inspect:**
- `genContext.user_message` — is this only the current turn's message?
- `buildGenerationPrompt()` — does the prompt include any previous user messages or Smudge responses?
- companionCore input/output — does companionCore pass conversation history to the orchestrator?
- InvokeLLM call — does it use a chat/completion API with message history, or a single prompt?

**Key question:** Does the generation LLM see ANY previous messages, or only the current turn?

---

### Item 3 — Evidence State

**What evidence state is passed to the generation LLM?**

**Doctrine expectations:**
- Evidence Rule (hard gate): No capability without traceable evidence_log reference.
- Principle 2: "Evidence before inference."
- OBS-SMUDGE / ASH-OBS-01: Smudge claimed "good picture" without evidence. The generation layer must not represent understanding that evidence doesn't support.

**Where to inspect:**
- `genContext` — is `evidence_log` included?
- `genContext.confirmed` and `genContext.ready_to_confirm` — are these flags backed by evidence, or just area counts?
- `companionCore` output — does it pass evidence state to the orchestrator?
- `buildGenerationPrompt()` — does the prompt tell the LLM what evidence exists?

**Key question:** Does the generation LLM know what is in evidence_log, or only that N areas have substance?

---

### Item 4 — Lifecycle State

**What lifecycle state is passed to the generation LLM?**

**Doctrine expectations:**
- CBR §4: "What you focus on changes depending on where the person is in their journey."
- R1-C.1D-BDI: `canonical_phase` (tos_phase) passed to generation for cross-phase constraint.
- Packet 2B v1.1: 7-state lifecycle (EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED).

**Where to inspect:**
- `genContext.canonical_phase` — what value is passed?
- `buildGenerationPrompt()` — how is `canonical_phase` used in the system prompt?
- `m.tos_phase_after` — is this the post-companionCore phase (after any transition this turn)?

**Key question:** Is the lifecycle state sufficient for the LLM to adapt focus, or does it need more context about what each phase means and what behaviour is expected in each?

---

### Item 5 — Behavioural Notes

**What behavioural notes are passed to the generation LLM?**

**Doctrine expectations:**
- CBR §2: Topic completion checkpoints — "I think I've got a good picture of that now."
- CBR §6: Conductor behaviour — suggested next area as suggestion, not script.
- companionCore `generateFlowGuidance()` — produces `behavioural_notes[]` with checkpoint signals, area completion, and suggested next areas.

**Where to inspect:**
- `genContext.behavioural_notes` — what notes are included?
- `T.guidance.behavioural_notes` — what does companionCore actually generate?
- `generateFlowGuidance()` function — what notes does it produce and in what form?
- `buildGenerationPrompt()` — how are behavioural_notes presented to the LLM?

**Key question:** Are the behavioural notes specific enough to guide behaviour (e.g., "Area X just reached substance, consider a checkpoint"), or are they too generic?

---

### Item 6 — Smudge Identity

**What does Smudge know about himself?**

**Doctrine expectations:**
- Rule 10: "Do not pretend to have military experience. You are a companion, not a veteran."
- CBR §4: "You are the same person in every conversation — warm, practical, unhurried."
- OBS-SMUDGE-03: Smudge fabricated service identity ("I served in the Army for a few years"). The identity constraint must be unambiguous and sufficient.

**Where to inspect:**
- `buildGenerationPrompt()` system prompt lines — what identity statements are included?
- Is there any identity context beyond "You are Smudge, a companion for people leaving the military"?
- Rule 10 wording — is it emphatic enough? Is it positioned prominently?
- Is there any post-generation check that filters fabricated identity claims?

**Key question:** Does the generation prompt give Smudge a clear, sufficient identity that prevents fabrication, or is the identity constraint too thin to reliably prevent the LLM from improvising?

---

### Item 7 — MATE Purpose / Orientation

**What does Smudge know about MATE's purpose?**

**Doctrine expectations:**
- OBS-SMUDGE-02: Orientation failure. When asked "what is this?", Smudge couldn't answer.
- Experience Blueprint Ch.2: "Relationship Before Information" — the user needs to understand what they're in before information gathering begins.
- Commander's Intent: "MATE is not designed to accelerate transition. It is designed to improve the quality of transition decisions."
- H1: Orientation may be a prerequisite to Exploration.

**Where to inspect:**
- `buildGenerationPrompt()` — is there any description of what MATE is or what it does?
- Is there any orientation guidance in the CBR or generation rules?
- `genContext` — is there any flag or signal indicating the user needs orientation?
- companionCore — does it detect orientation needs?

**Key question:** Does the generation prompt contain ANY context about MATE's purpose, or is Smudge unable to explain what the user is in?

---

### Item 8 — Safety State / Context

**What safety state/context survives a safety event?**

**Doctrine expectations:**
- OBS-SMUDGE-07 / ASH-OBS-03: Safety detection worked, but recovery is absent.
- Guardian Protocol (Issue #15): Deferred post-MVP — but AAR reopened this deferral.
- After "ending it" / "ending the day" clarification, Smudge returned to normal conversation with no acknowledgment of the ambiguity event.

**Where to inspect:**
- `smudgeOrchestrator.ts` — is there any safety state field in the orchestrator?
- `genContext` — is there any safety flag or context passed to generation?
- `companionCore` — does it track safety events?
- `UserProfile` schema — `safety_flags` field exists. Is it read or written during generation?
- Is there any post-safety-event recovery protocol in the generation prompt?

**Key question:** Is there ANY safety state that persists across turns, or does each turn start with no memory of safety events?

---

### Item 9 — Orientation Need Detection

**What indication exists that the user needs orientation?**

**Doctrine expectations:**
- OBS-SMUDGE-02: Smudge failed to recognise the user needed orientation, not just exploration.
- OBS-SMUDGE-06: Frustration didn't trigger a strategy change.
- Behavioural Hierarchy: Psychological Safety is the foundation — if the user doesn't feel oriented, nothing above holds.
- H1: Orientation may be a prerequisite to Exploration.

**Where to inspect:**
- Extraction LLM (first call) — does `user_response_type` include an "orientation_needed" or similar classification?
- `genContext` — is there any signal that the user is confused, frustrated, or asking meta-questions?
- `buildGenerationPrompt()` — is there any rule or instruction about recognising orientation needs?
- companionCore — does it detect when the user is asking about the system rather than sharing information?

**Key question:** Does the generation layer have ANY signal that tells Smudge the user needs orientation rather than exploration?

---

### Item 10 — Topic Completion

**What tells Smudge a topic is complete?**

**Doctrine expectations:**
- CBR §2: Topic completion checkpoints — "I think I've got a good picture of that now — anything else before we move on?"
- Rule 12: "If the behavioural guidance says an area has reached substance, move toward closure."
- companionCore `generateFlowGuidance()` — generates `behavioural_notes` with checkpoint signals.

**Where to inspect:**
- `genContext.behavioural_notes` — are checkpoint signals included?
- companionCore `generateFlowGuidance()` — what triggers a checkpoint note? Is it area-level substance only, or does it also detect user-level closure signals?
- `buildGenerationPrompt()` — how is topic completion guidance presented?
- Extraction LLM — does it classify user signals like "that covers it" or "anyway" as topic-closure signals?

**Key question:** Does Smudge receive reliable, specific signals that a topic is complete, or does it rely on the LLM to infer this from context?

---

### Item 11 — Conversational Act Selection

**What tells Smudge what conversational act is appropriate next?**

**Doctrine expectations:**
- OBS-SMUDGE-05: Question-loop behaviour. Smudge needs to decide between: ask, acknowledge, explain, pause, reassure, close a subject, change direction, challenge gently, or simply respond.
- H2: Conductor judgement may require explicit conversational-act selection before response generation.
- CBR §1, §3, §6: Varied rhythm, natural chaining, conductor behaviour.

**Where to inspect:**
- `buildGenerationPrompt()` — is the instruction "Write a natural response to the user" (single-act) or does it include an explicit act-selection step?
- `genContext` — is there any field that suggests the appropriate conversational act?
- `response_intent` in the generation schema — is this an output (post-generation classification) or an input (pre-generation guidance)?
- Extraction LLM — does it suggest a conversational direction?
- companionCore — does `generateFlowGuidance()` include act suggestions beyond "suggested next area"?

**Key question:** Is conversational-act selection explicit (the LLM is told what to do) or implicit (the LLM infers it from context and rules)? If implicit, is the context sufficient for reliable selection?

---

## Output Format

The inspection will produce a single document:

### Generation Context / Situational Awareness Inspection Report

For each of the 11 items:

| Field | Content |
|---|---|
| Item | (item name) |
| Doctrine says Smudge needs | (specific doctrine reference + requirement) |
| Deployed generation actually receives | (actual code evidence — what is passed to InvokeLLM) |
| Assessment | GAP / NO GAP / PARTIAL |
| If GAP, description | (what is missing and why it matters) |
| If GAP, which OBS it explains | (mapping to Exercise SMUDGE findings) |
| Hypothesis relevance | (H1, H2, B, C — if applicable) |

### Summary

- Total items: 11
- GAP count: (to be determined)
- NO GAP count: (to be determined)
- PARTIAL count: (to be determined)
- Primary structural finding: (to be determined)
- H1 assessment: (evidence for/against orientation prerequisite)
- H2 assessment: (evidence for/against explicit act selection)

---

## Sources to Inspect

| Source | Location | Purpose |
|---|---|---|
| smudgeOrchestrator.ts (deployed) | Repo: `functions/smudgeOrchestrator.ts` (commit 8da32fe) | Generation path, genContext, buildGenerationPrompt, InvokeLLM call |
| companionCore.ts (v1.1.0) | Repo: `shared/companionCore.ts` | Flow guidance, behavioural_notes generation |
| CBR v1.0 | Repo: `Operations/Smudge-Companion-Behaviour-Requirements-v1.0.md` | Doctrine requirements for generation behaviour |
| Experience Blueprint Ch.2 | Repo: `Operations/Experience-Blueprint-Chapter-2-v1.0.md` | Relationship Before Information, Behavioural Hierarchy |
| Exercise SMUDGE AAR | This collation | Evidence from live human interaction |
| R1-C.1D-BDI-IMPL SITREP | Repo: `Operations/R1-C.1D-BDI-IMPL-SITREP.md` | Implementation details, generation prompt rules |
| Packet 2B v1.1 | Repo: `Operations/` | Lifecycle contract (7-state) |
| Commander's Intent | Memory / Doctrine | "MATE is designed to improve the quality of transition decisions" |

---

## Constraints

1. **Read-only.** No code changes, no deployments, no test runs, no builder messages.
2. **Evidence-based.** Every assessment must cite actual code, not assumption.
3. **Doctrine-grounded.** Every "needs" must cite approved doctrine, not opinion.
4. **No design proposals.** The inspection records gaps; it does not propose fixes.
5. **No hypothesis confirmation.** The inspection gathers evidence for/against H1 and H2; it does not confirm or deny them.

---

**Ash — Chief Engineer**
**19 August 2026**
**One Mountain. Three Views. One Truth.**
