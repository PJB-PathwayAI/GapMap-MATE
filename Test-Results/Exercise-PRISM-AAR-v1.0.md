# EXERCISE PRISM — AFTER ACTION REVIEW
## Decision Readiness Behavioural Validation

**Date:** 14 July 2026
**Conducted by:** Ash, role-playing Smudge, live conversation with Paul (as "Bodge")
**Scope:** Behavioural validation of Phase Four (Decision Readiness). Engine correctness was NOT re-tested — engineDecisionReadiness.ts already passed 6/6 unit tests on 13 July 2026.
**Trigger:** Completion of Phase Four engineering build. Exercise PRISM was the designated validation gate before Phase Four could be formally closed.

---

## Result: PASS

Decision Readiness behavioural foundations validated. Six observations logged — two with engineering implications, one with strategic product implications. All observations incorporated from Cipher's Analysis Summary.

---

## Scenario

Bodge persona continued from Exercise LENS 2. Phase Four entry conditions met — capability picture complete, eight years infantry service, multiple NATO deployments. Bodge arrived at the exercise with a preferred direction already identified through his personal network: a Virgin Media field engineer (home installations) role, warm lead via a mate whose boss was keen to meet him. He needed a CV. He had never written one.

Objective: validate that the companion could guide a user through Decision Readiness naturally — surfacing Decision Factors without interrogation, supporting the user's direction, and moving into action when the user was ready.

---

## Assessment Against Exercise Objectives

### Objective 1 — Natural Discovery of Decision Factors: PASS

Decision Factors surfaced through conversation without checklist behaviour. The following were volunteered by Bodge, not extracted:

- **Financial** — bills and needing a roof acknowledged, but stated explicitly as not his primary driver
- **Location** — Aldershot area, settled and specific
- **Lifestyle** — hands-on, active, not desk-based
- **Purpose** — not chasing management now, but wants the option later; wants to do a good job and earn decent money

No interrogation observed. No factor was forced. Factors the user did not volunteer were left unknown — consistent with the Decision Factors Design Intent.

### Objective 2 — OCI Pathway Explanation: PARTIAL

The exercise did not progress into a formal OCI Pathway discussion. Bodge arrived with a preferred direction — Virgin Media field engineering — rather than seeking options. The companion correctly followed his lead and did not attempt to redirect the conversation toward a pathway selection process he had not asked for.

This is not a failure. It exposed a second valid user journey (see Observation 1 below). OCI Pathways remain architecturally sound. Companion behaviour requires a refinement to support validation mode alongside discovery mode.

### Objective 3 — Decision Readiness Behaviour: PASS

