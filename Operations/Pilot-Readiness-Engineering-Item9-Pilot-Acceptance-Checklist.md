# Pilot Readiness — Engineering Item 9: Pilot Acceptance Checklist

**Operation:** PILOT READINESS  
**Item:** 9 — Pilot Acceptance Checklist  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

The final engineering gate. This checklist confirms that all engineering workstream items are complete and the GapMap MATE MVP is ready to be placed in front of its first real service leaver. It is the engineering perspective's contribution to the Readiness Review (Item 22).

---

## Acceptance Criteria

### MVP Core Integrity

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1 | All five engines deployed and callable | Backend function deployment confirmed | ✅ |
| 2 | All four entities created with correct schemas | Entity schema verification (Item 7) | ✅ |
| 3 | RLS enabled on all user-scoped entities | Schema inspection | ✅ |
| 4 | MVP Core frozen at v1.0-build-baseline | GitHub tag exists | ✅ |
| 5 | No behavioural drift from PROOF doctrine | E2E revalidation (Exercise PRISM) | ✅ |
| 6 | No architectural drift from design intent | Companion Service adapter verified | ✅ |
| 7 | Evidence rule enforced | Engine validation confirmed | ✅ |
| 8 | Serialization adapters working across all engines | BUILD verification | ✅ |

### Pilot Readiness Items

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 9 | Test accounts & reset strategy defined | Item 3 — pilotAccountReset deployed | ✅ |
| 10 | Logging & diagnostics documented | Item 4 — three-layer model | ✅ |
| 11 | Data management & retention defined | Item 5 — GDPR-compliant strategy | ✅ |
| 12 | Safeguarding workflow defined | Item 6 — four-layer model | ✅ |
| 13 | Deployment checklist defined | Item 7 — pre/post-deployment steps | ✅ |
| 14 | Known issues register maintained | Item 8 — 10 issues documented | ✅ |

### Operational Readiness

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 15 | Fresh profile E2E can be executed | Deployment checklist Step 3 (Item 7) | ⬜ To verify on deployment day |
| 16 | Reset function can clear a profile | pilotAccountReset deployed | ⬜ To verify on deployment day |
| 17 | Backend function logs accessible | get_backend_function_logs available | ✅ |
| 18 | OCIPathways seeded (8+) | read_entities verification | ✅ |
| 19 | Bodge profile preserved as engineering baseline | Bodge preservation rule (Item 3) | ✅ |
| 20 | Rollback procedure documented | Item 7 — rollback to v1.0-build-baseline | ✅ |

### Doctrine Alignment

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 21 | Engine invocation is reactive, not prescriptive | Architecture verified during BUILD | ✅ |
| 22 | Smudge-as-companion philosophy maintained | No changes to companion behaviour | ✅ |
| 23 | Behavioural Hierarchy enforced through engine preconditions | All engines gate on prior phase | ✅ |
| 24 | Evidence before inference (no capability without evidence) | Evidence rule in Capability Intelligence Engine | ✅ |
| 25 | Readiness before action (no recommendation without readiness) | Soak period in Decision Readiness Engine | ✅ |

---

## Acceptance Statement

The engineering workstream has completed all seven assigned items (Items 3-9). The MVP Core is frozen, verified, and operationally ready. The remaining checks (Items 15-16) are deployment-day verifications that require the app to be in its final pilot configuration.

**Engineering workstream status: READY FOR READINESS REVIEW**

The engineering perspective confirms:

1. The architecture is sound — five engines, one journey, no drift
2. The pilot can be supported — reset, diagnostics, data management, and safeguarding are all defined
3. The MVP Core is frozen — v1.0-build-baseline is the reference
4. Known issues are documented — 10 issues, 2 pre-pilot actions (1 resolved), rest acceptable for pilot
5. The rollback procedure is clear — if something goes wrong, we can revert

**The engineering perspective's answer to the Commander's question:**

> "Would we be happy putting Bodge in front of this?"

**Yes.** The architecture has been proven through the happy path and through disruption (Exercise PRISM). The pilot support infrastructure is in place. Known issues are documented and acceptable. The MVP Core is frozen and ready.

---

## Sign-off

**Item 9 Status: ✅ COMPLETE**

**Engineering Workstream: ✅ READY FOR READINESS REVIEW (Item 22)**

---

*Ash — Chief Engineer, GapMap MATE*  
*9 August 2026*
