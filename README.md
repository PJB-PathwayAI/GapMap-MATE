# GapMap MATE

**Mission:** Provide military personnel with a trusted companion that helps them understand their operational picture — capabilities, options, and next steps — throughout their transition journey.

**Operational Phase:** Operation PROOF — Phase Two (Understanding) backend complete. Exercise MIRROR commenced.

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
| 2 | Understanding | ✅ BACKEND COMPLETE — Understanding Engine v2.0 + Companion Service v1.1 deployed |
| 3 | Evaluate (Capability Intelligence) | 🔜 NEXT |
| 4 | Recommend (Decision Support) | Planned |
| 5 | Enable (Transition Partnership) | Planned |
| 6 | Validate (Operational Validation) | Planned |

### Phase Two — Engineering Components

| Component | File | Status |
|---|---|---|
| Understanding Engine v2.0 | `functions/engineUnderstanding.ts` | ✅ Deployed & tested |
| Companion Service v1.1 | `functions/companionService.ts` | ✅ Deployed & tested |
| UserProfile Entity | `entities/UserProfile.json` | ✅ Schema includes 5 discovery fields |

### Phase Two — Key Architectural Decisions

- **Deterministic engines + LLM companion:** Backend functions validate, persist, and manage state. Natural language generation, free-text interpretation, and conversational reasoning stay with Smudge (the LLM layer). This keeps engines auditable and conversation flexible.
- **Single source of truth:** All modules read/write to one UserProfile entity per individual.
- **Substance over checkboxes:** Discovery areas require genuine substance (≥15 chars) to count as "explored" — prevents checkbox-filling.
- **Confirmation is tied to current picture:** Correction during CONFIRMING revokes confirmation. Users must re-confirm the updated Operational Picture.

### Exercise MIRROR — The Seventh Test

The live discovery conversation test. The one test that cannot be automated: whether a real person genuinely feels understood. Backend guarantees the doctrine; the conversation must earn the trust.

**Status:** COMMENCED

---

## Architecture Reference

- **Smudge** (companion interface) → **OCI Companion Service** (orchestration + Operational Memory + safety gate) → **Specialist Engines** (Understanding / Capability Intelligence / Decision Support / Transition Partnership) → **UserProfile** (single entity, RLS-scoped)

Full architecture document: `/Operations/Phase-One-Architecture-Mobilisation.md`

---

## Engineering Philosophy

Doctrine guides implementation. Implementation challenges doctrine. Both improve each other.

Engineering is an act of stewardship, not just software development.
