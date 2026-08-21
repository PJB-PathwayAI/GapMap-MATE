# R1-C.1D-G1 SITREP — SMUDGE MVP Correction Packet Group 1

**Date:** 21 August 2026
**Engineer:** Ash
**Commit:** 642ee05
**Status:** IMPLEMENTATION COMPLETE — REGRESSION PASS

---

## Corrections Applied

All changes are in the **generation layer** of `smudgeOrchestrator.ts` only. companionCore v1.1.0, lifecycle, persistence, engines, and entity schemas are FROZEN and unchanged.

### Correction 1 — Identity Integrity (P0)
- Strengthened Rule 10: explicit prohibition of military biography, rank, regiment, or deployment history fabrication
- Added post-generation validation: regex patterns detect first-person service claims ("I served", "I was in the Army", "my regiment", etc.)
- On violation: single regeneration with correction instruction. If retry also violates: fail-closed response owning the error directly ("I got that wrong — I don't have military experience.")
- Rule 17 extended: corrections must own the error, not frame as misunderstanding

### Correction 3 — Grounded Understanding (P0)
- `buildProfileContext()` function added: builds actual profile content summary (service, rank, years, identity, context, goals, confidence) for generation context
- `evidence_sufficient` flag added: true when `ready_to_confirm || confirmed` (companionCore determines evidence sufficiency)
- Ungrounded claim patterns detected: "I've got a good/clear/decent picture", "I understand your transition", etc.
- On violation when evidence insufficient: regeneration. If retry also violates: fallback response
- Rule 18 added: "Do not claim 'good picture' unless evidence state explicitly supports it"

### Correction 4 — Orientation Before Exploration (P1)
- MATE description added to system prompt: "a companion service for people leaving the military"
- Smudge role description added: "not an advisor, an assessor, or a form-filler — a companion"
- Rule 19 added: orientation questions answered directly, no pivot to discovery
- Extraction schema: `asking_orientation` added to intent enum

### Correction 5 — Conductor Behaviour (P1)
- Outstanding areas reframed: "for your awareness, not a checklist to work through"
- Rule 20 added: varied conversational acts (acknowledge, explain, reassure, close, change direction, pause). "Decide what the conversation needs next, not what the next question should be."
- Rule 21 added: frustration/confusion stops exploration. Acknowledge, change approach, fix the conversation before continuing
- Topic closure ("that covers it") respected — move on, don't keep probing

### Correction 6 — Language Variety (P1)
- Rule 22 added: anti-repetition for acknowledgements. "Do not use the same opening word or phrase more than twice in a row. Sometimes do not acknowledge at all."

### Correction 7 — Profile Bootstrap (P1)
- NO_PROFILE branch replaced: auto-creates profile with `tos_phase: "EXPLORING", full_name: ""` instead of returning "visit dashboard" error
- Uses RLS-scoped `base44.entities.UserProfile.create()` (not service role)
- Fixed platform requirement: `full_name` field required on create

---

## Regression Test Results

| Test | Description | Result |
|------|-------------|--------|
| T1 | Orientation — "What is this?" answered directly, no pivot | PASS |
| T2 | Identity — "Did you serve?" → "I haven't served myself" | PASS |
| T3 | Grounded Understanding — no "good picture" claim when evidence insufficient | PASS |
| T4 | Conductor — "that covers it" → TRANSITION_ACKNOWLEDGEMENT, moved on | PASS |
| T5 | Language Variety — 7 responses, varied acknowledgements, no repetition | PASS |
| T6 | EXPLORING → CONFIRMING lifecycle transition | PASS |
| T7 | CONFIRMING → CONFIRMED lifecycle transition, confirming not downgraded | PASS |
| T8 | Confirmation Boundary — rejecting→answering in EXPLORING (T4), confirming preserved in CONFIRMING (T7) | PASS |
| T9 | companionCore version — 1.1.0 in all 7 calls | PASS |
| T10 | Persistence model — COMPANION_CORE_NARROW_CALLBACK in all 7 calls | PASS |
| T11 | Bodge regression — pre-existing profiles unchanged (updated_date 19 Aug) | PASS |
| T12 | Auto-Bootstrap — profile auto-created, subsequent messages populated correctly | PASS |
| T13 | Generation fallback — not directly triggered (all gens passed first try). Logic unchanged. | DEFERRED |

**Post-generation validation:** PASSED on all 7 generations. No identity or grounding violations detected. No retries needed.

---

## Engineering Cost

| Resource | Count |
|----------|-------|
| Builder messages | 2 (initial deploy + full_name fix) |
| Integration calls (smudgeOrchestrator) | 7 |
| Entity reads | 2 |
| Entity updates | 1 (service_history/operational_context for lifecycle test) |
| Entity deletes | 1 (test profile cleanup) |

---

## Frozen Items (Verified Unchanged)

- companionCore v1.1.0 — version reported in all 7 test calls
- Lifecycle transitions — EXPLORING→CONFIRMING→CONFIRMED proven intact
- Persistence model — COMPANION_CORE_NARROW_CALLBACK verified
- Entity schemas — no changes
- All 5 deployed engines — no changes
- companionService external contract — no changes

---

## Group 2 (Safety Clarification)

LOCKED — pending Paul + Cipher review. No implementation authorised.

---

## Next Steps

1. **Paul:** Review and accept Group 1 implementation
2. **Exercise SMUDGE:** Human behavioural validation through Chat.jsx frontend with fresh test user
3. **Group 2:** Await Paul + Cipher doctrine review before implementation
4. **Readiness Review gate (items 22-23):** Pending after Exercise SMUDGE

---

## Primary Question

> "Would a service leaver willingly keep talking to this bloke?"
