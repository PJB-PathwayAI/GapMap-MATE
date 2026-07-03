# Phase One — Mobilisation: Technical Architecture Document

> **Status:** ✅ APPROVED by Cipher & Paul — 3 July 2026
> **Version:** v1.0
> **Operation:** PROOF | **Phase:** One — Mobilisation
> **Author:** Ash (Chief Engineer)
> **Related:** Operation Order 001 (#13), Artefacts 1–10, Issue #2 (MVP Data Model)

---

## Purpose

This document defines the technical architecture for GapMap MATE ahead of any implementation. It exists to answer, in concrete engineering terms, the questions the doctrine raised but did not need to answer:

- How does the OCI Companion Service actually work?
- Where does Smudge sit in the system?
- What does Base44 own, and what do the specialist engines own?
- How is the single user profile structured?
- What is internal reasoning versus exposed API/function logic?
- How does the build rhythm operate day to day?

Per the Engineering Charter (Article II — Traceability), every architectural decision below is traceable to a specific doctrine artefact. Nothing here is invented for its own sake.

**Review note (v1.0):** This document was reviewed and approved by Cipher and Paul on 3 July 2026. Their observations are incorporated directly into the sections below (Operational Memory, Future Engine Registry, Phase One completion definition, and Non-Goals) rather than kept as a separate changelog — this is the living, current version of the architecture.

---

## 1. Architectural Principles (from Doctrine)

Before architecture, the constraints the doctrine already sets:

| Principle | Source | Architectural Consequence |
|---|---|---|
| Build for extension — single user profile as source of truth | Artefact 2 | One canonical `UserProfile` entity; every module reads/writes to it, none forks it |
| Clarity over complexity | Artefact 2 | Fewer, well-understood services over many clever ones |
| Understanding before guidance | Artefact 6, Op Order Phase 2 | Discovery must complete and persist before recommendation logic runs |
| Evidence before assumption | Artefact 10 | Every engine output must carry its supporting evidence, not just a conclusion |
| Human agency preserved | Artefact 4, Principle IV | No engine may auto-apply a decision; all outputs are recommendations surfaced to the user |
| The individual comes first | Artefact 4, Principle I | Data model and access design centre the user's ownership of their own data |
| MATE is a companion, not a chatbot | Artefact 3 | The interface is a structured workspace (profile + insight + action), not an open-ended chat log |
| Mission Commander coordinates specialist bias | Artefact 8 (TOS) | A single orchestration layer (OCI Companion Service) must sit between Smudge and any specialist engine — no engine talks to the user directly |

---

## 2. System Overview

Three layers, three distinct responsibilities:

```
┌─────────────────────────────────────────────────────────┐
│  SMUDGE — Companion Interface Layer                       │
│  Human partnership, conversation, guidance, trust          │
│  (Front-facing persona; no reasoning or memory lives here) │
└───────────────────────┬─────────────────────────────────┘
                         │
┌───────────────────────▼─────────────────────────────────┐
│  OCI COMPANION SERVICE — Orchestration, Reasoning & Memory │
│  Mission Commander (per TOS / Artefact 8)                   │
│  - Interprets user input                                    │
│  - Routes to the correct specialist engine(s)                │
│  - Balances/arbitrates engine outputs                        │
│  - Holds Operational Memory (Stable / Evolving / Session)     │
│  - Applies the Operational Safety Test (Artefact 4) before     │
│    any recommendation is allowed to surface                    │
│  - Owns situational awareness (what phase is this user in?)     │
└───────────────────────┬─────────────────────────────────┘
                         │
┌───────────────────────▼─────────────────────────────────┐
│  SPECIALIST ENGINES — Domain Reasoning                     │
│  Each engine owns ONE domain, has no direct user contact      │
│  Discoverable and orchestrated via a Future Engine Registry     │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐│
│  │Understanding│ │ Capability │ │  Decision  │ │Transition││
│  │  Engine    │ │Intelligence│ │  Support   │ │Partnership││
│  │ (Phase 2)  │ │  Engine    │ │  Engine    │ │  Engine   ││
│  │            │ │ (Phase 3)  │ │ (Phase 4)  │ │ (Phase 5) ││
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘│
│  Future: Wellbeing · Finance · CV · LinkedIn · Learning ·    │
│  Interview Prep (not built now — registry protects for later) │
└───────────────────────┬─────────────────────────────────┘
                         │
┌───────────────────────▼─────────────────────────────────┐
│  SINGLE USER PROFILE — Source of Truth (Base44 Entities)   │
│  Every engine reads/writes here. Nothing is forked.          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Smudge — Companion Interface Layer

**What it is:** The only layer the user ever directly experiences. Smudge has no reasoning of its own — it is the trusted voice that carries the OCI Companion Service's output to the user, and carries the user's input back.

**What it owns:**
- Conversational tone and framing (per Artefact 3 — Companion Definition, the Smudge Test™)
- Presentation of insight cards, suggestion chips, structured workspace UI (as shown in the mockups)
- Escalation language when Principle VII (Artefact 4) is triggered

**What it explicitly does NOT own:**
- Capability scoring logic
- Confidence calculations
- Pathway matching algorithms
- Any decision about what evidence is "enough"
- **Memory of any kind** — Smudge never remembers. It asks the OCI Companion Service, every time, "what do we know, and where are we?" and presents the answer. This keeps Smudge simple, replaceable, and purely a voice — never a place where continuity quietly lives and gets lost.

This separation matters: if Smudge's tone needs to change, we should never need to touch reasoning or memory logic. If reasoning logic changes, Smudge's voice shouldn't need to change either. This is the practical expression of Artefact 3's boundary between companion identity and system capability.

---

## 4. OCI Companion Service — Orchestration, Reasoning & Memory Layer

This is the Mission Commander described in the TOS (Artefact 8). In technical terms, it is a Base44 backend function layer (not a separate hosted service in v1 — see §7) responsible for:

1. **Situational awareness** — tracking which of the 7 TOS phases (Discover → Understand → Evaluate → Recommend → Enable → Reflect → Adapt) the user is currently in, stored against their profile.
2. **Routing** — deciding which specialist engine(s) a given user action should invoke.
3. **Arbitration** — where two engines produce conflicting signals (e.g. Capability Engine says "strong technical fit," Decision Support Engine flags a qualification gap), the OCI Companion Service resolves this into one coherent output rather than surfacing contradictions to the user.
4. **Operational Memory** (see §4a below) — the defined place where continuity of understanding lives.
5. **The Operational Safety Test gate** — per Artefact 4, before ANY significant recommendation reaches Smudge, the Companion Service must be able to answer yes to all five safety test questions. If not, the recommendation is held, refined, or escalated — never shown half-formed.
6. **Escalation detection** — flags to a human (Paul/Abi initially) when Principle VII conditions are met.

**Why this matters architecturally:** without this layer, every specialist engine would need to independently implement safety checks, tone, and escalation logic. Centralising it here means Artefact 4 is enforced in exactly one place — auditable, testable, and impossible to accidentally bypass.

### 4a. Operational Memory

Per Cipher and Paul's review, Operational Memory is a **foundational architectural capability of the OCI Companion Service from Phase One**, not something deferred until Phase Five's "Transition Partnership" work. Phase Five builds the *relationship* (milestones, check-ins, long-term trust); Phase One builds the *place where continuity lives* so nothing has to be retrofitted later.

Three categories, all held by the Companion Service — never by Smudge, never by an individual engine:

| Category | Contains | Volatility | Example Fields |
|---|---|---|---|
| **Stable Memory** | Facts that rarely change | Low | Service history, military trade, qualifications, permanent profile information |
| **Evolving Memory** | Understanding expected to develop | Medium | Goals, career interests, confidence, preferred pathways, readiness, personal priorities |
| **Session Memory** | Short-term operational context | High (session-scoped) | Current discussion thread, recent questions, outstanding actions, follow-up items |

Architecturally, these map directly onto the `UserProfile` entity structure (§6) — Stable and Evolving Memory are persisted fields on the profile; Session Memory is held in-request/short-lived state that the Companion Service reconciles back into Evolving Memory at the end of a session where relevant (e.g. a new stated goal moves from session context into `goals`).

**Rule:** Smudge never queries memory categories directly — it asks the Companion Service a question ("what should I say next?") and the Companion Service silently draws on whichever memory category is relevant to answer it.

---

## 5. Specialist Engines (Mapped to Op Order Phases)

Each engine is a discrete, testable unit of reasoning. In Base44 terms, each is one or more backend functions plus its own read/write scope on the user profile (never its own separate data store).

| Engine | Phase | Owns | Reads From Profile | Writes To Profile |
|---|---|---|---|---|
| **Understanding Engine** | Phase 2 | Discovery conversation logic, extracting military profile, service history, goals, personal context | Raw conversation input | `service_history`, `goals`, `personal_context` |
| **Capability Intelligence Engine** | Phase 3 | Skills translation, capability mapping, confidence scoring, evidence tagging | `service_history` | `capability_map`, `confidence_scores`, `evidence_log` |
| **Decision Support Engine** | Phase 4 | Pathway matching, qualification guidance, funding opportunities, role matching | `capability_map` | `recommended_pathways`, `action_plan` |
| **Transition Partnership Engine** | Phase 5 | Milestone tracking, check-ins, lifecycle stage progression (builds on the memory foundation already established in Phase One) | `recommended_pathways`, `action_plan` | `milestones`, `progress_log` |

Each engine is intentionally narrow. This is Artefact 2's "build for extension" in practice — a new engine can be added later without touching the others, because they only ever interact through the shared profile, never directly with each other.

### 5a. Future Engine Registry (Architectural Note — No Build Required in Phase One)

To protect the extensibility principle established in Artefact 2, the OCI Companion Service's routing logic (§4, point 2) should be designed as a **registry pattern** from the outset — i.e. "which engines exist and what do they handle" is a lookup, not hardcoded branching logic. This costs nothing extra to build now and avoids a rework later.

Future specialist engines anticipated (not built now, not scoped for Phase One or Operation PROOF's six phases — purely a placeholder for future operational learning):

- Wellbeing Engine
- Finance Engine
- CV Engine
- LinkedIn Engine
- Learning Engine
- Interview Preparation Engine

These remain ideas, not commitments, until operational evidence (Phase Six) tells us they're needed.

---

## 6. The Single User Profile — Data Model

One entity is the source of truth. Building on the six-entity MVP model already proposed in Issue #2 (User, Skills, Qualifications, Roles, Gaps, Pathways), the profile consolidates as follows for Phase One:

**`UserProfile`** (primary entity)

*Stable Memory fields:*
- `identity` — name, contact, service branch, rank, years served
- `service_history` — roles held, responsibilities, deployments (factual, non-sensitive)

*Evolving Memory fields:*
- `goals` — what the individual has told MATE they want
- `personal_context` — circumstances relevant to transition (only what's volunteered)
- `capability_map` — array of {skill, score, evidence, civilian_equivalent}
- `confidence_scores` — per-capability confidence rating + supporting evidence references
- `recommended_pathways` — array of {pathway, match_%, evidence[], status}
- `action_plan` — array of {step, due, status}
- `milestones` — array of {milestone, achieved_date, phase}

*Operational tracking fields:*
- `tos_phase` — current position in the 7-phase lifecycle (Discover/Understand/Evaluate/Recommend/Enable/Reflect/Adapt)
- `safety_flags` — any Principle VII escalation markers (internal only, never surfaced to user directly)

*(Session Memory is not persisted on the profile — it's transient, request-scoped context the Companion Service holds during an active conversation, per §4a.)*

Supporting entities (`Skills`, `Qualifications`, `Roles`, `Gaps`, `Pathways` from Issue #2) act as reference/lookup data that the engines match against — they are not per-user records, they're the shared knowledge base the engines draw on to populate the profile fields above.

**Row-Level Security:** `UserProfile` is RLS-scoped per user by default. Only the individual (and Paul/Abi in an admin capacity for support purposes) can see a given profile. This is the direct technical expression of Artefact 4 Principle I and Artefact 9 (the individual owns their data).

---

## 7. Base44 Ownership vs Specialist Engine Ownership

**What Base44 owns (platform-level, not our decision to re-architect):**
- Entity storage and schema (`UserProfile` + reference entities)
- Authentication and RLS enforcement
- Backend function hosting and execution
- File storage (for any documents/CVs uploaded)

**What the specialist engines own (our code, our logic):**
- All reasoning: translation, scoring, matching, pathway logic
- All prompt engineering / LLM calls for domain-specific reasoning
- Evidence attribution logic

**Important Phase One decision:** In v1, the "OCI Companion Service" and each "specialist engine" are **not separate hosted microservices** — they are Base44 backend functions (`.ts` files deployed via `deploy_backend_function`), organised by clear naming convention (e.g. `oci_orchestrator.ts`, `engine_understanding.ts`, `engine_capability.ts`) and called in sequence. This keeps the architecture modular in code structure without the operational overhead of managing separate services before we have evidence we need that complexity — directly in line with Artefact 10, Article V (Simplicity Is An Operational Advantage). If evidence later shows we need true service separation (e.g. performance, independent scaling), that's a Phase 6 (Operational Validation) decision, not a Phase 1 one.

---

## 8. Internal Reasoning vs Exposed API/Function Logic

| Layer | Exposed? | Access Pattern |
|---|---|---|
| Smudge conversation interface | **Yes** — frontend-facing | Direct user interaction via app UI |
| OCI Companion Service (orchestrator + memory) | **No** — internal only | Called only by Smudge's backend calls, never directly callable by frontend |
| Specialist engines | **No** — internal only | Called only by the OCI Companion Service, never directly by Smudge or frontend |
| `UserProfile` entity | **Partial** — read-only projections exposed to frontend for display; writes only via engine functions | Frontend reads via standard entity API (RLS-scoped); writes go through engine logic only, never direct entity writes from frontend, to guarantee the Safety Test gate can't be bypassed |

This means: a user (or a bug, or a bad actor) cannot directly write a `recommended_pathway` into their own profile and have it treated as real — it can only get there by passing through the Decision Support Engine and the OCI Companion Service's safety gate. This is the technical enforcement of Artefact 4 Principle VI (operational boundaries) and Principle III (evidence determines confidence).

---

## 9. Build Rhythm — In Practice

The Operation Order's battle rhythm (Mission Planning → Implementation → Review → Challenge → Refinement → Operational Evidence → Repeat) maps to our actual working cadence as follows:

| Stage | What Actually Happens |
|---|---|
| **Mission Planning** | Before each phase (2 through 6), Ash drafts a short technical plan for that phase's engine(s), same format as this document, scoped smaller |
| **Implementation** | Ash builds the entity/function increment in Base44, tests it in isolation |
| **Review** | Ash demos the working increment to Paul (and Cipher where doctrine interpretation is involved) |
| **Challenge** | Paul/Cipher raise where implementation doesn't match doctrine intent, or where doctrine proves impractical in reality |
| **Refinement** | Ash adjusts implementation (or, rarely, proposes a doctrine amendment if reality genuinely requires it — per Artefact 10 Article IV) |
| **Operational Evidence** | Once working, the increment is logged (GitHub issue closed/commented) with what was learned |
| **Repeat** | Next increment begins |

No phase begins broad-scale implementation without this document (or its phase-specific successor) being reviewed first.

---

## 10. Phase One Completion Criteria

Per Cipher and Paul's review: **this document enables Phase One — it does not close it.** Plans don't conclude mobilisation; readiness does.

Phase One concludes once:

- ✅ Engineering architecture approved *(this document — approved 3 July 2026)*
- ✅ Repository structure established *(PJB-PathwayAI/GapMap-MATE, live since Phase Zero)*
- ✅ Base44 project structure implemented *(entity + backend function conventions confirmed per §7)*
- ✅ `UserProfile` entity operational *(created and validated 3 July 2026 — read/write confirmed)*
- ✅ Engineering ready to commence Phase Two

**PHASE ONE COMPLETE — 3 July 2026. Phase Two (Understanding) is now active.**

---

## 11. Phase One Non-Goals

Recorded explicitly to protect focus, not because these are unimportant. These remain future considerations unless operational evidence (Phase Six) tells us otherwise:

- Voice
- Mobile app
- Avatars
- Gamification
- Analytics
- Notifications
- Multi-user collaboration

None of the above are in scope for Phase One, and raising them prematurely risks diluting the Mobilisation objective.

---

## Resolved Questions (from v0.1 Draft Review)

1. **Single `UserProfile` entity vs split entities** — Approved as single entity for Phase One simplicity (Artefact 10, Article V). Will split later if evidence shows scale requires it.
2. **Safety flag escalation timing** — Immediate notification to Paul/Abi for any `safety_flags` entry, not a batch digest. Escalation is a duty, not a batch job.
3. **Six reference entities from Issue #2** — Confirmed compatible with this architecture; no adjustment needed.

---

*Document Status: ✅ APPROVED v1.0 — 3 July 2026*
*Phase One: COMPLETE — 3 July 2026. Phase Two (Understanding) now active.*
