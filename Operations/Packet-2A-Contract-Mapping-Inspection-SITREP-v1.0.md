# PACKET 2A — CONTRACT MAPPING & NORMALISATION INSPECTION SITREP v1.0

**From:** Ash (Chief Engineer)  
**To:** Paul (Product Owner) + Cipher (Doctrine & Architecture)  
**Date:** 16 August 2026  
**Subject:** Contract mapping, lifecycle trace, serialization audit, proposed canonical contract  
**Status:** INSPECTION ONLY — no implementation authority  
**Classification:** Engineering Record  

---

## A. EXECUTIVE CONTRACT VERDICT

### CONTRACT BREAKS NATURAL ENGINE CHAIN

The MATE engine chain cannot progress from a fresh profile to transition partnership without manual intervention. Two distinct vocabulary systems coexist for `tos_phase`:

- **Early engines** (Understanding, Companion, Capability Intelligence) use internal terms: `Discover`, `Understand`, `Evaluate`
- **Late engines** (Decision Readiness, Transition Partnership) use schema enum values: `EVALUATING`, `READY_TO_ACT`, `IN_TRANSITION`, `SETTLED`

These vocabularies do not map to each other at any boundary. No adapter or translation function exists in any engine. The chain breaks at two points:

1. **Break 1:** profileBootstrap writes `EXPLORING` → engineUnderstanding checks for `Discover` → condition never matches → phase never advances
2. **Break 2:** engineCapabilityIntelligence writes `Evaluate` → engineDecisionReadiness checks for `EVALUATING` → string mismatch → engine rejects

Bodge's current `EVALUATING` state was achieved through manual intervention during testing, not through the natural engine chain.

Serialization is more stable than lifecycle: the Base44 SDK auto-parses JSON strings on read, so all engines function despite inconsistent serialization patterns. However, this is implicit SDK behavior, not engineered contract — four of six functions lack explicit deserialization adapters.

---

## B. AUTHORITATIVE SCHEMA CONTRACT

### UserProfile `tos_phase` — Authoritative Enum

Source: `entities/UserProfile.json` — schema definition

```
"tos_phase": {
  "enum": [
    "EXPLORING",
    "CONFIRMING",
    "CONFIRMED",
    "EVALUATING",
    "READY_TO_ACT",
    "IN_TRANSITION",
    "SETTLED"
  ],
  "type": "string"
}
```

### Structured Field Schema Types

| Field | Schema Type | Bootstrap Default |
|-------|-----------|-------------------|
| `evidence_log` | array | `"[]"` (JSON string) |
| `assessment_confidence` | **number** | `null` |
| `confidence_scores` | array | `"[]"` (JSON string) |
| `capability_map` | array | `"[]"` (JSON string) |
| `decision_factors` | object | `"{}"` (JSON string) |
| `recommended_pathways` | array | `"[]"` (JSON string) |
| `soak_period` | object | `'{"state": "NOT_STARTED"}'` (JSON string) |
| `operational_picture_history` | array | `"[]"` (JSON string) |
| `milestones` | array | `"[]"` (JSON string) |
| `safety_flags` | array | `"[]"` (JSON string) |
| `service_history` | array | `"[]"` (JSON string) |
| `goals` | **string** | `"[]"` (JSON string) |
| `operational_context` | **string** | `"[]"` (JSON string) |
| `communication_preferences` | object | `"{}"` (JSON string) |
| `action_plan` | string | `""` |

**Schema anomaly:** `assessment_confidence` is defined as `type: "number"` but is used to store a complex object `{ overall_score, rating, areas[] }`. This is a schema violation — the field was repurposed during engine development without updating the schema.

**Schema anomaly:** `goals` and `operational_context` are defined as `type: "string"` but are used as arrays throughout the engine chain. profileBootstrap writes them as JSON string representations of empty arrays (`"[]"`), and engines treat them as arrays after SDK auto-parsing.

---

## C. LIFECYCLE MAP

### Function-by-Function `tos_phase` Contract

---

### 1. profileBootstrap

| Aspect | Value |
|--------|-------|
| **Reads** | Does not read `tos_phase` |
| **Writes** | `"EXPLORING"` (matches schema enum ✅) |
| **Preconditions** | None — always creates with EXPLORING |
| **Translation** | None |
| **Failure** | N/A |

---

### 2. engineUnderstanding

| Aspect | Value |
|--------|-------|
| **Reads** | `existing.tos_phase` |
| **Checks** | `existing.tos_phase === 'Discover'` (line 269) — **NOT in schema enum** |
| | `existing.tos_phase === 'Understand'` (line 273) — **NOT in schema enum** |
| **Writes** | `'Understand'` (line 270) — **NOT in schema enum** |
| **Preconditions** | None on `tos_phase` — reads profile, processes discoveries, writes |
| **Translation** | None — no mapping between internal terms and schema enum |
| **Failure** | If `tos_phase` is `EXPLORING` (from profileBootstrap), the check for `'Discover'` fails silently. `newPhase` stays at `existing.tos_phase`. Phase never advances. No error returned — engine reports `phase_advanced: false` but returns 200. |

---

### 3. companionService

| Aspect | Value |
|--------|-------|
| **Reads** | `profile.tos_phase` |
| **Checks** | `profile.tos_phase === 'Discover'` (line 340) — **NOT in schema enum** |
| **Writes** | `'Understand'` (line 340) — **NOT in schema enum** |
| **Preconditions** | None on `tos_phase` |
| **Translation** | None |
| **Failure** | Same as engineUnderstanding — checks for `'Discover'` which is never written by profileBootstrap. Phase stays at whatever was read. Returns 200. |

