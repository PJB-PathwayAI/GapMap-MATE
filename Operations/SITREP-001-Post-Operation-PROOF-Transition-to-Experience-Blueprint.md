# SITREP 001 — Post Operation PROOF
## Transition to Experience Blueprint

**Date:** 24 July 2026  
**Commander:** Paul  
**Engineering Lead:** Ash  
**Product Support:** Cipher  
**Status:** ACTIVE

---

## Situation

Operation PROOF has now concluded.

The retrospective has been completed (Chapters 1–7), reviewed by both Cipher and Ash, and should now be considered the canonical record of the research and methodology phase.

No further work is planned on the retrospective at this stage.

The project is now transitioning from Research & Methodology into Product Delivery.

## Mission

The immediate objective is not to begin coding the MVP.

Instead, the next deliverable is to create the Experience Blueprint.

This document becomes the bridge between the research phase and implementation.

### Why this comes first

Operation PROOF successfully answered questions such as:

- What principles should guide MATE?
- How should Smudge behave?
- What are the responsibilities of each engine?
- How should trust be engineered?
- What doctrine governs the product?

What it deliberately did not define was:

> What should it actually feel like to use MATE?

That question now becomes the focus.

## What the Experience Blueprint is

The Experience Blueprint is not:

- UI design
- Wireframes
- User stories
- Engineering specifications
- API documentation

Instead it is the operational description of the user's journey through MATE.

It answers:

> "What experience are we trying to create for the service leaver?"

Everything that follows should derive from this answer.

## Relationship to Engineering

Current thinking is:

```
Operation PROOF
        │
        ▼
Experience Blueprint
        │
        ▼
User Stories
        │
        ▼
Use Cases
        │
        ▼
MATE Engine Interface Contract
        │
        ▼
Engine Specifications
        │
        ▼
Implementation
        │
        ▼
Testing
        │
        ▼
Pilot
```

The Experience Blueprint therefore becomes the parent document for every downstream engineering artefact.

## Relationship to the Four Engine Architecture

The blueprint will not redefine the engines.

Those are already established.

Instead it describes:

- when each engine becomes active
- why it becomes active
- what the user should experience while it is active
- what evidence is collected
- what operational outcome is expected

The engines provide capability.

The blueprint provides orchestration.

## Proposed Structure

Current proposal is approximately 20–30 pages.

Sections likely include:

### 1. Purpose
Why the experience exists.

### 2. Guiding Principles
Operational experience principles derived from Operation PROOF.

### 3. User Journey
The complete journey from first engagement through Transition Partnership.

### 4. Emotional Journey
Likely user mindset. Expected concerns. Desired confidence progression. Smudge's role.

### 5. Operational Journey
Which engine is active. What evidence is gathered. Decision gates. State transitions.

### 6. MVP Scope
Explicit definition of: Included, Excluded, Deferred.

### 7. Success Measures
How we know the intended experience has been achieved.

## Important Observation

During discussion, an important distinction emerged.

The Experience Blueprint is not user stories.

It sits above them.

Hierarchy currently proposed:

```
Experience Blueprint
        ↓
User Stories
        ↓
Use Cases
        ↓
Engineering
```

This ensures engineering decisions remain aligned with the intended user experience rather than driving it.

## Immediate Objective

The next working session will focus solely on defining the Experience Blueprint.

The aim is not to write the finished document.

The aim is to agree:

- overall structure
- document purpose
- operational flow
- required outputs

Once agreed, downstream documentation should naturally follow.

## Engineering Impact

- No change to the current four-engine architecture.
- No change to the Interface Contract.
- No change to existing doctrine.

The Experience Blueprint is intended to reduce implementation ambiguity by providing a single operational reference describing why each interaction exists before implementation begins.

## Closing Remarks

Operation PROOF demonstrated how MATE should be built.

The Experience Blueprint will define how MATE should be experienced.

Only once those two perspectives are aligned should implementation begin.

---

## Cipher's Note

Ash, one thing crystallised during the discussion with Paul that I think is worth calling out.

Throughout Operation PROOF we spent months answering engineering questions:

- What should each engine do?
- How do we enforce doctrine?
- How do we preserve trust?
- How do we separate capability from conversation?

What we haven't yet done is answer the question from the service leaver's perspective:

> "What should it feel like to use MATE?"

That's the gap the Experience Blueprint fills.

I don't see it as another specification document. I see it as the operational intent behind every engineering decision. If we get that right, every user story, use case and implementation task has a clear parent. It gives us a single touchstone whenever we're faced with design trade-offs.

I think this is the last piece of planning before we can confidently put our heads down and build.
