# Smudge Behavioural Refinement Finding — R1-C.1D-OBS-001

**Date:** 19 August 2026
**Source:** R1-C.1D Live Chat → Smudge Integration testing
**Status:** RECORDED — No implementation authorised
**Classification:** Behavioural Refinement Finding (Observation stage)

---

## Context

During R1-C.1D testing, the backend architecture was proven end-to-end through 6 API calls to the deployed smudgeOrchestrator. All lifecycle, persistence, confirmation, ownership, and error-handling tests passed. The architecture is unchanged and intact.

However, observation of Smudge's conversational behaviour across 4 natural turns identified a behavioural refinement requirement. This finding is recorded at the observation stage per the PROOF methodology (Doctrine → Design Intent → Engineering → Exercise → AAR → Behaviour Refinement → Doctrine). No implementation is authorised at this time.

## Finding

Smudge's conversational behaviour requires refinement in four interconnected areas:

### 1. Voice

Smudge's current voice is functional and warm, but may not yet carry the distinctiveness or consistency required for the companion relationship described in the Experience Blueprint. The voice should feel like the same person across every turn, every phase, and every emotional register — not just "polite AI assistant."

### 2. Conversational Sufficiency

Smudge does not yet have a clear sense of when a topic has been sufficiently explored. The current behaviour tends to acknowledge input and move to the next question, but does not signal when "enough" has been said on a topic to build genuine understanding. This risks the conversation feeling like a form with conversational styling rather than a genuine exchange.

### 3. Topic Closure

Related to conversational sufficiency — Smudge needs a natural mechanism for closing one topic before opening another. Without this, topics blur together and the user may not feel that their contribution to each area was genuinely received and understood before being asked about the next.

### 4. Conductor Behaviour

As the orchestrator of the conversation, Smudge needs to balance exploration with pace. The current behaviour asks one question per turn (correct), but the conductor role requires knowing when to pause, when to reflect, when to go deeper, and when to move on. The conductor should feel like someone who is genuinely interested in the answer, not someone working through a checklist.

## Evidence (from R1-C.1D testing)

| Turn | Response | Observation |
|---|---|---|
| T1 | "Eight years in the Royal Engineers sounds like a busy time... what are you focusing your attention on now?" | Acknowledges and pivots. Does not signal that the "Who are you?" area has been sufficiently explored. |
| T4 | "It sounds like you are still weighing your options... what drew you toward that field?" | Acknowledges and asks follow-up. Does not close the goals topic before continuing. |
| T6 | "I have been piecing together a bit of a picture... would you like to hear what I have gathered?" | Reflection Moment is natural. This is the strongest behaviour observed — Smudge pauses to reflect rather than continuing to extract. |
| T7 | "I appreciate you confirming... is there a particular area you would like to start exploring today?" | Acknowledges confirmation and opens next phase. Transition is clean but could feel more earned. |

## Assessment

This is NOT a failure. The architecture is proven and the behaviour is functional. This is a refinement finding — the difference between "works" and "feels right." The Experience Blueprint's promise is the latter.

Per the Pilot Readiness benchmark: *"Does it honour the promise we made in the Experience Blueprint?"* The architecture honours the promise. The behaviour needs to catch up.

## Next Steps (PROOF methodology)

1. **Observation** ← CURRENT
2. **Doctrine** — This finding should inform a behavioural doctrine update or a new design intent document addressing voice, conversational sufficiency, topic closure, and conductor behaviour
3. **Design Intent** — Define the desired behaviour with specific examples
4. **Engineering** — Implement changes in smudgeOrchestrator generation prompts and/or companionCore logic
5. **Exercise** — Test the refined behaviour
6. **AAR** — Review results

No step beyond Observation is authorised without Paul's direction and Cipher's doctrine review.

## Architecture Impact

None. This finding does not require architectural changes. The refinement is in the conversational/generation layer (Smudge's prompts and companionCore's orchestration logic), not in the deterministic engine layer or the data model.

## Related Documents

- Experience Blueprint Chapter 2: "Earning the Right to be Trusted" (Behavioural Hierarchy)
- Psychological Safety During Discovery v1.0
- R1-C.1D SITREP (this testing session)
- MATE Engine Interface Contract v0.1

---

**Recorded by:** Ash (Chief Engineer)
**Authorised by:** Paul (Product Owner) — observation stage only
**Pending:** Cipher doctrine review before any implementation
