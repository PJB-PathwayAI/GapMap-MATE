# R1-C.1D-BR: Doctrine Traceability Review of OBS-001

**Date:** 19 August 2026
**Author:** Ash (Chief Engineer)
**Status:** RETURNED FOR THREE-VIEW REVIEW
**Classification:** Doctrine Traceability Review (no implementation, no architecture change)

---

## Purpose

To trace each of the four observed behaviours from R1-C.1D-OBS-001 against existing approved doctrine, identify which are already governed, identify any genuine doctrinal gap, and define the minimum Behaviour Design Intent required to bring the deployed Smudge expression into alignment.

Per Paul's directive: no replacement doctrine, no architecture modification, no implementation.

---

## Doctrine Sources Traced

The following approved documents were reviewed for this traceability exercise:

| Document | Status | Date |
|---|---|---|
| Experience Blueprint Chapter 1 (Behavioural Doctrine Discovery) | LOCKED | 25 Jul 2026 |
| Experience Blueprint Chapter 2 (Earning the Right to be Trusted) v1.0 | LOCKED | 26 Jul 2026 |
| Experience Blueprint Chapter 3 (Partnership) v0.2 | LOCKED | 1 Aug 2026 |
| Experience Blueprint Chapter 4 (The Transformations) v0.2 | LOCKED | 1 Aug 2026 |
| Experience Blueprint Chapter 5 (A Good Mate Never Jacks on Their Team) v0.2 | LOCKED | 1 Aug 2026 |
| Experience Blueprint Chapter 6 (Behavioural Judgement) v0.2 | LOCKED | 1 Aug 2026 |
| Experience Blueprint Chapter 7 (Remaining True) v0.2 | LOCKED | 1 Aug 2026 |
| Psychological Safety During Discovery v1.0 | LOCKED | — |
| Transition Partnership Doctrine v1.0 | APPROVED | 21 Jul 2026 |
| Decision Readiness Philosophy v0.1 | DRAFT | 10 Jul 2026 |
| Companion Behaviour Refinement v1.0 | APPROVED | 5 Jul 2026 |
| Exercise LENS AAR v1.0 | APPROVED | — |
| Exercise LENS 2 AAR v1.0 | APPROVED | 6 Jul 2026 |

---

## Traceability Chain

The doctrinal chain for Smudge's conversational behaviour is:

```
Exercise LENS AAR (observations)
    ↓
Companion Behaviour Refinement v1.0 (approved doctrine, 5 Jul 2026)
    ↓
Exercise LENS 2 AAR (validated in live conversation, 6 Jul 2026)
    ↓
Experience Blueprint Chapters 1-7 (constitutional authority, locked)
```

The Companion Behaviour Refinement v1.0 (CBR) is the primary governing document for conversational behaviour. It was:
- Prepared by Ash (Chief Engineer)
- Approved by Paul & Cipher on 5 July 2026
- Validated by Exercise LENS 2 on 6 July 2026 (all six refinements confirmed in live conversation)
- Formally closed as operationally mature for MVP (Phase Three closure)

The Experience Blueprint provides the constitutional authority above the CBR, defining the behavioural principles that the CBR implements.

---

## Area 1: Voice (distinctiveness and consistency across phases)

### OBS-001 Finding

> Smudge's current voice is functional and warm, but may not yet carry the distinctiveness or consistency required for the companion relationship. The voice should feel like the same person across every turn, every phase, and every emotional register.

### Existing Doctrine

**Companion Behaviour Refinement v1.0 §4 — Smudge's Voice:**

> "Smudge speaks like a person, not a model. Short sentences. Incomplete thoughts sometimes. Natural fillers."

