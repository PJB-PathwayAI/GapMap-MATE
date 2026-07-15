# GapMap MATE

**Mission:** Provide military personnel with a trusted companion that helps them understand their operational picture — capabilities, options, and next steps — throughout their transition journey.

**Commander's Intent:** MATE is not designed to accelerate transition. It is designed to improve the quality of transition decisions.

---

## Repository Architecture

This repository is structured in three layers. Future contributors should read top-down — understand why something exists before examining how it works.

### Layer 1 — Doctrine

**Why we believe something.** The philosophy, principles, and behavioural intent that guide every decision. These documents rarely change.

| Location | Contents | Status |
|---|---|---|
| [`Artefacts/`](./Artefacts/) | 10 foundational artefacts — pre-build doctrine that defined the product before engineering began | All LOCKED |
| [`Doctrine/`](./Doctrine/) | Philosophy that emerged *from* the build — Decision Readiness, Canonical User Questions | Evolving (deliberate) |

### Layer 2 — Design Intent

**How doctrine becomes engineering.** The bridge between philosophy and implementation. These evolve occasionally as doctrine matures or engineering reality requires adaptation.

| Location | Contents |
|---|---|
| [`Operations/`](./Operations/) | Phase design intents, companion behaviour refinement, consolidation report, reflections |

### Layer 3 — Engineering

**How the system currently works.** Schemas, functions, tests, and operational records. These evolve continuously.

| Location | Contents |
|---|---|
| [`entities/`](./entities/) | Entity schemas (UserProfile, OCIPathway) |
| [`functions/`](./functions/) | Deployed backend engines and services |
| [`Test-Results/`](./Test-Results/) | Exercise AARs and chronological index |

---

## Operation PROOF — Status

| Phase | Name | Status |
|---|---|---|
| 1 | Mobilisation | ✅ COMPLETE — Architecture v1.0 approved, UserProfile entity built |
| 2 | Understanding | ✅ COMPLETE — Understanding Engine v2.0 + Companion Service v1.2 deployed & behaviourally validated (Exercise MIRROR) |
| 3 | Capability Intelligence | ✅ COMPLETE — Capability Intelligence Engine deployed & validated (Exercise LENS, Exercise LENS 2). Closed 6 July 2026. |
| — | Consolidation Period | ✅ COMPLETE |
| 4 | Decision Readiness | ✅ COMPLETE — Decision Readiness Engine deployed & behaviourally validated (Exercise PRISM). Closed 14 July 2026. |
| 5 | Transition Partnership | ⏳ Not yet specified |
| 6 | Operational Validation | Planned |

### Engineering Components (current)

| Component | File | Status |
|---|---|---|
| Understanding Engine v2.0 | `functions/engineUnderstanding.ts` | ✅ Deployed, tested, behaviourally validated |
| Companion Service v1.2 | `functions/companionService.ts` | ✅ Deployed, tested, behaviourally validated (Companion Behaviour Refinement v1.0) |
| Capability Intelligence Engine | `functions/engineCapabilityIntelligence.ts` | ✅ Deployed, tested, behaviourally validated |
| Decision Readiness Engine | `functions/engineDecisionReadiness.ts` | ✅ Deployed, tested (6/6 unit tests), behaviourally validated (Exercise PRISM) |
| UserProfile Entity | `entities/UserProfile.json` | ✅ Schema extended for Phase Four |
| OCIPathway Entity | `entities/OCIPathway.json` | ✅ Created, 8 pathways seeded with structured provenance |

### Key Architectural Decisions (cumulative)