---

### 4. engineCapabilityIntelligence

| Aspect | Value |
|--------|-------|
| **Reads** | `existing.tos_phase` (returned in response, no precondition check) |
| **Checks** | `existing.tos_phase === 'Evaluate'` (line 496, in `advance_phase` action) |
| **Writes** | `'Evaluate'` (lines 432, 504) — **NOT in schema enum** |
| **Preconditions** | No `tos_phase` precondition for `submit_capabilities`. Checks `operational_picture_confirmed`, `assessment_confidence`, `evidence_log` — but NOT `tos_phase`. |
| **Translation** | None |
| **Failure** | No `tos_phase` precondition means this engine will accept any phase value. It writes `'Evaluate'` on `submit_capabilities` and `advance_phase`. This value is NOT in the schema enum and will NOT be accepted by engineDecisionReadiness. |

---

### 5. engineDecisionReadiness

| Aspect | Value |
|--------|-------|
| **Reads** | `profile.tos_phase` |
| **Checks** | `['EVALUATING', 'READY_TO_ACT'].includes(profile.tos_phase)` (line 69) — **MATCHES schema enum ✅** |
| **Writes** | `'READY_TO_ACT'` (lines 388, 431) — **MATCHES schema enum ✅** |
| **Preconditions** | `tos_phase` must be `EVALUATING` or `READY_TO_ACT`. Also requires `Array.isArray(profile.capability_map)` and `capability_map.length > 0`. |
| **Translation** | None — uses schema enum values directly |
| **Failure** | If `tos_phase` is `'Evaluate'` (from engineCapabilityIntelligence), the check `['EVALUATING', 'READY_TO_ACT'].includes('Evaluate')` fails. Returns 400: `"Precondition failed: Decision Readiness Engine requires tos_phase EVALUATING or READY_TO_ACT. Current phase: Evaluate"`. **This is a hard chain break.** |

---

### 6. engineTransitionPartnership

| Aspect | Value |
|--------|-------|
| **Reads** | `profile.tos_phase` |
| **Checks** | `profile.tos_phase !== 'READY_TO_ACT'` (line 239) — **MATCHES schema enum ✅** |
| **Writes** | `'IN_TRANSITION'` (line 306) — **MATCHES schema enum ✅** |
| | `'SETTLED'` (lines 900, 992) — **MATCHES schema enum ✅** |
| **Preconditions** | `tos_phase === 'READY_TO_ACT'`, `soak_period.state === 'COMPLETED' or 'BYPASSED'`, `capability_map` populated, `recommended_pathways` populated |
| **Translation** | None — uses schema enum values directly |
| **Failure** | If `tos_phase` is not `READY_TO_ACT` (e.g., still `EVALUATING` because soak was never completed), returns 400. Normal precondition gating. |

---

### 7. pilotAccountReset

| Aspect | Value |
|--------|-------|
| **Reads** | Does not read `tos_phase` |
| **Writes** | `"EXPLORING"` (line 101) — **MATCHES schema enum ✅** |
| **Preconditions** | None |
| **Translation** | None |

---

### Lifecycle Vocabulary Summary

| Component | Vocabulary Used | Matches Schema? |
|-----------|-----------------|-----------------|
| profileBootstrap | `EXPLORING` | ✅ |
| engineUnderstanding | `Discover`, `Understand` | ❌ |
| companionService | `Discover`, `Understand` | ❌ |
| engineCapabilityIntelligence | `Evaluate` | ❌ |
| engineDecisionReadiness | `EVALUATING`, `READY_TO_ACT` | ✅ |
| engineTransitionPartnership | `READY_TO_ACT`, `IN_TRANSITION`, `SETTLED` | ✅ |
| pilotAccountReset | `EXPLORING` | ✅ |

**Schema enum values never written by any engine:** `CONFIRMING`, `CONFIRMED`

---

## D. NATURAL CHAIN TRACE

Starting from a fresh profile created by profileBootstrap:

```
1. profileBootstrap
   WRITES: tos_phase = "EXPLORING"
   STATE:  EXPLORING

2. engineUnderstanding (user provides discoveries, minimum understanding reached)
   CHECKS: existing.tos_phase === 'Discover'
   ACTUAL: "EXPLORING" !== "Discover"
   RESULT: Condition FALSE — newPhase stays "EXPLORING"
   WRITES: tos_phase = "EXPLORING" (unchanged)
   STATE:  EXPLORING
   ⛔ CHAIN BREAK #1: Phase never advances past EXPLORING

   [If manually set to "Discover":]
   WRITES: tos_phase = "Understand"
   STATE:  Understand (NOT in schema enum)

3. engineCapabilityIntelligence (capabilities submitted)
   NO tos_phase precondition
   WRITES: tos_phase = "Evaluate"
   STATE:  Evaluate (NOT in schema enum)

4. engineDecisionReadiness
   CHECKS: ['EVALUATING', 'READY_TO_ACT'].includes(profile.tos_phase)
   ACTUAL: "Evaluate" not in ['EVALUATING', 'READY_TO_ACT']
   RESULT: 400 — "Precondition failed: Decision Readiness Engine requires
           tos_phase EVALUATING or READY_TO_ACT. Current phase: Evaluate"
   ⛔ CHAIN BREAK #2: Engine rejects profile

   [If manually set to "EVALUATING":]
   STATE:  EVALUATING
   Soak period → SOAKING → COMPLETED
   WRITES: tos_phase = "READY_TO_ACT"
   STATE:  READY_TO_ACT

5. engineTransitionPartnership
   CHECKS: profile.tos_phase === 'READY_TO_ACT'
   RESULT: PASS
   WRITES: tos_phase = "IN_TRANSITION"
   STATE:  IN_TRANSITION

   [On conclusion:]
   WRITES: tos_phase = "SETTLED"
   STATE:  SETTLED
```

