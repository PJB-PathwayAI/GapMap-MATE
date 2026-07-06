# GapMap MATE

**Mission:** Provide military personnel with a trusted companion that helps them understand their operational picture — capabilities, options, and next steps — throughout their transition journey.

**Operational Phase:** Operation PROOF — Phases One, Two & Three COMPLETE. Consolidation Period in progress ahead of Phase Four (Decision Support).

---

## Foundational Doctrine (COMPLETE — 10/10 Artefacts)

All 10 foundational artefacts approved, locked, and committed:

| # | Artefact | Status |
|---|---|---|
| 1 | OCI Alignment Statement | LOCKED |
| 2 | Product Principles (v1.1) | LOCKED |
| 3 | MATE Companion Definition | LOCKED |
| 4 | Operational Safety & Governance Framework — The Guardian | LOCKED |
| 5 | Capability Interpretation Engine | LOCKED |
| 6 | Decision Support Framework | LOCKED |
| 7 | Transition Lifecycle Framework | LOCKED |
| 8 | Transition Operating System (TOS) | LOCKED |
| 9 | Human Partnership Framework | LOCKED |
| 10 | Engineering Charter | LOCKED |

---

## Operation PROOF — Engineering Phases

| Phase | Name | Status |
|---|---|---|
| 1 | Mobilisation | ✅ COMPLETE — Architecture v1.0 approved, UserProfile entity built |
| 2 | Understanding | ✅ COMPLETE — Understanding Engine v2.0 + Companion Service v1.2 deployed & behaviourally validated (Exercise MIRROR) |
| 3 | Evaluate (Capability Intelligence) | ✅ COMPLETE — Capability Intelligence Engine deployed & validated (Exercise LENS, Exercise LENS 2). Closed 6 July 2026. |
| — | **Consolidation Period** | 🔄 **IN PROGRESS** — see [Operations/Consolidation-Report-v1.0.md](./Operations/Consolidation-Report-v1.0.md) |
| 4 | Recommend (Decision Support) | ⏳ Awaiting Design Intent from Paul & Cipher |
| 5 | Enable (Transition Partnership) | Planned |
| 6 | Validate (Operational Validation) | Planned |

### Engineering Components (current)

| Component | File | Status |
|---|---|---|
| Understanding Engine v2.0 | `functions/engineUnderstanding.ts` | ✅ Deployed, tested, behaviourally validated |
| Companion Service v1.2 | `functions/companionService.ts` | ✅ Deployed, tested, behaviourally validated (Companion Behaviour Refinement v1.0) |
| Capability Intelligence Engine | `functions/engineCapabilityIntelligence.ts` | ✅ Deployed, tested, behaviourally validated |
| UserProfile Entity | `entities/UserProfile.json` | ✅ Schema v1.1 — locked for MVP (5 July 2026) |

### Key Architectural Decisions (cumulative)

- **Deterministic engines + LLM companion:** Backend functions validate, persist, and manage state. Natural language generation, free-text interpretation, and conversational reasoning stay with Smudge (the LLM layer). This keeps engines auditable and conversation flexible.
- **Single source of truth:** All modules read/write to one UserProfile entity per individual.
- **Substance over checkboxes:** Discovery areas require genuine substance (≥15 chars) to count as "explored" — prevents checkbox-filling.
- **Confirmation is tied to current picture:** Correction during CONFIRMING revokes confirmation. Users must re-confirm the updated Operational Picture.
- **The Evidence Rule (hard gate):** No capability can be created without a traceable reference to evidence_log. This started as an engineering constraint and has evolved into a behavioural principle — evidence-based conversation is how Smudge builds trust, not just how the engine validates data.
- **Conversational memory ≠ evidence provenance:** If Smudge references something from a prior session in conversation, it must be captured in that profile's evidence_log too — recollection alone isn't sufficient traceability. (Logged as doctrine following Exercise LENS 2, not treated as a defect.)

### Companion Discovery Behaviour — Operationally Mature for MVP

Following Exercise LENS 2 (6 July 2026), Companion Discovery Behaviour is formally closed as mature for MVP. Future exercises validate *new* operational behaviours (Decision Support, Transition Partnership) rather than reopening discovery behaviour, unless contradictory evidence emerges from live users.

**Design learning progression:**
1. Exercise MIRROR — Do not assume.
2. Exercise LENS — Do not over-explain.
3. Exercise LENS 2 — Do not interview — converse.

See [Test-Results/README.md](./Test-Results/README.md) for the full chronological exercise index.

---

## Architecture Reference

- **Smudge** (companion interface) → **OCI Companion Service** (orchestration + Operational Memory + safety gate) → **Specialist Engines** (Understanding / Capability Intelligence / Decision Support / Transition Partnership) → **UserProfile** (single entity, RLS-scoped)

Full architecture document: [`Operations/Phase-One-Architecture-Mobilisation.md`](./Operations/Phase-One-Architecture-Mobilisation.md)

See also [`Operations/README.md`](./Operations/README.md) for the full index of operational planning documents, and [`Operations/Consolidation-Report-v1.0.md`](./Operations/Consolidation-Report-v1.0.md) for the current architecture-as-built, engineering debt review, and Decision Support extension points.

---

## Engineering Philosophy

Doctrine guides implementation. Implementation challenges doctrine. Both improve each other.

Engineering is an act of stewardship, not just software development.