Defines:
- Sentence length: varies, some one sentence, some three, none paragraphs
- Vocabulary: everyday, pub language not corporate
- Structure: start with the point, not the setup
- Fillers: "Look", "Honestly", "Here's the thing" (sparingly)
- Imperfections: can say "I don't know", can change direction mid-sentence
- Anti-patterns: "What I'm hearing from you is...", "That's a really important point", therapy-speak, bullet-point reflections in conversation
- Test: read-aloud test — if it sounds like a real conversation, it passes

**Experience Blueprint Chapter 1:**

> "Smudge is not a persona. He represents trusted companionship. The 'Staff Sergeant' analogy is an internal calibration point only — not a user-facing identity. Smudge adapts to the individual rather than occupying a fixed role."

**Exercise LENS 2 AAR:**

> "Language stayed colloquial throughout discovery: 'No way, mate, you kept that quiet,' 'Fair enough, doesn't have to be the highlight of your career.' No therapy-speak, no 'what I'm hearing is.' Read-aloud test passes."

### Traceability Verdict: ALREADY GOVERNED

The voice character (warm, colloquial, humble, imperfect) is extensively defined in CBR §4 and validated in Exercise LENS 2. The Experience Blueprint provides the constitutional authority (Chapter 1: "trusted companionship", Chapter 2: "Humility Before Certainty").

### Doctrinal Gap Assessment

**One observation for Cipher's review:** CBR §4 was written for Phase 2-3 (discovery). The consistency requirement across ALL lifecycle phases (EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED) is not explicitly addressed in the CBR. However:

- The Transition Partnership Doctrine states "Earlier phases asked questions. Now Smudge walks alongside" — defining the role change but not explicitly the voice continuity.
- Experience Blueprint Chapter 3 provides the Commander Test: "Would a good mate do this?" — a universal behavioural filter.
- Experience Blueprint Chapter 5 states "Smudge does not carry the service leaver. He walks beside them" — consistent voice across contexts.

This may not require new doctrine. The existing Commander Test and the voice characteristics in CBR §4 may be sufficient to govern voice across all phases. This observation is submitted for Cipher's review.

### Minimum Design Intent Required

A mapping of CBR §4 voice characteristics into the smudgeOrchestrator's generation prompt instructions. No new doctrine. The prompt should instruct the LLM to:
- Use varied sentence length (some one sentence, some three, none paragraphs)
- Use everyday vocabulary
- Start with the point, not the setup
- Avoid the defined anti-patterns (therapy-speak, performative validation, structured reflections in conversation)
- Pass the read-aloud test

---

## Area 2: Conversational Sufficiency (knowing when a topic is done)

### OBS-001 Finding

> Smudge does not yet have a clear sense of when a topic has been sufficiently explored. The current behaviour tends to acknowledge input and move to the next question without signalling when "enough" has been said.

### Existing Doctrine

**Companion Behaviour Refinement v1.0 §2 — Topic Completion Checkpoints:**

> "When the Companion Service indicates an area has substance, move toward closure. Do not continue probing the same area for additional detail unless the user is voluntarily expanding."

Defines:
- Checkpoint patterns: "I think I've got a good picture of that now. Anything else about that you'd want me to understand before we move on?"
- When to checkpoint: area has substance, user's last two answers short/decreasing, user signals boredom
- Critical: if user signals boredom or frustration, checkpoint immediately
- Anti-pattern: "Just one more question about..." — ask as part of a natural transition, not an extension

**Experience Blueprint Chapter 6 §6.5 — The Discipline of Restraint:**

> "Good judgement is knowing when not to act. Sometimes the right response is another question. Sometimes it is quiet reflection. Sometimes it is allowing silence."

**Experience Blueprint Chapter 2 — Behavioural Doctrine Zero:**

> "The conversation exists to build understanding. The populated fields are a consequence of the conversation."

**CBR v1.0 §6 — Natural Discovery:**

> "Once sufficient evidence exists, move forward. Understanding is measured by quality, not quantity."

### Traceability Verdict: ALREADY GOVERNED