### Identified Failure Points

| Break | Location | Cause | Effect |
|-------|----------|-------|--------|
| #1 | profileBootstrap → engineUnderstanding | engineUnderstanding checks for `'Discover'`, profileBootstrap writes `'EXPLORING'` | Phase never advances. Engine returns 200 with `phase_advanced: false`. Silent failure. |
| #2 | engineCapabilityIntelligence → engineDecisionReadiness | engineCapabilityIntelligence writes `'Evaluate'`, engineDecisionReadiness checks for `'EVALUATING'` | Engine returns 400. Hard failure. Natural chain cannot reach Decision Readiness. |

### Missing Lifecycle States

The schema enum includes `CONFIRMING` and `CONFIRMED`, but no engine writes or checks for these values. They represent the Operational Picture confirmation phase (Understanding → Capability Intelligence), but no engine transitions the profile through them.

---

## E. SERIALIZATION MAP

### SDK Behavior Finding

**Critical context:** The Base44 SDK's `.get()` method auto-parses JSON strings into native values on read. The `.update()` method returns the persisted form (JSON strings). This was verified behaviourally:

- engineUnderstanding returned 200 (assessment logic using `.some()` on arrays — would throw TypeError on strings)
- The response body from `.update()` shows all structured fields as JSON strings (escaped)
- The `read_entities` platform tool returns raw stored values (JSON strings)

**Implication:** Four engines (Understanding, Capability Intelligence, Decision Readiness, Transition Partnership) rely on implicit SDK auto-parsing. Only companionService has explicit `deserializeProfile()` / `serializeForPersistence()` adapters.

---

### Field-by-Field Serialization

#### 1. `evidence_log`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string |
| **Writers** | engineUnderstanding (native array, no serialization), companionService (native array → `serializeForPersistence` → JSON string), engineCapabilityIntelligence (native array, no serialization) |
| **Readers** | engineCapabilityIntelligence (`existing.evidence_log || []` — assumes native), engineDecisionReadiness (`Array.isArray(profile.evidence_log)` — checks native) |
| **Assumptions** | engineDecisionReadiness uses `Array.isArray()` — returns `false` if SDK returns string. Currently works because SDK auto-parses. engineCapabilityIntelligence uses `.filter()` and `.some()` — would throw on string. |
| **Risk** | **C1** — If SDK stops auto-parsing, engineDecisionReadiness `Array.isArray()` check fails → `evidenceIndex` empty → all evidence_ref validation fails → all decision factors rejected. engineCapabilityIntelligence `.filter()` throws → 500. |

#### 2. `assessment_confidence`

| Aspect | Value |
|--------|-------|
| **Schema type** | number |
| **Stored form** | JSON string containing object `{ overall_score, rating, areas[] }` |
| **Writers** | engineUnderstanding (native object, no serialization), companionService (native object → `serializeForPersistence` → JSON string) |
| **Readers** | engineCapabilityIntelligence (`profile.assessment_confidence?.rating` — assumes native object), engineDecisionReadiness (not directly read — used in response only) |
| **Assumptions** | engineCapabilityIntelligence accesses `.rating` property — would be `undefined` on a string. |
| **Risk** | **C1** — Schema violation (number vs object). If SDK stops auto-parsing, `.rating` access returns `undefined` → preconditions always fail ("Assessment Confidence insufficient (current: none)"). Silent correctness risk. |

#### 3. `confidence_scores`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string |
| **Writers** | engineCapabilityIntelligence (native array, no serialization) |
| **Readers** | engineDecisionReadiness (not directly read in main flow — accessed via `capability_map` in `get_status`), companionService (`parseJSON` in `deserializeProfile`) |
| **Assumptions** | engineCapabilityIntelligence merges `existing.confidence_scores || []` — if SDK returns string, truthy string is used, merge logic may produce incorrect results |
| **Risk** | **C2** — Currently works via SDK auto-parsing. Inconsistency: `evidence_refs` (string) vs `evidence_ref` (string) naming within entries. |

#### 4. `capability_map`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string |
| **Writers** | engineCapabilityIntelligence (native array, no serialization) |
| **Readers** | engineDecisionReadiness (`Array.isArray(profile.capability_map)` — checks native), engineTransitionPartnership (`Array.isArray(profile.capability_map)` — checks native) |
| **Assumptions** | Both engines use `Array.isArray()` — returns `false` if SDK returns string |
| **Risk** | **C1** — If SDK stops auto-parsing, `Array.isArray()` returns false → engineDecisionReadiness rejects with "capability_map is empty" → chain breaks. engineTransitionPartnership rejects with "No capability map found". |

#### 5. `decision_factors`

| Aspect | Value |
|--------|-------|
| **Schema type** | object |
| **Stored form** | JSON string |
| **Writers** | engineDecisionReadiness (native object, no serialization) |
| **Readers** | engineDecisionReadiness (`profile.decision_factors || {}` — assumes native object, uses `Object.entries()`) |
| **Assumptions** | `Object.entries()` on a string would return character index entries — incorrect but non-throwing |
| **Risk** | **C1** — If SDK stops auto-parsing, `Object.entries(string)` returns `[['0', '{'], ['1', '"'], ...]` → `expressedFactors` computation produces garbage → silent incorrect results. No error thrown. |

