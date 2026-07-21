# Phase Five Design Intent
## Transition Partnership — Maintaining Operational Continuity

**Version:** v1.0 (Draft)
**Date:** 21 July 2026
**Authors:** Paul Bateson (Founder), Cipher (Doctrine & Architecture Partner)
**Status:** DRAFT — Awaiting build authority
**Doctrine Reference:** `Doctrine/Transition-Partnership-Doctrine-v1.0.md`

---

## Purpose

The purpose of the Transition Partnership Engine is to maintain operational continuity throughout an individual's transition journey after a direction has been chosen.

Where previous phases build understanding, capability awareness and decision readiness, Transition Partnership ensures that progress continues despite the changing realities of civilian life.

The engine exists to help individuals sustain momentum until they have established themselves confidently beyond military service.

## Commander's Intent

A Transition Partner is not responsible for making decisions on behalf of the individual.

Its responsibility is to ensure that the individual never loses situational awareness of their transition, never feels abandoned by the process, and always understands their next meaningful step.

The desired end state is not continued engagement with MATE.

The desired end state is confident independence.

## Operational Responsibilities

The Transition Partnership Engine shall:

### Maintain continuity
Resume every conversation from the individual's current operational picture rather than restarting discovery.

### Maintain commitments
Record commitments voluntarily made by the individual and review progress during future conversations. Ownership always remains with the individual.

### Maintain situational awareness
Continuously understand:
- employment status
- applications
- interviews
- qualifications
- learning activity
- confidence
- wellbeing
- blockers
- changing priorities

The operational picture remains live throughout transition.

### Support adaptation
Recognise when reality has changed. Adjust recommendations without treating change as failure.

### Recognise successful completion
Detect when the individual has become operationally independent and conclude the partnership appropriately.

## The Engine Is NOT Responsible For

The Transition Partnership Engine shall never:
- make career decisions
- pressure individuals into action
- replace professional advisers
- provide legal advice
- provide financial advice
- provide medical advice
- provide mental health counselling
- replace recognised veteran support organisations
- encourage dependence upon MATE

The engine remains a trusted companion, never the owner of the user's transition.

## Five Architectural Pillars

### 1. Continuity
Every interaction begins where the previous interaction ended. Operational continuity is the defining behaviour of Phase Five. Without continuity there is no partnership.

### 2. Commitments
The partnership revolves around commitments chosen by the individual. Commitments are never imposed. Review is conversational rather than supervisory.

### 3. Progress
The engine understands movement over time. Progress is measured by sustained momentum rather than speed. Small achievements matter.

### 4. Adaptation
Plans are expected to evolve. Changing direction is evidence of learning, not failure. Recommendations must evolve alongside the individual.

### 5. Independence
Every interaction should increase the individual's confidence to continue without assistance. The partnership succeeds by making itself unnecessary.

## Behavioural Principles

**Partnership before Prescription** — Support. Never command.
**Progress before Perfection** — Momentum matters more than flawless execution.
**Accountability without Pressure** — Encourage reflection. Never generate guilt.
**Adaptation before Rigidity** — Reality changes. Plans should too.
**Presence before Intervention** — Sometimes remembering is more valuable than advising.

## Canonical Partnership Questions

Rather than discovering identity, the partnership explores progress. Typical conversations include:

1. How have things progressed since we last spoke?
2. What commitments have you completed?
3. What has changed?
4. What's proving more difficult than expected?
5. What has gone better than expected?
6. Do your priorities still feel the same?
7. Does your current direction still feel right?
8. What is the next meaningful step?
9. Is there anyone better placed to help with this?
10. How confident do you feel today compared to last time?

These questions are conversational prompts rather than mandatory interview steps.

## Operational Continuity Model

The Transition Partnership Engine maintains a living operational picture composed of:

- Current transition status
- Active commitments
- Progress history
- Confidence trend
- Wellbeing observations
- Significant milestones
- Current blockers
- Support interactions
- Referral history
- Operational readiness

Unlike earlier phases, this picture is expected to evolve continuously throughout the partnership.

## Handover Recognition

The Transition Partnership Engine must recognise situations beyond its operational remit. When appropriate it should facilitate transition to recognised organisations including:

- Career Transition Partnership (CTP)
- SSAFA
- Royal British Legion
- Combat Stress
- NHS
- Veterans UK
- specialist charities
- education providers
- legal or financial professionals

The partnership continues after referral. Referral is not abandonment.

## Partnership Lifecycle

The engine operates across five behavioural states:

| State | Description |
|---|---|
| **Active** | Regular engagement. Progress continues. |
| **Monitoring** | Progress is stable. Interaction frequency naturally reduces. |
| **Support Required** | Progress has stalled or confidence has significantly reduced. Additional guidance or referral may be appropriate. |
| **Referral** | Another organisation becomes operationally better placed to assist. Smudge remains a continuity partner where appropriate. |
| **Independent** | The individual consistently demonstrates confidence, stability and self-direction. The partnership concludes positively. |

## Success Criteria

The engine succeeds when individuals consistently report:

- *"I know what I'm doing next."*
- *"I understand how far I've come."*
- *"My plan evolves with my circumstances."*
- *"I don't feel like I'm facing transition alone."*
- *"I know where to go if I need additional help."*
- *"I no longer need regular support."*

## Engineering Principles

**Operational Memory is load-bearing** — Operational Memory is a core dependency of trusted partnership. Without continuity there is no partnership.

**Continuity over Conversation** — The engine preserves continuity, not merely conversational history.

**Commitments remain user-owned** — The engine records commitments. The individual owns them.

**Every conversation updates Operational Readiness** — Each interaction refreshes the operational picture. The partnership remains current.

**Independence is the success condition** — The objective is not engagement. The objective is successful transition.

## Relationship to OCI

Transition Partnership completes the Operational Capability Intelligence lifecycle.

| Phase | OCI Outcome |
|---|---|
| Understanding | Build the Operational Picture |
| Capability Intelligence | Build the Capability Picture |
| Decision Readiness | Build Decision Readiness |
| Transition Partnership | Maintain Operational Readiness |

Operational Capability Intelligence therefore exists throughout the entire lifecycle rather than being confined to capability discovery.

## Architecture Boundary (Engine vs Smudge)

The deterministic engine and LLM companion boundary is preserved:

- **Engine:** Knows what has changed and what the current operational state is. Manages state machine, validates transitions, persists data.
- **Smudge:** Decides how to discuss it. Handles conversation, judgement, tone, timing.

This separation has served every previous phase and is maintained in Phase Five.

## Commander's Closing Statement

The Transition Partnership Engine exists to maintain operational continuity throughout transition. It remembers where the individual has been, understands where they are today, and helps them continue moving forward until they no longer require its support.

## Chief's Assessment

This is the first Design Intent where the engineering responsibility is almost impossible to misunderstand. It's not "build reminders." It's not "build task management." It's not "build check-ins." The responsibility is singular: **Maintain Operational Continuity.** Everything else — memory, commitments, progress, adaptation, referrals, independence — is simply an expression of that responsibility.

This completes the conceptual architecture of the MATE MVP. Everything that follows from here should be engineering, validation and refinement rather than inventing entirely new philosophical foundations. That is a very satisfying place to reach.