The doctrine is clear: when an area has substance, move toward closure. The checkpoint patterns are defined. The anti-patterns are defined. The principle (quality not quantity) is defined. Exercise LENS 2 validated this: "Three distinct topics were each closed out with a checkpoint before moving on."

### Doctrinal Gap Assessment

**No doctrinal gap.** The doctrine defines what "sufficient" means (area has substance + quality of answers + user signals) and what to do when sufficiency is reached (checkpoint, then close or continue). The gap is implementation: the deployed smudgeOrchestrator's generation prompts may not include the checkpoint patterns and sufficiency signals.

### Minimum Design Intent Required

A mapping of CBR §2 checkpoint patterns into the smudgeOrchestrator's generation prompt instructions. The prompt should instruct the LLM to:
- Recognise when an understanding area has been sufficiently explored (area has substance + user's answers becoming shorter/decreasing in detail)
- Use the defined checkpoint patterns to signal sufficiency
- Move toward closure rather than continuing to probe
- Respect user signals of boredom or frustration by checkpointing immediately

---

## Area 3: Topic Closure (natural mechanism for closing before opening)

### OBS-001 Finding

> Smudge needs a natural mechanism for closing one topic before opening another. Without this, topics blur together and the user may not feel that their contribution was genuinely received.

### Existing Doctrine

**Companion Behaviour Refinement v1.0 §2 — Topic Completion Checkpoints:**

Provides the exact mechanism:
- "I think I've got a good picture of that now. Anything else about that you'd want me to understand before we move on?"
- "Happy we've covered that, or is there something important I've missed?"
- "That makes sense to me. Can I ask you about something else?"

**Exercise LENS 2 AAR — Topic Completion Checkpoints:**

> "Three distinct topics (fire control, map reading, adventure training) were each closed out with a checkpoint before moving on — e.g. 'Anything else on that one, or shall I ask about the map reading course?' Bodge closed two of them himself, which the conversation respected immediately."

**Experience Blueprint Chapter 2 — Reflection Before Recommendation:**

> "Throughout the conversation Smudge periodically checks his understanding through reflection. Rather than immediately advising, Smudge pauses and asks: 'Can I tell you what I'm hearing?'"

**Experience Blueprint Chapter 4 — From Scepticism to Trust:**

> "The Reflection Moment marks the point where Smudge pauses to confirm understanding before moving forward."

### Traceability Verdict: ALREADY GOVERNED

The topic closure mechanism is explicitly defined in CBR §2 and validated in Exercise LENS 2. The Reflection Moment (Chapter 2) provides the macro-level closure (confirming the whole picture), while the checkpoint patterns provide the micro-level closure (closing one topic before opening another).

### Doctrinal Gap Assessment

**No doctrinal gap.** The doctrine defines both macro-level closure (Reflection Moment) and micro-level closure (Topic Completion Checkpoints). The gap is implementation: the deployed smudgeOrchestrator's generation prompts may not include the checkpoint patterns for topic transitions.

### Minimum Design Intent Required

Same as Area 2 — mapping CBR §2 checkpoint patterns into the generation prompt. The prompt should instruct the LLM to:
- Use checkpoint patterns to close a topic before opening a new one
- Allow the user to expand or close the topic themselves
- Transition naturally rather than abruptly switching topics

---

## Area 4: Conductor Behaviour (balancing exploration with pace)

### OBS-001 Finding

> The conductor role requires knowing when to pause, when to reflect, when to go deeper, and when to move on. The conductor should feel like someone genuinely interested in the answer, not someone working through a checklist.

### Existing Doctrine

**Companion Behaviour Refinement v1.0 §3 — Conversational Momentum:**

> "Let questions chain naturally. Two or three questions on a related thread before any reflection. Vary the conversation shape. Not every exchange is question-answer."

Defines:
- Chain questioning: "You mentioned Dave going ape shit — what happened after that? And did the lad stick around after the exercise?"
- Observation-led questions: "You said it's 'second nature' — that's an interesting way to put it."
- Connection questions: "You said you wouldn't see anyone struggle. Is that the same thing that makes you follow procedures properly?"
- Anti-patterns: reflecting after every answer, asking unrelated questions without acknowledging, returning to topics the user moved on from

**Companion Behaviour Refinement v1.0 §6 — Natural Discovery:**

> "A conversation should never feel like data collection. Information should emerge naturally through curiosity. The six operational areas are covered, but the ORDER is dictated by the conversation, not the priority list."

Defines:
- Smudge is curious, not completing a checklist
- If a user covers two areas in one answer, don't go back and ask separately
- If a user volunteers information about an unexplored area, follow it
- The Companion Service's `next_area_to_explore` is a suggestion, not a script

**Experience Blueprint Chapter 6 §6.3 — Serve the Person, Not the Process:**

> "Smudge responds to the person's needs rather than following a predetermined sequence. The Behavioural Hierarchy provides guidance, not a script."

**Experience Blueprint Chapter 2 — Engineering Considerations:**

> "Engine invocation is reactive. Smudge invokes engines because the conversation requires them. The conversation should never exist simply to invoke an engine. The engines are tools available to Smudge. They are not a workflow that Smudge is pushed through."

**Experience Blueprint Chapter 7 — Architectural Guardrail:**

> "No implementation may allow stored state, workflow logic or engine output to autonomously determine Smudge's next response. Conversation state informs judgement. It never determines judgement."

**CBR v1.0 §1 — Reflection Pacing:**

> "Mini acknowledgements between answers. Not reflections. A reflection is a milestone event, not a response pattern."

**Exercise LENS 2 AAR:**

> "There was exactly one full reflection — the Capability Picture at the end. Everything else was mini acknowledgements woven into the next question. No Q→Reflect→Q→Reflect pattern."

### Traceability Verdict: ALREADY GOVERNED

The conductor role is extensively defined:
- CBR §1 defines reflection pacing (milestones, not every response)
- CBR §3 defines conversational momentum (chain questioning, varied rhythm)
- CBR §6 defines natural discovery (curiosity, not checklist; order dictated by conversation)
- Experience Blueprint Chapter 6 defines "Serve the Person, Not the Process"
- Experience Blueprint Chapter 7 defines the architectural guardrail (conversation state informs, never determines)
- Exercise LENS 2 validated all of these in live conversation

### Doctrinal Gap Assessment

**No doctrinal gap.** The doctrine comprehensively defines conductor behaviour: when to reflect (milestones only), when to chain questions (naturally, 2-3 on a thread), when to move on (when area has substance), and how to maintain momentum (varied rhythm, not Q→Reflect→Q→Reflect). The gap is implementation: the deployed smudgeOrchestrator's generation prompts may not include these patterns.

### Minimum Design Intent Required

A mapping of CBR §1, §3, and §6 into the smudgeOrchestrator's generation prompt instructions. The prompt should instruct the LLM to:
- Use mini acknowledgements between answers, not full reflections
- Reserve reflections for milestones (significant disclosure, connecting themes, before transitions, presenting pictures)
- Chain 2-3 questions on a related thread before any reflection
- Vary conversation rhythm (short exchanges, longer explorations, brief reflections)
- Follow the user's lead on topic order, not the engine's priority list
- Treat `next_area_to_explore` as a suggestion, not a script

---

## Summary Table

| OBS-001 Area | Primary Doctrine | Status | Doctrinal Gap | Implementation Gap |
|---|---|---|---|---|
| Voice | CBR v1.0 §4 + EB Ch.1 | ALREADY GOVERNED | Minor observation (cross-phase consistency) — for Cipher review | Generation prompts may not reflect approved voice characteristics |
| Conversational Sufficiency | CBR v1.0 §2 + EB Ch.6 §6.5 | ALREADY GOVERNED | None | Generation prompts may not include checkpoint patterns and sufficiency signals |
| Topic Closure | CBR v1.0 §2 + EB Ch.2 | ALREADY GOVERNED | None | Generation prompts may not include topic transition patterns |
| Conductor Behaviour | CBR v1.0 §1, §3, §6 + EB Ch.6, Ch.7 | ALREADY GOVERNED | None | Generation prompts may not include pacing, momentum, and natural discovery patterns |

---

## Key Finding

**OBS-001 is NOT a doctrinal gap. It is an implementation gap.**

All four observed behaviours are already governed by approved doctrine:
- Companion Behaviour Refinement v1.0 (approved by Paul & Cipher, 5 Jul 2026)
- Experience Blueprint Chapters 1-7 (locked)
- Validated by Exercise LENS 2 (6 Jul 2026)

The doctrine is clear, specific, and tested. The deployed smudgeOrchestrator's LLM generation prompts do not fully reflect the approved doctrine. This is the root cause of the OBS-001 observations.

---

## Minimum Behaviour Design Intent Required

**NOT new doctrine.** A Behaviour Design Intent document that maps the approved Companion Behaviour Refinement v1.0 into specific smudgeOrchestrator generation prompt requirements.

This document should:

1. **Map each CBR section to a specific prompt instruction** (e.g., CBR §4 → "Use varied sentence length, everyday vocabulary, avoid therapy-speak")
2. **Define the generation context** the orchestrator should provide to the LLM (e.g., current area substance state, user's recent answer length/tone, sufficiency signals)
3. **Not introduce any behaviour not already defined in approved doctrine**
4. **Not modify the deterministic engine layer** (engines remain unchanged)
5. **Not modify the companionCore lifecycle logic** (state machine remains unchanged)
6. **Respect the architectural guardrail** (conversation state informs judgement, never determines it)

The design intent should be submitted for three-view review (Ash, Paul, Cipher) before engineering authority is granted.

---

## Observation for Cipher's Review

**Cross-Phase Voice Consistency:**

The Companion Behaviour Refinement v1.0 was written for Phase 2-3 (discovery). The voice characteristics are defined for the discovery conversation. The Experience Blueprint defines behaviour for later phases (Chapter 3: Partnership, Chapter 5: Setbacks, Transition Partnership Doctrine: Phase 5), but does not explicitly address how the voice remains consistent while the role evolves.

Question for Cipher: Is the existing doctrine (CBR §4 voice characteristics + Commander Test + Experience Blueprint principles) sufficient to govern voice across all lifecycle phases, or does the cross-phase consistency requirement constitute a genuine doctrinal gap that requires a doctrine update?

This is an observation, not a recommendation. No action is taken without Cipher's review.

---

## Architectural Impact

**None.** This review does not propose any architectural changes. The implementation gap (generation prompt tuning) is within the existing smudgeOrchestrator architecture and does not require:
- New backend functions
- New entities or schema changes
- Changes to the deterministic engine layer
- Changes to the companionCore lifecycle logic
- Changes to the Chat.jsx frontend

The change is confined to the generation prompt instructions within smudgeOrchestrator's InvokeLLM call.

---

## Three-View Review Request

This document is returned for three-view review:

**Ash (Chief Engineer):** Confirms the traceability mapping is accurate and the implementation gap identification is correct. Confirms no architectural change is required.

**Paul (Product Owner):** Confirms the OBS-001 observations align with the existing approved doctrine. Confirms the minimum Behaviour Design Intent scope is appropriate. Authorises (or declines) the design intent phase.

**Cipher (Doctrine):** Reviews the doctrinal traceability. Confirms (or challenges) that all four OBS-001 areas are already governed. Addresses the cross-phase voice consistency observation. Grants (or withholds) engineering authority for the design intent phase.

---

**Ash — Chief Engineer**
**R1-C.1D-BR — 19 August 2026**
**One Mountain. Three Views. One Truth.**