#### 6. `recommended_pathways`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string |
| **Writers** | engineDecisionReadiness (native array, no serialization) |
| **Readers** | engineDecisionReadiness (`Array.isArray(profile.recommended_pathways)` — checks native), engineTransitionPartnership (`Array.isArray(profile.recommended_pathways)` — checks native) |
| **Assumptions** | `Array.isArray()` — returns `false` if SDK returns string |
| **Risk** | **C1** — If SDK stops auto-parsing, pathway count returns 0, pathway direction extraction fails → engineTransitionPartnership cannot determine `current_direction`. |

#### 7. `soak_period`

| Aspect | Value |
|--------|-------|
| **Schema type** | object |
| **Stored form** | JSON string |
| **Writers** | engineDecisionReadiness (native object, no serialization), profileBootstrap (JSON string `'{"state": "NOT_STARTED"}'`) |
| **Readers** | engineDecisionReadiness (`profile.soak_period?.state` — assumes native object) |
| **Assumptions** | `.soak_period?.state` on a string returns `undefined` → defaults to `'NOT_STARTED'` |
| **Risk** | **C1** — If SDK stops auto-parsing, soak state always reads as `NOT_STARTED` → soak transitions fail ("cannot initiate from NOT_STARTED" — but wait, it IS NOT_STARTED, so `initiate_soak` would succeed, then `complete_soak` would work... actually the issue is if soak was COMPLETED but reads back as NOT_STARTED, `complete_soak` would fail because `currentSoakState !== 'SOAKING'`). Silent state regression. |

#### 8. `goals`

| Aspect | Value |
|--------|-------|
| **Schema type** | string |
| **Stored form** | JSON string (array serialized as string) |
| **Writers** | engineUnderstanding (native array or fallback to existing), companionService (native array → `serializeForPersistence` → JSON string) |
| **Readers** | engineUnderstanding (`profile.goals || []` — uses `.length` and `.some()` via `hasArraySubstance`), companionService (`parseJSON` in `deserializeProfile`), engineCapabilityIntelligence (`profile.goals?.length` and `profile.goals.join()` — assumes native array) |
| **Assumptions** | `hasArraySubstance` calls `.some()` — would throw TypeError on string. `goals.join()` — strings have `.join()`? No, strings don't have `.join()`. Would throw. |
| **Risk** | **C1** — If SDK stops auto-parsing, `hasArraySubstance` throws TypeError → 500. `seedEvidenceFromProfile` calls `.join()` → TypeError → 500. |

#### 9. `operational_context`

| Aspect | Value |
|--------|-------|
| **Schema type** | string |
| **Stored form** | JSON string (array serialized as string) |
| **Writers** | engineUnderstanding (native array or fallback), companionService (native array → `serializeForPersistence` → JSON string) |
| **Readers** | engineUnderstanding (`hasArraySubstance` — uses `.some()`), companionService (`parseJSON`), engineCapabilityIntelligence (`profile.operational_context?.length > 0` and iterates with `for (const ctx of profile.operational_context)` — assumes native array) |
| **Assumptions** | `.some()` on string → TypeError. `for...of` on string → iterates characters → incorrect but non-throwing for `seedEvidenceFromProfile` |
| **Risk** | **C1** — If SDK stops auto-parsing, engineUnderstanding throws → 500. engineCapabilityIntelligence `seedEvidenceFromProfile` iterates characters → creates garbage evidence entries. |

#### 10. `service_history`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string |
| **Writers** | engineUnderstanding (native array or fallback), companionService (native array → `serializeForPersistence`) |
| **Readers** | engineUnderstanding (`hasArraySubstance` — uses `.some()`), companionService (`parseJSON`), engineCapabilityIntelligence (`profile.service_history?.length` and `.filter()` — assumes native array) |
| **Assumptions** | `.some()` and `.filter()` on string → `.filter()` does not exist on strings → TypeError |
| **Risk** | **C1** — If SDK stops auto-parsing, engineUnderstanding throws → 500. engineCapabilityIntelligence throws → 500. |

#### 11. `operational_picture_history`

| Aspect | Value |
|--------|-------|
| **Schema type** | array |
| **Stored form** | JSON string (`"[]"`) |
| **Writers** | profileBootstrap (`"[]"`), pilotAccountReset (`"[]"`) |
| **Readers** | None identified in engine chain |
| **Risk** | **C3** — No engine reads or writes this field during the MATE chain. Dormant. |

#### 12. `action_plan`

| Aspect | Value |
|--------|-------|
| **Schema type** | string |
| **Stored form** | String (`""`) |
| **Writers** | profileBootstrap (`""`), pilotAccountReset (`""`) |
| **Readers** | None identified in engine chain |
| **Risk** | **C3** — No engine reads or writes this field during the MATE chain. Dormant. |

---

## F. BODGE DATA-SHAPE AUDIT

From Packet 1D `read_entities` response (raw stored values):