- **Deterministic engines + LLM companion:** Backend functions validate, persist, and manage state. Natural language generation, free-text interpretation, and conversational reasoning stay with Smudge (the LLM layer). This keeps engines auditable and conversation flexible.
- **Single source of truth:** All modules read/write to one UserProfile entity per individual.
- **Substance over checkboxes:** Discovery areas require genuine substance (≥15 chars) to count as "explored" — prevents checkbox-filling.
- **Confirmation is tied to current picture:** Correction during CONFIRMING revokes confirmation. Users must re-confirm the updated Operational Picture.
- **The Evidence Rule (hard gate):** No capability can be created without a traceable reference to evidence_log. This started as an engineering constraint and evolved into a behavioural principle — evidence-based conversation is how Smudge builds trust, not just how the engine validates data.
- **Conversational memory ≠ evidence provenance:** If Smudge references something from a prior session in conversation, it must be captured in that profile's evidence_log too — recollection alone isn't sufficient traceability. (Logged as doctrine following Exercise LENS 2.)
- **Soak Period is a distinct state machine:** Not a lifecycle phase. The soak state lives in `soak_period` on UserProfile, while `tos_phase` remains `EVALUATING` throughout. Single source of truth — soak state and lifecycle phase are decoupled by design.
- **OCI Pathways are curated, not generated:** Curated entity with structured provenance metadata on every record. Three confidence levels: Matched Direction / Possible Direction / Worth Exploring. Library starts small — quality over quantity.

### Companion Discovery Behaviour — Operationally Mature for MVP

Following Exercise LENS 2 (6 July 2026), Companion Discovery Behaviour is formally closed as mature for MVP. Future exercises validate *new* operational behaviours rather than reopening discovery behaviour, unless contradictory evidence emerges from live users.

### Companion Behaviour — Decision Readiness

Following Exercise PRISM (14 July 2026), Decision Readiness behaviour is validated for MVP. Two distinct user journeys are now recognised: Discovery (no clear direction) and Validation (preferred direction already identified). The companion adapts to the user's entry state rather than imposing a single pathway.

---

## Design Learning Progression

The cumulative behavioural doctrine that has emerged from testing, carried forward exercise to exercise:

| Exercise | Phase | Lesson | Result |
|---|---|---|---|
| Exercise MIRROR | Phase Two | Do not assume | ✅ PASS |
| Exercise LENS | Phase Three | Do not over-explain | ✅ PASS |
| Exercise LENS 2 | Phase Three | Do not interview — converse | ✅ PASS |
| Exercise PRISM | Phase Four | Support the user's journey — don't impose one | ✅ PASS |

See [`Test-Results/README.md`](./Test-Results/README.md) for the full chronological exercise index.

---

## Five Behavioural Principles (cumulative, all phases)

1. Understand before advising
2. Evidence before inference
3. Reveal capability — never invent it
4. Capability before recommendation
5. Readiness before action

---

## Architecture Reference

- **Smudge** (companion interface) → **OCI Companion Service** (orchestration + Operational Memory + safety gate) → **Specialist Engines** (Understanding / Capability Intelligence / Decision Readiness / Transition Partnership) → **UserProfile** (single entity, RLS-scoped)

Full architecture document: [`Operations/Phase-One-Architecture-Mobilisation.md`](./Operations/Phase-One-Architecture-Mobilisation.md)

See also [`Operations/README.md`](./Operations/README.md) for the full index of operational planning documents.

---

## Engineering Philosophy

Doctrine guides implementation. Implementation challenges doctrine. Both improve each other.

Engineering is an act of stewardship, not just software development.

---

## Pending: Operation PROOF Retrospective

A retrospective is planned to review everything from Exercise MIRROR through Exercise PRISM and extract the transferable methodology. Not started — deliberately deferred to allow a Soak Period, consistent with the project's own doctrine.

**Retrospective structure (agreed):**
1. What did we believe at the start?
2. What did reality teach us?
3. What doctrine changed because of that evidence?

**Hypothesis (Cipher):** Operation PROOF has quietly become a reusable engineering loop:

```
Doctrine → Design Intent → Engineering → Exercise → AAR → Behaviour Refinement → Doctrine
```

If that loop proves repeatable, Operation PROOF becomes a reusable methodology rather than a project-specific process.
