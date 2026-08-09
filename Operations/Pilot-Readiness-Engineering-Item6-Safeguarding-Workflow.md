# Pilot Readiness — Engineering Item 6: Safeguarding Workflow

**Operation:** PILOT READINESS  
**Item:** 6 — Safeguarding Workflow  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Define how the GapMap MATE pilot handles safeguarding concerns. This is the engineering operationalisation of the Guardian Protocol (Issue #15, deferred post-MVP) for pilot use. The pilot cohort is small, known, and supported — but safeguarding must still be taken seriously.

---

## Context

### Guardian Protocol (Issue #15)

The Guardian Protocol was deferred during Operation BUILD as a post-MVP safeguarding feature. The `safety_flags` field exists on UserProfile but is not actively populated by any engine. This document defines how safeguarding works during the pilot without requiring the full Guardian Protocol implementation.

### Wellbeing Awareness

The Transition Partnership Engine includes a `wellbeing_awareness` field on TransitionJourney. This is an observation-only field — it records what a user has voluntarily shared, without diagnosis, scoring, or clinical interpretation. The field has two states: `NONE` (nothing noted) and `NOTED` (Smudge should be aware of this in conversation).

### Smudge's Doctrine Position

From the Experience Blueprint and doctrine:
- Smudge is not a clinician, counsellor, or crisis service
- Smudge does not diagnose, assess, or treat mental health
- Smudge listens, acknowledges, and refers to professional services when appropriate
- Psychological safety is a consideration, not a barrier (Chapter 2, Experience Blueprint)
- The individual's wellbeing is supported through the partnership, not through clinical intervention

---

## Pilot Safeguarding Model

### Layer 1: Conversational Awareness

Smudge's primary safeguarding tool is conversation. The Behavioural Hierarchy places Psychological Safety as the foundation — if the user doesn't feel safe, nothing else can be built on it.

During the pilot:
- Smudge listens for signals of distress (voluntarily shared)
- Smudge acknowledges what's shared without minimising or diagnosing
- Smudge does not ask probing questions about mental health
- If the user shares something significant, Smudge records it in `wellbeing_awareness` on TransitionJourney (if in Phase Five) or notes it conversationally (if earlier phases)

### Layer 2: Observation Recording

If a pilot participant voluntarily shares something that raises safeguarding concerns:

1. **In Phase Five (Transition Partnership):** Smudge records the observation in `wellbeing_awareness` on TransitionJourney:
   - `awareness`: "NOTED"
   - `observation`: What was voluntarily shared (Smudge's record, not a clinical assessment)
   - `date`: When the observation was made

2. **In earlier phases (Understanding, Capability, Decision):** There is no `wellbeing_awareness` field on UserProfile. Smudge records the observation in `safety_flags` on UserProfile:
   - `flag_type`: "WELLBEING_OBSERVATION"
   - `observation`: What was voluntarily shared
   - `date`: When the observation was made
   - `status`: "NOTED"

3. **In all phases:** Smudge should signpost the participant to professional support services.

### Layer 3: Signposting

Smudge's safeguarding response is to signpost, not to intervene. The following signposting should be available:

| Service | When to Signpost | Contact |
|---------|-----------------|---------|
| Samaritans | Any mention of suicidal thoughts or self-harm | 116 123 (24/7) |
| Combat Stress | Military-specific mental health concerns | 0800 138 1619 |
| SSAFA | Armed forces welfare and support | 0800 731 4880 |
| GP / NHS 111 | General health concerns | 111 (24/7) |
| Emergency Services | Immediate danger | 999 |

**Rule:** Smudge always signposts. Smudge never assesses, diagnoses, or decides whether someone needs help. The individual decides.

### Layer 4: Human Review

During the pilot, admin (Ash and Paul) can review `safety_flags` and `wellbeing_awareness` fields for any participant. This is not surveillance — it is a pilot safety net. The pilot cohort is small and known, and the support team has a duty of care.

**Review frequency:** Admin should review safety_flags weekly during the pilot, or immediately if a participant reports an issue.

**Action on review:**
- If a safety_flag or wellbeing_awareness observation is found, admin assesses whether to contact the participant directly (outside of MATE)
- If there is immediate risk, admin contacts emergency services
- All safeguarding actions are logged outside of MATE (e.g., in a separate case note)

---

## Safety Flags Schema

The `safety_flags` field on UserProfile is an array of objects. For the pilot, the following structure is used:

```json
{
  "flag_type": "WELLBEING_OBSERVATION",
  "observation": "What the user voluntarily shared",
  "date": "2026-08-09",
  "status": "NOTED",
  "action_taken": "Signposted to Samaritans"
}
```

**Flag types for pilot:**
- `WELLBEING_OBSERVATION` — user voluntarily shared something about their wellbeing
- `SAFEGUARDING_CONCERN` — admin observed something that raises concern
- `CRISIS_SIGNPOST` — user was signposted to crisis services

**Flag status:**
- `NOTED` — observation recorded, no action taken yet
- `REVIEWED` — admin has reviewed the flag
- `ACTIONED` — action has been taken (e.g., signposting, direct contact)

---

## What This Is Not

- This is not the Guardian Protocol (Issue #15). That remains a post-MVP feature.
- This is not automated safeguarding. All observations require human review.
- This is not clinical assessment. Smudge records observations, not diagnoses.
- This is not surveillance. Safety flags are only reviewed by admin, not automated.
- This is not a replacement for professional safeguarding procedures. If the pilot partner organisation has their own safeguarding policy, that takes precedence.

---

## Pilot Partner Safeguarding

If the pilot is conducted with a partner organisation (e.g., SSAFA, RBL), the partner's safeguarding policy takes precedence. MATE's safeguarding workflow is supplementary — it provides observation recording and signposting, but does not replace the partner's duty of care framework.

Any safeguarding concerns identified during the pilot should be shared with the partner organisation's safeguarding lead, subject to the participant's consent and the partner's safeguarding policy.

---

## Sign-off

This document defines the safeguarding workflow for the GapMap MATE pilot. It is a lightweight, human-reviewed model that operationalises the existing `safety_flags` and `wellbeing_awareness` fields without requiring the full Guardian Protocol implementation. Smudge's role is to listen, acknowledge, and signpost — never to assess or diagnose.

**Item 6 Status: ✅ COMPLETE**