| Field | Raw Stored Value | Stored Type | Parsed Type (SDK) | Engines Can Read? |
|-------|-----------------|-------------|-------------------|-------------------|
| `tos_phase` | `EVALUATING` | string | string | ✅ (manually set) |
| `goals` | `'["Get SIA licence and start working in close protection","Find stable accommodation in Aldershot area"]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `operational_context` | `'[{"description":"No dependents...","factor":"Family"},{"description":"Still processing...","factor":"Mental health"}]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `service_history` | (not captured in raw, but response shows JSON string) | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `evidence_log` | `'[{"evidence_id":"EV-001",...}]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `capability_map` | `'[{"skill":"Leadership",...}]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `confidence_scores` | `'[{"skill":"Leadership",...}]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `decision_factors` | `'{"financial":{...},"health_wellbeing":{...},"purpose":{...}}'` | JSON string | native object (SDK auto-parse) | ✅ via SDK |
| `recommended_pathways` | `'[{"pathway_id":"6a75e4fc..."},...]'` | JSON string | native array (SDK auto-parse) | ✅ via SDK |
| `soak_period` | `'{"state":"COMPLETED","initiated_date":"2026-08-07T14:17:38.965Z","completed_date":"2026-08-07T14:17:47.068Z",...}'` | JSON string | native object (SDK auto-parse) | ✅ via SDK |
| `assessment_confidence` | `'{"overall_score":91,"rating":"HIGH","areas":[...]}'` | JSON string | native object (SDK auto-parse) | ✅ via SDK |
| `user_confidence` | `'6'` | string | string | ✅ (engines handle as string) |

**Note:** `user_confidence` is stored as the string `'6'`, not the number `6`. The schema says `type: "number"`. This is a minor schema violation. Engines use `!== null && !== undefined` checks, which work for strings. But numeric comparisons like `profile.user_confidence < 4` (companionService line 260) would perform string comparison: `'6' < 4` → `false` (string '6' coerces to NaN in numeric context... actually, `'6' < 4` → `6 < 4` → `false` — JavaScript coerces string to number in comparison). So this works by accident.

**Note:** `assessment_confidence` schema says `type: "number"` but stores a JSON object — schema violation. Bodge's value: `{ overall_score: 91, rating: "HIGH", areas: [...] }`.

---

## G. SILENT FAILURE FINDINGS

### SF-1: Phase advancement never triggers (engineUnderstanding + companionService)

| Aspect | Detail |
|--------|--------|
| **Input** | Profile with `tos_phase: "EXPLORING"` (from profileBootstrap) |
| **Current behaviour** | engineUnderstanding checks `existing.tos_phase === 'Discover'` — false. `newPhase` stays `EXPLORING`. Engine returns 200 with `phase_advanced: false`. |
| **Expected behaviour** | Phase should advance when minimum understanding is reached. |
| **User/engine consequence** | Phase never advances. User stays in EXPLORING forever. Capability Intelligence, Decision Readiness, and Transition Partnership are all unreachable through the natural chain. |
| **S-003/S-007 relevance** | S-003 — lifecycle contract inconsistency. This is the primary chain break. |

### SF-2: `Object.entries()` on string `decision_factors` produces garbage

| Aspect | Detail |
|--------|--------|
| **Input** | `decision_factors` stored as JSON string `'{"financial":{...}}'` |
| **Current behaviour** | SDK auto-parses to native object → `Object.entries()` works correctly. |
| **If SDK stops auto-parsing** | `Object.entries('{"financial":...}')` returns `[['0', '{'], ['1', '"'], ...]` — character pairs. `.filter(([, v]) => v?.expressed === true)` — `'{'.expressed` is `undefined` → filter returns `[]`. No expressed factors. |
| **Expected behaviour** | Returns `['financial', 'health_wellbeing', 'purpose']` |
| **User/engine consequence** | Decision factors silently disappear. Pathway evaluation produces no factor-aligned notes. No error thrown. |
| **S-003/S-007 relevance** | S-007 — serialization inconsistency. Silent correctness risk. |

### SF-3: `user_confidence` stored as string, used in numeric comparison

| Aspect | Detail |
|--------|--------|
| **Input** | `user_confidence` stored as string `'6'` (schema says number) |
| **Current behaviour** | companionService: `profile.user_confidence < 4` → JavaScript coerces `'6'` to `6` → `6 < 4` → `false`. Works by accident. |
| **If value is `'0'`** | `'0' < 4` → `0 < 4` → `true`. Also works. |
| **If value is `null`** | `null < 4` → `0 < 4` → `true`. Low confidence note triggered for null confidence. Incorrect. |
| **User/engine consequence** | Currently works for Bodge's `'6'`. Edge cases (null, undefined) may produce incorrect low-confidence notes. |
| **S-003/S-007 relevance** | S-007 — type inconsistency (string vs number). |

### SF-4: `soak_period` reads as NOT_STARTED if SDK stops parsing

| Aspect | Detail |
|--------|--------|
| **Input** | `soak_period` stored as JSON string `'{"state":"COMPLETED",...}'` |
| **Current behaviour** | SDK auto-parses → `profile.soak_period?.state` → `'COMPLETED'`. Works. |
| **If SDK stops auto-parsing** | `profile.soak_period` is string → `string?.state` → `undefined` → defaults to `'NOT_STARTED'`. |
| **Expected behaviour** | Should read `'COMPLETED'` |
| **User/engine consequence** | Soak state regresses to NOT_STARTED. `initiate_soak` would succeed (NOT_STARTED → SOAKING), then `complete_soak` would succeed (SOAKING → COMPLETED). But if soak was already COMPLETED and user is at READY_TO_ACT, engineTransitionPartnership's soak check (`soak_period.state === 'COMPLETED' or 'BYPASSED'`) would fail → journey creation blocked. |
| **S-003/S-007 relevance** | S-007 — serialization inconsistency. Silent state regression. |

### SF-5: `assessment_confidence?.rating` returns undefined on string

