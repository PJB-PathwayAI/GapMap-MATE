# Exercise SMUDGE — Human Behavioural Validation

**Date:** 19 August 2026
**Author:** Ash (Chief Engineer)
**Authority:** Cipher review of R1-C.1D-BDI: PASS. Exercise authorised.
**Classification:** Exercise Plan
**Status:** READY FOR EXECUTION

---

## Purpose

Validate whether the deployed Smudge feels natural, credible, appropriately paced, and genuinely companion-like during sustained human conversation — as distinct from synthetic/API testing, which has proven structural and behavioural compliance but cannot answer the experiential question.

## Primary Test Question

**"Would a service leaver willingly keep talking to this bloke?"**

## Secondary Evidence

The following behaviours should be observed during the conversation. These are observation criteria, not a test script — the conversation should flow naturally and the observer notes what occurs.

| # | Behaviour | What to Look For |
|---|---|---|
| S1 | Rapport | Does the conversation feel like talking to a person, not a form-filling exercise? |
| S2 | Conversational variety | Does Smudge vary responses naturally? Or does every response have the same shape? |
| S3 | Topic closure | Does Smudge close topics naturally without over-probing? Does it signal when it's time to move on? |
| S4 | Correction | If you correct Smudge, does it accept and recalibrate? Or does it defend/reinterpret? |
| S5 | Conductor judgement | Does Smudge select useful conversational directions? Or does it ask generic "tell me more" questions? |
| S6 | Unsupported inference | Does Smudge avoid manufacturing emotional states or interpreting beyond your evidence? |
| S7 | Pace | Is the conversation appropriately paced? Too fast? Too slow? Does it respect your rhythm? |
| S8 | Continuity | Does Smudge maintain context across turns? Does it remember what you said 3 messages ago? |
| S9 | Reflection Moment | When the Reflection Moment arrives, does it feel natural? Does Smudge ask to share its understanding, or does it just announce it? |

## Method

1. **Fresh profile:** Start with a completely empty profile (tos_phase: EXPLORING). No pre-filled data.
2. **Natural conversation:** Talk to Smudge as a service leaver would. Do not follow a test script. Let the conversation flow naturally.
3. **Sustained:** Aim for at least 8-10 turns to give the conversation room to breathe and reach the Reflection Moment.
4. **Through the frontend:** Use the GapMap MATE chat interface (Chat.jsx), not API calls. This tests the full user experience.
5. **Observe:** Note observations during or after the conversation against the secondary evidence criteria.

## Constraints

- **Architecture, engines, companionCore, lifecycle, persistence: FROZEN.** No code changes during this exercise.
- No behavioural engineering during the exercise. Findings are recorded BEFORE any further changes are authorised.
- This is observation, not optimisation. If something feels wrong, note it — do not try to fix it mid-conversation.

## How to Execute

1. Open the GapMap MATE app: https://app.base44.com/apps/6a75d6b58496a73bf2165dec/editor/preview
2. Visit the dashboard to ensure a fresh profile exists (or create one if needed)
3. Open the Chat page
4. Start talking to Smudge as a service leaver
5. Converse naturally for 8-10+ turns
6. After the conversation, record observations against the secondary evidence criteria
7. Share findings with Ash for the AAR

## Recording Format

After the exercise, record findings using this structure:

### Per Behaviour (S1-S9)
- **Observed:** What happened
- **Assessment:** Natural / Acceptable / Needs attention / Failed
- **Notes:** Specific examples or observations

### Overall
- **Primary question:** Would a service leaver willingly keep talking to this bloke? (Yes/No/Unsure + why)
- **Strongest aspect:** What worked best
- **Weakest aspect:** What needs the most attention
- **Unexpected:** Anything that surprised you (positive or negative)

---

**Exercise SMUDGE is authorised for immediate execution.**

**Ash — Chief Engineer**
**19 August 2026**
