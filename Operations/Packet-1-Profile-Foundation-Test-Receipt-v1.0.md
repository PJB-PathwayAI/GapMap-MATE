# PathwayAI Products — GapMap MATE™ Op PROOF Test Receipt

## Packet 1 — Profile Foundation

| Field | Value |
|-------|-------|
| **Product** | GapMap MATE |
| **Programme** | Operation PROOF |
| **Workstream** | Post-Operation EXPERIENCE Engineering |
| **Packet** | 1 — Profile Foundation |
| **Receipt date** | 16 August 2026 |
| **Status** | PROVEN WITH ACCEPTED FINDINGS |
| **Product Owner** | Paul Bateson |
| **Experience / Doctrine** | Cipher |
| **Engineering** | Ash |

---

## Receipt Purpose

This document records the claims tested during Packet 1, the evidence obtained, what was proven or disproven, known limitations, and the engineering facts that may safely be relied upon in subsequent work.

It is intended to provide a timestamped baseline so that future engineering decisions do not depend upon recollection or assumption.

**Evidence hierarchy used:**

Assumption → Inspection → Behavioural Test → Regression → Consolidated Proof

Only findings reaching sufficient evidence are described below as PROVEN.

---

## 1. Why Packet 1 Existed

The post-Operation EXPERIENCE engineering review identified two significant foundation risks before the new experience could safely be connected to the MATE engines.

### S-001 — No reliable UserProfile creation path

The engines require a UserProfile, but the existing implementation did not provide a proven route by which a newly authenticated pilot user would automatically acquire one.

Without resolution, a new user could enter the experience successfully but subsequently fail when an engine attempted to retrieve a profile that did not exist.

### S-004 — UserProfile ownership boundary

The engines' privileged operations use Base44 service-role access.

Initial inspection raised the possibility that a caller supplying another user's profile_id could cause an engine to retrieve or modify that profile because service-role access bypasses normal RLS.

This required behavioural proof, not assumption.

---

## 2. Packet 1 Hypothesis

The Profile Foundation would be considered proven only if we could establish:

> One authenticated user can reliably obtain one persistent UserProfile, and every privileged MATE function establishes ownership of that profile before privileged processing or mutation occurs.

Packet 1 therefore tested two linked properties:

- **Identity persistence** — does the correct profile reliably exist?
- **Ownership enforcement** — can only its legitimate owner use it through the MATE engine chain?

---

## 3. Packet Structure

Packet 1 was deliberately decomposed into controlled proof movements.

No subsequent movement was authorised until evidence from the preceding movement had been reviewed.

---

## 4. Test Receipt — S-001 Profile Bootstrap

### Initial claim

A newly authenticated user requires a reliable mechanism for obtaining their UserProfile.

### Initial state

**DISPROVEN / MISSING.**

The original engineering inspection found no reliable automatic profile-creation path. Existing engines expected a profile_id; they did not create the underlying UserProfile. Bodge's existing profile had been manually established for testing and therefore did not prove the new-user journey.

### Implementation

A dedicated `profileBootstrap` function was introduced and connected to the authenticated entry path.

Its responsibility is deliberately narrow: Find the authenticated user's existing profile or create one when none exists. It does not perform transition analysis or engine work.

### Early test finding — duplicate creation

The first implementation used an incorrect Base44 SDK list-call format. Repeated execution created duplicate UserProfiles rather than discovering the existing record.

**Result:** Original bootstrap implementation: **DISPROVEN.**

This was caught during Packet 1 testing rather than pilot use. Four accidental duplicate profiles generated during this test were identified and removed with Product Owner approval. The lookup implementation was corrected to the established positional list convention.

### Corrected bootstrap proof

The corrected implementation was tested repeatedly. During the final Packet 1D consolidation:

| Call | profile_id | created |
|------|------------|---------|
| 1 | `6a75e45381981fe29f1b901f` | false |
| 2 | Same profile_id | false |
| 3 | Same profile_id | false |

**Profile count:** Before: 1 → After: 1

**Result: PROVEN**

The current `profileBootstrap` implementation is idempotent for the tested authenticated context. Repeated calls return the same profile and do not create duplicates.

---

## 5. Test Receipt — S-004 Ownership Boundary

### Original concern

The MATE functions perform privileged service-role writes. If their initial UserProfile lookup also bypassed RLS, possession of another user's profile_id could potentially allow unauthorised access or mutation.