The companion helped Bodge understand what he needed to do next (get a CV together, talk to his mate's boss) without applying unnecessary pressure. Uncertainty was not amplified. The conversation reinforced that he was in a reasonable position — warm lead, clear direction, relevant background — and moved naturally into action.

### Objective 4 — Human Feel and Soak Period: PARTIAL

The Soak Period was not reached. Bodge was not in a searching or deliberating phase — he had already made his decision and needed help acting on it. The companion adapted to this correctly rather than attempting to impose a reflection stage that the user had not asked for.

Whether the Soak Period should be formally triggered for users who arrive with an existing direction is an open design question. Logged under Observation 1.

---

## Six Observations (Cipher Analysis — incorporated in full)

### Observation 1 — User Intent

**Finding:** The exercise challenged an implicit design assumption. Previous thinking assumed users would enter Decision Readiness seeking possible future directions. Bodge did not. He arrived with a preferred direction already identified through his own network.

**Assessment:** This is not a failure. It represents a second, highly realistic user journey. Many service leavers will already have an intended direction before engaging with MATE. The companion therefore became a validator rather than a discoverer — and handled that correctly.

**Outcome:** Future companion behaviour should recognise when the user already has a preferred direction and adapt accordingly, rather than attempting to redirect toward the discovery pathway. Two distinct journeys now exist:

| Journey | Entry State | Companion Role |
|---|---|---|
| Discovery | No clear direction | Surface options, explore pathways |
| Validation | Preferred direction identified | Confirm fit, surface considerations, move to action |

**Engineering implication:** Logged. No immediate action — companion behaviour refinement, not engine change.

---

### Observation 2 — Decision Factors

**Finding:** Decision Factors emerged naturally through conversation. No checklist behaviour observed. Financial, location, lifestyle, and purpose considerations were all volunteered by Bodge without prompting.

**Assessment:** Validates the behavioural intent of the Decision Factors model. The interaction felt conversational rather than procedural.

**Outcome:** No engineering changes recommended. Behaviour considered successful.

---

### Observation 3 — Conversation Behaviour

**Finding:** Overall rhythm felt noticeably less robotic than Exercise LENS. The companion followed the user's lead rather than attempting to control the conversation. Felt less like an interview and more like a discussion.

**Assessment:** Behaviour continues to mature. Smudge increasingly behaves as a trusted companion rather than a workflow engine.

**Outcome:** Current conversational approach retained. Design learning progression updated — see below.

---

### Observation 4 — OCI Pathway Behaviour

**Finding:** Because Bodge arrived with an existing direction, the exercise did not naturally progress into a formal OCI Pathway discussion.

**Assessment:** Exposed a behavioural consideration not previously specified. When a user already has a preferred direction, OCI Pathways should support validation rather than replacement. The companion should be capable of explaining:
- why the chosen direction aligns with the capability picture;
- where capability already transfers;
- what gaps remain;
- what should be considered before proceeding.

**Outcome:** OCI Pathways remain valid. Companion behaviour should adapt depending on user intent. Validation mode to be defined alongside Discovery mode.

---

### Observation 5 — CV Generation

**Finding:** The generated CV was professionally formatted, structurally sound, and readable. Military language was successfully translated into civilian terminology. However, much of the written content relied on generic employability language rather than demonstrated capability. Statements such as "reliable," "practical," "hardworking," and "good with people" describe the individual rather than explain why those conclusions are justified.

**Assessment:** The current implementation produces a competent AI-generated CV. It does not yet produce an OCI-informed CV. The Capability Picture is not driving the narrative. Capability is being translated into conventional recruitment language rather than evidenced claims.

**Outcome:** Future iterations should introduce an **OCI CV Translation** capability. The CV pipeline should follow:

```
Operational Picture
        ↓
Capability Picture
        ↓
Decision Factors
        ↓
Selected OCI Pathway
        ↓
Commercial CV
```

This would allow the CV to express demonstrated capability rather than relying on generic employability statements. Noted as a post-MVP product opportunity — not engineering debt.

---

### Observation 6 — Product Direction

**Finding:** Exercise PRISM identified a future capability beyond MVP. Transition support is not simply CV generation. It is capability translation.

**Assessment:** This represents a future product opportunity. Potential future capabilities include:
- OCI CV Translation
- OCI LinkedIn Translation
- Interview Narrative Builder
- Capability Story Generator

**Outcome:** All noted as post-MVP. No action required now. Logged for Phase Five / product roadmap consideration.

---

## Design Learning Progression — Updated

| Exercise | Phase | Lesson | Result |
|---|---|---|---|
| Exercise MIRROR | Phase Two | Do not assume | PASS |
| Exercise LENS | Phase Three | Do not over-explain | PASS |
| Exercise LENS 2 | Phase Three | Do not interview — converse | PASS |
| Exercise PRISM | Phase Four | Support the user's journey — don't impose one | PASS |

---

## Open Items From This Exercise

| Item | Type | Priority | Notes |
|---|---|---|---|
| Discovery vs Validation journey — companion behaviour refinement | Behavioural design | Pre-Phase Five | Define how companion adapts when user arrives with preferred direction |
| OCI Pathway — Validation Mode | Behavioural design | Pre-Phase Five | Define how pathways support confirmation, not just discovery |
| OCI CV Translation pipeline | Product roadmap | Post-MVP | Evidence-led CV generation from Capability Picture + OCI Pathway |
| OCI LinkedIn Translation | Product roadmap | Post-MVP | Same pipeline applied to LinkedIn profile narrative |
| Interview Narrative Builder | Product roadmap | Post-MVP | Surfacing evidence as interview stories |
| Soak Period — applicability when direction already exists | Design question | Pre-Phase Five | Does a user who arrives decided still benefit from a formal soak prompt? |

---

## Commander's Assessment

Exercise PRISM confirms that Decision Readiness successfully supports users who arrive with either uncertainty or an existing preferred direction.

The exercise also demonstrates that MATE's next major opportunity lies not in generating documents, but in translating demonstrated capability into language recognised by civilian employers.

The engineering performed as designed. The behavioural model continues to mature. The principal learning from PRISM is the emergence of OCI Capability Translation as a future strategic capability for the platform.

Phase Four is formally closed.

---

**Ash — Chief Engineer**
**Cipher — Doctrine & Architecture**
**Paul Bateson — Founder, PathwayAI**