| Aspect | Detail |
|--------|--------|
| **Input** | `assessment_confidence` stored as JSON string `'{"overall_score":91,"rating":"HIGH",...}'` |
| **Current behaviour** | SDK auto-parses → `profile.assessment_confidence?.rating` → `'HIGH'`. Works. |
| **If SDK stops auto-parsing** | `string?.rating` → `undefined`. engineCapabilityIntelligence: `assessmentRating = undefined` → `assessmentSufficient = false` → preconditions fail: "Assessment Confidence insufficient (current: none)". |
| **User/engine consequence** | Capability Intelligence becomes permanently inaccessible. |
| **S-003/S-007 relevance** | S-007 — serialization + schema violation (number vs object). |

---

## H. EXISTING ADAPTERS

### 1. `deserializeProfile()` — companionService only

| Aspect | Detail |
|--------|--------|
| **Location** | `companionService.ts`, lines 20–25 |
| **What it normalises** | 10 array fields + 4 object fields — parses JSON strings to native values |
| **Functions that use it** | `companionService` only |
| **Functions that do NOT use it** | `engineUnderstanding`, `engineCapabilityIntelligence`, `engineDecisionReadiness`, `engineTransitionPartnership`, `profileBootstrap`, `pilotAccountReset` |
| **Notes** | Defensive adapter — works whether SDK returns strings or native values. `parseJSON()` returns value as-is if not a string. |

### 2. `serializeForPersistence()` — companionService only

| Aspect | Detail |
|--------|--------|
| **Location** | `companionService.ts`, lines 10–17 |
| **What it normalises** | Converts all object/array values in a data object to JSON strings |
| **Functions that use it** | `companionService` only (line 347) |
| **Functions that do NOT use it** | All other engines write native objects/arrays directly to SDK |
| **Notes** | This means companionService persists JSON strings, while other engines persist native objects. The SDK converts both to the same stored form. |

### 3. No lifecycle translation adapter

| Aspect | Detail |
|--------|--------|
| **Status** | Does not exist |
| **Impact** | No function maps between internal engine terms (`Discover`, `Understand`, `Evaluate`) and schema enum values (`EXPLORING`, `CONFIRMING`, `CONFIRMED`, `EVALUATING`) |
| **Required** | This is the core S-003 gap |

---

## I. CONTRACT FINDINGS REGISTER

### CF-1 — `tos_phase` vocabulary mismatch (early engines)

| Field | Value |
|-------|-------|
| **ID** | CF-1 |
| **Classification** | **C0 — HARD CONTRACT BLOCKER** |
| **Issue** | engineUnderstanding and companionService check for `'Discover'` and write `'Understand'`. profileBootstrap writes `'EXPLORING'`. No engine writes `'Discover'`. The check never matches. Phase never advances. |
| **Evidence** | engineUnderstanding.ts:269 (`existing.tos_phase === 'Discover'`), companionService.ts:340 (`profile.tos_phase === 'Discover'`), profileBootstrap.ts:84 (`tos_phase: "EXPLORING"`), UserProfile schema enum does not include `Discover` or `Understand` |
| **Impact** | Natural chain cannot progress past EXPLORING. All downstream phases unreachable without manual intervention. |
| **Minimum correction** | Map `Discover → EXPLORING` and `Understand → CONFIRMING` (or `CONFIRMED`), OR change engineUnderstanding/companionService to check for `'EXPLORING'` and write `'CONFIRMING'`/`'CONFIRMED'`. |

### CF-2 — `tos_phase` vocabulary mismatch (Capability Intelligence → Decision Readiness)

| Field | Value |
|-------|-------|
| **ID** | CF-2 |
| **Classification** | **C0 — HARD CONTRACT BLOCKER** |
| **Issue** | engineCapabilityIntelligence writes `'Evaluate'`. engineDecisionReadiness checks for `'EVALUATING'`. String mismatch → 400 rejection. |
| **Evidence** | engineCapabilityIntelligence.ts:432 (`tos_phase: 'Evaluate'`), engineDecisionReadiness.ts:69 (`['EVALUATING', 'READY_TO_ACT'].includes(profile.tos_phase)`) |
| **Impact** | Decision Readiness Engine cannot be reached from Capability Intelligence through natural chain. |
| **Minimum correction** | Change engineCapabilityIntelligence to write `'EVALUATING'` instead of `'Evaluate'`, OR add a translation adapter. |

### CF-3 — `assessment_confidence` schema violation

| Field | Value |
|-------|-------|
| **ID** | CF-3 |
| **Classification** | **C1 — SILENT CORRECTNESS RISK** |
| **Issue** | Schema defines `assessment_confidence` as `type: "number"`. Engines write and read a complex object `{ overall_score, rating, areas[] }`. Schema violation. |
| **Evidence** | UserProfile.json: `assessment_confidence: { type: "number" }`. engineUnderstanding.ts:286 writes `assessment_confidence: { overall_score, rating, areas }`. Bodge stored value: `'{"overall_score":91,"rating":"HIGH",...}'` |
| **Impact** | If Base44 enforces schema types in future, engine writes would be rejected. Currently works because platform does not strictly enforce. |
| **Minimum correction** | Update schema to `type: "object"` with properties for `overall_score` (number), `rating` (string), `areas` (array). |

### CF-4 — `goals` and `operational_context` schema type mismatch

| Field | Value |
|-------|-------|
| **ID** | CF-4 |
| **Classification** | **C2 — CONSISTENCY / MAINTENANCE ISSUE** |
| **Issue** | Schema defines both as `type: "string"`. Engines treat them as arrays. SDK auto-parses the JSON strings. Works but creates confusion about whether these are strings or arrays. |
| **Evidence** | UserProfile.json: `goals: { type: "string" }`, `operational_context: { type: "string" }`. engineUnderstanding uses `hasArraySubstance(goals, 1)` which calls `.some()`. |
| **Impact** | No current functional impact (SDK auto-parses). Maintenance risk — new developers may not understand the dual nature. |
| **Minimum correction** | Update schema to `type: "array"` for both fields. |