### Required architecture

The intended security boundary became:

> User-scoped UserProfile read → RLS establishes ownership → privileged processing → service-role writes where legitimately required

The initial read therefore acts as the gate.

---

## 6. Understanding Engine Proof

**Function:** `engineUnderstanding`

A user-scoped `base44.entities.UserProfile.get(profile_id)` was behaviourally tested.

### Legitimate profile

Bodge's profile returned successfully. Result: 200 — **PASS**

### Foreign profile

A genuinely foreign service-role-owned UserProfile was created. A request containing mutation-capable discovery data was sent against that foreign profile_id. The initial user-scoped lookup failed. Foreign data was not returned. The attempted mutation did not occur.

### BEFORE / AFTER

Foreign profile state remained identical.

**Result: OWNERSHIP PROVEN**

---

## 7. Companion Service Proof

**Function:** `companionService`

The same ownership boundary was tested independently.

### Own profile

Authorised Bodge access succeeded.

### Foreign profile

RLS blocked the user-scoped lookup before privileged processing.

### Mutation proof

Foreign state remained unchanged.

**Result: OWNERSHIP PROVEN**

An important architectural fact was also confirmed during the wider engineering review: `companionService` is the Phase 2 / Understanding specialist, not the universal MATE engine. It accepts structured discoveries and returns session/flow state. It does not itself replace Capability Intelligence, Decision Readiness or Transition Partnership. The future orchestration layer must call those engines independently as lifecycle progression requires.

---

## 8. Capability Intelligence Proof

**Function:** `engineCapabilityIntelligence`

Inspection showed the user-scoped ownership change had already reached the deployed function. No unnecessary modification was therefore made.

### Own profile

`validate_preconditions` returned 200 with all Bodge preconditions met.

### Foreign mutation test

A state-changing `submit_capabilities` request was attempted containing synthetic `HACKED SKILL` data. RLS blocked the foreign profile during the initial read.

### BEFORE / AFTER

- `capability_map`: unchanged
- `confidence_scores`: unchanged
- `updated_date`: unchanged

No synthetic test data appeared.

**Result: OWNERSHIP PROVEN**

The Capability mutation path cannot be reached for the tested foreign profile without passing the ownership gate.

---

## 9. Decision Readiness Proof

**Function:** `engineDecisionReadiness`

The deployed function was already user-scoped.

### Own profile

`get_status` returned:
- `tos_phase`: EVALUATING
- soak state: COMPLETED
- 3 recommended pathways
- 3 expressed decision factors
- capability data recognised

Result: 200 — **PASS**

### Foreign mutation test

`record_decision_factor` was attempted using a valid evidence reference and a synthetic mutation marker. This was deliberately constructed so that the request would have been capable of changing state had ownership validation failed. The initial profile read was blocked.

### BEFORE / AFTER

- `decision_factors`: unchanged
- `recommended_pathways`: unchanged
- `soak_period`: unchanged
- `updated_date`: unchanged

**Result: OWNERSHIP PROVEN**

---

## 10. Transition Partnership Proof

**Function:** `engineTransitionPartnership`

This was the final and potentially most consequential ownership proof because this engine can create or modify transition journey state.

The foreign test profile was deliberately constructed to satisfy genuine `start_journey` preconditions, including the appropriate readiness state. This prevented a false-positive test where the request might have failed for an unrelated lifecycle reason.

### Own profile

Bodge's existing journey was retrieved normally.

### Foreign mutation test

A genuine journey-start attempt was made against the foreign profile. Had ownership enforcement failed, the operation was capable of:

- creating a TransitionJourney
- changing partnership state
- moving the profile into transition
- potentially creating downstream journey state

Instead, execution stopped at the ownership gate.

### AFTER

No foreign:
- TransitionJourney
- JourneyCheckpoint
- profile lifecycle mutation
- commitment
- milestone

was created.

**Result: OWNERSHIP PROVEN**

---

## 11. Five-Function Ownership Result

| Function | Ownership |
|----------|-----------|
| engineUnderstanding | PROVEN |
| companionService | PROVEN |
| engineCapabilityIntelligence | PROVEN |
| engineDecisionReadiness | PROVEN |
| engineTransitionPartnership | PROVEN |

**Consolidated result: 5 / 5 OWNERSHIP BOUNDARIES PROVEN**

No privileged mutation was demonstrated before successful ownership validation.

---

## 12. Full Authorised-Chain Regression

Packet 1D then tested Bodge through all five deployed functions using non-destructive or validation operations.

| Function | Result |
|----------|--------|
| Understanding | 200 |
| Companion Service | 200 |
| Capability Intelligence | 200 |
| Decision Readiness | 200 |
| Transition Partnership | 200 |

**Result: 5 / 5 PASS**

The ownership work did not prevent a legitimate user from traversing the existing engine chain. This is important: Packet 1 proved both sides of the boundary. Foreign users are rejected AND legitimate users continue to work.

---

## 13. Bodge Regression Receipt

Before and after Packet 1D, Bodge's established state was compared.

**Confirmed intact:**
- UserProfile
- operational picture
- capability map
- decision factors
- recommended pathways
- soak state
- TransitionJourney
- partnership state
- two commitments
- two milestones
- blocker state
- wellbeing state
- nine JourneyCheckpoints

**Checkpoint count:** Before: 9 → After: 9 (same checkpoint IDs)

**Result: BODGE REGRESSION — PASS**

No material product-state regression was identified.

---

## 14. New Knowledge Discovered During Testing

Packet 1 produced useful engineering knowledge beyond its original two objectives.

### NK-1 — Base44 RLS-blocked get() throws

A user-scoped Base44 entity `get()` against a foreign profile throws an SDK exception rather than simply returning null. This explains why a normal `if (!existing)` branch may never execute for an RLS-blocked record.

**Consequence:** Security works, but error semantics depend upon where the exception is caught.

### NK-2 — Ownership error responses are inconsistent

Observed foreign-profile responses:

| Engine | Response |
|--------|----------|
| Understanding | raw 500 |
| Companion Service | raw 500 |
| Capability Intelligence | raw 500 |
| Decision Readiness | structured 400 |
| Transition Partnership | structured 400 |

**Proven fact:** All five block the unauthorised operation.

**Not proven / not claimed:** The current responses are not considered normalised or ideal user-facing error behaviour.

**Decision:** Accepted finding. Deferred.

### NK-3 — Service role remains legitimate after ownership validation

Packet 1 did not establish that service-role access is inherently undesirable. Instead it established the correct boundary: Service-role writes can remain where required after the caller's ownership of the UserProfile has been established through the user-scoped read. This distinction should be preserved in future engineering reviews.

### NK-4 — updated_date does not necessarily mean meaningful state changed

During Packet 1D, an empty-discovery call through Understanding and/or Companion caused Bodge's platform-managed `updated_date` to advance despite no material product data changing.

**Proven interpretation:** `updated_date` currently indicates "the record was written" not necessarily "the user's transition understanding materially changed."

**Future consequence:** Do not use `updated_date` alone as evidence of meaningful user progression without further semantics.

### NK-5 — Builder behaves better with surgical changes

The initial attempt to change several existing backend functions in one Builder operation appeared not to apply reliably. A focused single-function/single-change instruction succeeded. Subsequent inspection revealed that some of the earlier batch changes had in fact propagated more widely than initially believed.

**Working rule:** For sensitive backend engineering: small instruction → deployed-state inspection → behavioural proof. Do not assume Builder's reported activity alone establishes deployed truth.

### NK-6 — Builder helper deployment can create duplicate test artefacts

Temporary service-role helper functions repeatedly generated an additional foreign test UserProfile during deployment/testing. These duplicates were identified and removed after each proof.

**Working rule:** After Builder-assisted test infrastructure: inventory → test → inventory again → explicitly clean artefacts → verify clean state.

### NK-7 — Builder deletion status is not sufficient evidence

On several occasions Builder reported an error while deletion was subsequently shown to have succeeded.

**Working rule:** A Builder success/error message is not itself proof of deployed state. Always verify the resulting function/entity inventory.

---

## 15. Claims Disproven During Packet 1

A Test Receipt should preserve failures too.

### DP-1

**Claim:** The initial bootstrap implementation safely reused the existing profile.

**DISPROVEN.** Incorrect SDK list syntax caused duplicate UserProfile creation. The implementation was corrected and subsequently proven idempotent.

### DP-2

**Claim:** The repository alone tells us what is currently deployed.

**DISPROVEN as a safe engineering assumption.** Repo inspection was useful, but deployed behaviour had to be tested independently.

### DP-3