### CF-5 — `user_confidence` stored as string, schema says number

| Field | Value |
|-------|-------|
| **ID** | CF-5 |
| **Classification** | **C2 — CONSISTENCY / MAINTENANCE ISSUE** |
| **Issue** | Schema says `type: "number"`. Bodge's value is stored as string `'6'`. Numeric comparisons work by coercion but are fragile. |
| **Evidence** | UserProfile.json: `user_confidence: { type: "number" }`. Bodge stored value: `'6'` (string). companionService.ts:260: `profile.user_confidence < 4`. |
| **Impact** | `null < 4` evaluates to `true` in JavaScript → low confidence note triggered for null. Edge case bug. |
| **Minimum correction** | Ensure all writers persist `user_confidence` as a number, not a string. |

### CF-6 — No deserialization adapter in 4 of 6 functions

| Field | Value |
|-------|-------|
| **ID** | CF-6 |
| **Classification** | **C1 — SILENT CORRECTNESS RISK** |
| **Issue** | Only companionService has `deserializeProfile()`. The other 4 engines rely on implicit SDK auto-parsing of JSON strings. |
| **Evidence** | companionService.ts:20–25 has `deserializeProfile()`. No other engine has any deserialization. SDK auto-parsing verified behaviourally (engineUnderstanding returns 200 despite stored JSON strings). |
| **Impact** | If Base44 SDK changes to stop auto-parsing, 4 engines break silently or with TypeErrors. companionService would continue working. |
| **Minimum correction** | Extract `deserializeProfile()` / `serializeForPersistence()` into a shared adapter used by all engines. |

### CF-7 — SDK version inconsistency

| Field | Value |
|-------|-------|
| **ID** | CF-7 |
| **Classification** | **C2 — CONSISTENCY / MAINTENANCE ISSUE** |
| **Issue** | Three engines use `@base44/sdk@0.8.25`, three functions use `@base44/sdk@0.8.31`. |
| **Evidence** | engineUnderstanding, engineCapabilityIntelligence, engineTransitionPartnership: `@0.8.25`. companionService, engineDecisionReadiness, profileBootstrap, pilotAccountReset: `@0.8.31`. |
| **Impact** | No current functional impact. Version drift creates risk of behavioural differences if SDK changes between versions. |
| **Minimum correction** | Align all functions to the same SDK version. |

### CF-8 — `confidence_scores` field naming inconsistency

| Field | Value |
|-------|-------|
| **ID** | CF-8 |
| **Classification** | **C2 — CONSISTENCY / MAINTENANCE ISSUE** |
| **Issue** | Each entry has both `evidence_ref` (string, single) and `evidence_refs` (string, comma-separated). Redundant and confusing. |
| **Evidence** | Bodge's data: `{"skill":"Leadership","confidence":50,"evidence_refs":"EV-001","evidence_ref":"EV-001"}`. Both contain the same value. engineDecisionReadiness.ts:189 checks `Array.isArray(cap.evidence_refs)` (always false — it's a string). |
| **Impact** | No current functional impact — both fields contain the same value. Maintenance risk and confusion. |
| **Minimum correction** | Standardise on one field name. |

### CF-9 — `CONFIRMING` and `CONFIRMED` never written

| Field | Value |
|-------|-------|
| **ID** | CF-9 |
| **Classification** | **C2 — CONSISTENCY / MAINTENANCE ISSUE** |
| **Issue** | Schema enum includes `CONFIRMING` and `CONFIRMED`, but no engine writes or checks for these values. |
| **Evidence** | Grep across all functions: no engine writes `'CONFIRMING'` or `'CONFIRMED'`. engineUnderstanding writes `'Understand'` (not in enum). |
| **Impact** | The Operational Picture confirmation phase has no lifecycle representation. The transition from understanding to capability is unmarked in `tos_phase`. |
| **Minimum correction** | Map the understanding confirmation to `CONFIRMING` → `CONFIRMED` in the lifecycle, or remove unused enum values. |

---

## J. PROPOSED CANONICAL CONTRACT

### A. Stored `tos_phase`

Use the existing schema enum values exactly as defined:

```
EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT → IN_TRANSITION → SETTLED
```

No engine should write a `tos_phase` value that is not in this enum.

### B. Engine-Internal Terms

Engines MAY continue using internal terms (`Discover`, `Understand`, `Evaluate`) in their logic, documentation, and comments — but **never as persisted `tos_phase` values**.

Translation should occur at the **write boundary** — the moment an engine writes `tos_phase` to the UserProfile.

Proposed mapping:

| Engine Internal Term | Persisted `tos_phase` |
|---------------------|---------------------|
| `Discover` | `EXPLORING` |
| `Understand` (minimum understanding reached) | `CONFIRMING` |
| `Understand` (operational picture confirmed) | `CONFIRMED` |
| `Evaluate` | `EVALUATING` |
| (n/a — Decision Readiness manages directly) | `READY_TO_ACT` |
| (n/a — Transition Partnership manages directly) | `IN_TRANSITION` |
| (n/a — Transition Partnership manages directly) | `SETTLED` |

### C. Structured Field Storage

**Recommendation: JSON strings (current pattern).**