**Claim:** A foreign profile read will simply return null and reach existing `if (!existing)` handling.

**DISPROVEN.** Base44 RLS caused the user-scoped SDK `get()` to throw.

### DP-4

**Claim:** A 500 response necessarily means the security control failed.

**DISPROVEN.** In three engines the 500 is the surfaced result of RLS successfully blocking the foreign UserProfile lookup. Security outcome and HTTP/error quality are separate concerns.

### DP-5

**Claim:** `updated_date` can be treated as proof of meaningful profile change.

**DISPROVEN.** An identical state can be persisted and advance the timestamp.

---

## 16. Final Environment at Packet Closure

Packet 1D verified:

| Item | Count |
|------|-------|
| Backend product functions | 6 |
| Temporary helper functions | 0 |
| UserProfiles | 1 (Bodge) |
| TransitionJourneys | 1 (Bodge) |
| JourneyCheckpoints | 9 (all Bodge's) |
| Foreign test profiles | 0 |
| Foreign test journeys | 0 |
| Known test debris | 0 |

**Product functions deployed:**
- `profileBootstrap`
- `engineUnderstanding`
- `companionService`
- `engineCapabilityIntelligence`
- `engineDecisionReadiness`
- `engineTransitionPartnership`

---

## 17. Accepted Findings Carried Forward

The following remain deliberately unresolved and must not later be mistaken for forgotten defects:

| ID | Finding | Status |
|----|---------|--------|
| AF-01 | Ownership error response normalisation (500/400 differs between engines) | Accepted, deferred |
| AF-02 | Empty-discovery persistence (Understanding/Companion may update `updated_date` despite no material change) | Accepted, deferred |
| AF-03 | Builder helper duplication behaviour (relevant to future test design, not product behaviour) | Accepted, deferred |
| AF-04 | Builder deployment/deletion status requires independent verification | Accepted, deferred |

**None prevents Contract Normalisation.**

---

## 18. What Future Work May Now Safely Assume

Unless subsequent evidence invalidates this receipt, future engineering may work from the following baseline:

1. An authenticated GapMap MATE user can obtain a persistent UserProfile.
2. Repeated bootstrap calls return the existing profile rather than creating duplicates.
3. All five MATE engine/service functions recognise Bodge's legitimate profile.
4. All five establish UserProfile ownership through a user-scoped read before privileged processing.
5. Foreign-profile mutation has been behaviourally disproven across all five functions tested.
6. Existing service-role writes occur behind the proven ownership boundary.
7. The established Bodge journey survived the Profile Foundation changes.
8. Packet 1 closed with no known test debris.

These statements are evidence-backed at 16 August 2026. They should not need to be re-proven during every subsequent packet unless later engineering modifies the relevant boundary.

---

## 19. What Packet 1 Does NOT Prove

To prevent evidence creep, this receipt does not claim that:

- the full new-user journey is integrated end-to-end
- Conversation currently orchestrates the engines
- Smudge can yet drive the transition lifecycle
- `tos_phase` contracts are consistent
- serialization contracts are consistent
- Journey Hub data is correctly sourced
- conversation persistence is production-ready
- error semantics are normalised
- cross-device Orientation persistence exists
- every possible security attack has been tested
- the complete pilot is production-ready

Those belong to later packets.

---

## 20. Final Test Receipt

| Claim | Verdict |
|-------|---------|
| S-001 — Profile Bootstrap | **PROVEN** |
| S-004 — Profile Ownership | **PROVEN** |
| Legitimate five-function access | **PROVEN — 5/5** |
| Foreign ownership rejection | **PROVEN — 5/5** |
| Foreign mutation prevention | **PROVEN — 5/5** |
| Bootstrap idempotency | **PROVEN** |
| Duplicate prevention after corrected implementation | **PROVEN** |
| Bodge regression | **PASS** |
| Test-environment cleanup | **PASS** |
| Accepted findings | 4 |
| Blocking findings | 0 |

---

## PACKET 1 FINAL VERDICT

### PROFILE FOUNDATION — PROVEN WITH ACCEPTED FINDINGS

**Evidence date:** 16 August 2026  
**Next authorised engineering concern:** Contract Normalisation  
**Packet 2 remains a separate evidence boundary.**

---

*Operation PROOF principle: We do not record what we intended to build. We record what the evidence says actually happened.*

*One Mountain. Three Views. One Truth.*