Rationale:
- profileBootstrap and pilotAccountReset establish JSON string defaults
- The Base44 SDK stores native objects as JSON strings and auto-parses on read
- companionService's `serializeForPersistence` explicitly produces JSON strings
- Changing to native arrays/objects would require schema updates and testing all read/write paths
- JSON strings are the proven, working pattern

The contract should formalise: **all structured fields are persisted as JSON strings. All reads must deserialize.**

### D. Read Contract

Every engine MUST call `deserializeProfile(profile)` after reading from the SDK, before any field access.

The existing `deserializeProfile()` function from companionService should be extracted to a shared adapter.

### E. Write Contract

Every engine MUST call `serializeForPersistence(data)` before writing to the SDK.

The existing `serializeForPersistence()` function from companionService should be extracted to a shared adapter.

### F. Adapter Location

A single shared adapter module should be created, containing:
- `deserializeProfile(profile)` — parse JSON strings to native values
- `serializeForPersistence(data)` — convert native values to JSON strings
- `mapTosPhase(internalTerm)` — translate engine-internal terms to schema enum values (proposed)

All 6 functions should import and use this adapter. The adapter should be the single point of truth for serialization and lifecycle translation.

---

## K. PROPOSED PROOF DECOMPOSITION

The order's suggested structure is sound. I recommend one modification: combine lifecycle and serialization normalisation into a single implementation packet, because the adapter is the same code location.

### Packet 2B — Shared Adapter + Lifecycle Normalisation

Extract `deserializeProfile()`, `serializeForPersistence()`, and `mapTosPhase()` into a shared module. Update all 6 functions to use the shared adapter. Normalise `tos_phase` writes to schema enum values.

**Risk:** Touches all 6 functions. But changes are mechanical (import adapter, replace inline logic) and the adapter is already proven in companionService.

### Packet 2C — Lifecycle + Serialization Proof

Behavioural proof:
- Fresh profile E2E trace (EXPLORING → CONFIRMING → CONFIRMED → EVALUATING → READY_TO_ACT)
- Foreign-profile ownership regression (Packet 1 boundary preserved)
- Bodge regression (existing state intact after adapter introduction)
- Serialization proof (all fields read correctly through adapter)

### Packet 2D — Schema Correction

Update `assessment_confidence` from `type: "number"` to `type: "object"`. Update `goals` and `operational_context` from `type: "string"` to `type: "array"`. Ensure `user_confidence` is written as number.

**Risk:** Schema changes may affect Base44 validation. Must verify no data loss.

### Packet 2E — Schema Correction Proof

Verify all engines can read/write corrected schema fields. Bodge regression. Full chain trace.

### Packet 2F — Bodge Full-Chain Contract Regression

Run Bodge through the complete MATE chain using the normalised contracts. Verify natural progression from EXPLORING through to SETTLED (or as far as Bodge's state allows).

### Packet 2G — Packet 2 Consolidation / Test Receipt

Consolidate all evidence. Produce formal Test Receipt for Packet 2.

---

## L. DEVIATIONS / UNKNOWN

### D-1: SDK auto-parsing behaviour not documented

The finding that the Base44 SDK auto-parses JSON strings on `.get()` is inferred from behavioural evidence (engines return 200 despite stored JSON strings). This is not documented in Base44 platform docs. If the SDK behaviour changes, the consequences are described in the silent-failure analysis.

### D-2: `.update()` return form not verified

The finding that `.update()` returns JSON strings (while `.get()` returns native values) is inferred from the engineUnderstanding response showing escaped JSON strings. This was not independently verified with a controlled test.

### D-3: Journey Hub reads not inspected

The order mentions "Journey Hub reads, where relevant to serialization." No Journey Hub function was found in the deployed function inventory. If Journey Hub reads UserProfile data directly from the frontend, it would need its own deserialization logic, which was not inspected.

### D-4: `pilotAccountReset` uses service-role for profile read

pilotAccountReset uses `base44.asServiceRole.entities.UserProfile.list()` to find profiles, not user-scoped reads. This is expected for an admin reset function but is technically outside the Packet 1 ownership boundary. Not a Packet 2 concern but noted for completeness.

---

## M. PACKET 2A VERDICT

### PACKET 2A — COMPLETE WITH FINDINGS

**Evidence:**

1. **Lifecycle contract mapped:** All 7 functions inspected. Two C0 hard blockers identified (CF-1, CF-2). The natural engine chain breaks at two points due to vocabulary mismatch between early and late engines.

2. **Serialization contract mapped:** 12 structured fields audited. All stored as JSON strings. SDK auto-parsing makes this work, but 4 of 6 functions lack explicit deserialization adapters (CF-6). Schema violations identified (CF-3, CF-4, CF-5).

3. **Silent failures identified:** 5 cases documented (SF-1 through SF-5). The most critical is SF-1 — phase advancement silently never triggers.

4. **Existing adapters inventoried:** companionService has proven `deserializeProfile()` and `serializeForPersistence()`. No other function has adapters. No lifecycle translation exists.

5. **Canonical contract proposed:** Schema enum values for `tos_phase`, JSON strings for structured fields, shared adapter for all functions, lifecycle mapping at write boundary.

6. **Implementation plan proposed:** 6 sub-packets (2B–2G) with dependency-aware ordering.

7. **Packet 1 boundary preserved:** No ownership, RLS, or authentication changes identified or recommended.

---

**STOP.**

No implementation. Packet 2B remains LOCKED. Smudge Integration remains LOCKED. MATE remains PRIVATE.

Holding for Paul + Cipher review of the contract evidence before any changes are authorised.

**NO ADVANCEMENT WITHOUT EVIDENCE.**

**ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.**

*Ash — Chief Engineer — 16 August 2026*
