# R1-C.1B-S — Shared Companion Core Feasibility

**Date:** 19 August 2026
**Phase:** R1-C.1B-S (Feasibility / Design Proof Only)
**Author:** Ash (Chief Engineer)
**Authority:** Inspection and platform proof only. No production refactor authorised.
**Verdict:** R1-C.1B-S — SHARED CORE ARCHITECTURE VIABLE

---

## A. Shared Module Platform Proof

### Test

Created `base44/shared/companionProbe.ts` in the GapMap MATE app with a pure function:
```typescript
export function companionProbe(value: string): { input: string; processed: string; length: number; hash: string }
```

Created a temporary backend function `probeTest` importing from the shared module:
```typescript
import { companionProbe } from "../../shared/companionProbe.ts";
```

### Result

```json
{
  "success": true,
  "shared_module_loaded": true,
  "import_path": "../../shared/companionProbe.ts",
  "result": {
    "input": "companion_probe_test",
    "processed": "COMPANION_PROBE_TEST",
    "length": 20,
    "hash": "85a"
  }
}
```

- Shared module deployed ✅
- Relative import resolved ✅
- Function executed in GapMap MATE ✅
- No entity access ✅
- No profile mutation ✅
- No engine modification ✅
- Latency: 98ms ✅
- Probe function and shared module removed after proof ✅

**The Base44 app editor supports the `base44/shared/` directory pattern.** Each backend function that imports from `base44/shared/` receives its own bundled copy at deploy time.

---

## B. Proposed companionCore Boundary

### Inspection of companionService (406 lines)

companionService currently mixes two concerns:

1. **Trust boundary** — authentication, profile access, persistence, response construction
2. **Domain processing** — assessment, confidence, flow guidance, discovery merge, lifecycle transitions, mode determination

The domain processing is entirely deterministic and has no dependency on the request object or auth context. It operates on the profile data structure and returns processing results.

### Proposed companionCore boundary

**SHARED MODULE: `base44/shared/companionCore.ts`**

The following logic moves to companionCore (all are pure functions operating on data, no I/O):

| Function | Lines | Purpose | Dependency |
|----------|-------|---------|------------|
| `parseJSON()` | 5-9 | JSON deserialization helper | None |
| `serializeForPersistence()` | 10-12 | Serialize objects for persistence | None |
| `deserializeProfile()` | 14-19 | Deserialize profile fields | parseJSON |
| `hasSubstance()` | 46-48 | Substance threshold check | None |
| `hasArrSubstance()` | 49-53 | Array substance check | hasSubstance |
| `assessAreas()` | 56-105 | Six-area assessment | hasSubstance, hasArrSubstance |
| `calcConfidence()` | 108-112 | Assessment confidence calculation | None |
| `generateReflectionContent()` | 115-131 | Reflection text generation | None |
| `generateFlowGuidance()` | 137-289 | Flow guidance + behavioural notes | AREA_PRIORITY, generateReflectionContent |
| `mergeDiscoveries()` | 335-360 (inlined) | Merge new discoveries into profile | None |
| `determineLifecycleTransition()` | 362-367 (inlined) | tos_phase transition logic | None |
| `determineMode()` | 370-384 (inlined) | Conversation mode determination | None |
| `buildSessionContext()` | 387-392 (inlined) | Session metadata construction | None |

**Proposed companionCore contract:**

```typescript
interface CompanionCoreInput {
  profile: any;              // Already-authorised, DESERIALIZED profile
  currentMode: string;       // EXPLORING | REFLECTING | CONFIRMING | CONFIRMED | RE_EXPLORING
  newDiscoveries?: any;      // Optional discoveries to merge
  userResponseType: string;  // answering | correcting | confirming | rejecting
}

interface CompanionCoreOutput {
  mergedProfile: any;         // Merged profile (native structures)
  updatedPhase: string;       // New tos_phase (if transition occurred)
  operationalPictureConfirmed: boolean;
  engineResult: any;         // Assessment areas, missing, ready_for_confirmation, confidence
  mode: string;              // Updated conversation mode
  guidance: any;             // Flow guidance + behavioural notes
  session: any;              // Session context
  persistencePayload: any;   // Serialized payload ready for UserProfile.update()
}
```

The core is a pure function: same input → same output. No side effects. No I/O.

### What does NOT move to companionCore

- `createClientFromRequest(req)` — trust boundary
- `base44.asServiceRole.entities.UserProfile.get()` — trust boundary
- `base44.asServiceRole.entities.UserProfile.update()` — trust boundary
- Request body parsing — trust boundary
- Response construction — trust boundary
- Error handling — trust boundary

---

## C. What Remains in companionService Wrapper

After extraction, companionService becomes a thin wrapper:

```typescript
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { companionCore, deserializeProfile } from "../../shared/companionCore.ts";

Deno.serve(async (req) => {
  // 1. Trust boundary: auth + profile fetch
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { profile_id, current_mode, new_discoveries, user_response_type } = body;

  const profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
  deserializeProfile(profile);

  // 2. Domain processing (shared)
  const result = companionCore({
    profile,
    currentMode: current_mode,
    newDiscoveries: new_discoveries,
    userResponseType: user_response_type
  });

  // 3. Persistence (trust boundary)
  if (result.persistencePayload) {
    await base44.asServiceRole.entities.UserProfile.update(profile_id, result.persistencePayload);
  }

  // 4. Response (trust boundary)
  return Response.json({
    session: result.session,
    flow_guidance: result.guidance,
    profile: result.mergedProfile,
    ...(result.engineResult ? { engine_result: result.engineResult } : {})
  });
});
```

The wrapper is ~30 lines. All business logic lives in companionCore.

---

## D. What smudgeOrchestrator Would Call

smudgeOrchestrator's flow after companionCore integration:

```typescript
// 1. Auth + profile resolution (RLS-scoped — already proven)
const base44 = createClientFromRequest(req);
const profiles = await base44.entities.UserProfile.list();
const profile = profiles[0]; // RLS-scoped — only the authenticated user's profile
deserializeProfile(profile);

// 2. LLM interpretation (already proven)
const interpretation = await InvokeLLM(...);

// 3. Deterministic validation gate (already proven)
const { new_discoveries, rejected } = buildNewDiscoveries(interpretation.candidate_discoveries);

// 4. Domain processing (shared — SAME as companionService)
const result = companionCore({
  profile,
  currentMode: "EXPLORING",
  newDiscoveries: new_discoveries,
  userResponseType: safeResponseType
});

// 5. Persistence — DOCTRINAL QUESTION (see Section E)
// Option A: companionCore persists (receives base44)
// Option B: orchestrator persists (violates "MUST NOT write UserProfile directly")
// Option C: orchestrator returns payload, frontend calls companionService

// 6. Response
return Response.json({
  success: true,
  tos_phase: result.updatedPhase,
  state_changed: result.updatedPhase !== profile.tos_phase,
  companion_result: { session: result.session, engine_result: result.engineResult, ... },
  ...
});
```

The orchestrator calls the SAME companionCore as companionService. ONE deterministic implementation, TWO safe entry points.

---

## E. Ownership Preservation Proof

### The Persistence Question

The directive states:
- "smudgeOrchestrator MUST NOT write UserProfile directly"
- "smudgeOrchestrator must not call: base44.asServiceRole.entities.UserProfile.update() for Understanding data"

The directive also proposes:
- `companionCore({ base44, authorisedProfile, currentMode, newDiscoveries, userResponseType })`

This suggests companionCore may receive `base44` and perform persistence itself. In this model:

1. **smudgeOrchestrator entry point:** authenticates → resolves profile via RLS → calls companionCore with `base44` and the authorised profile
2. **companionCore:** processes discoveries → persists via `base44.asServiceRole.entities.UserProfile.update(authorisedProfile.id, payload)` → returns result
3. **smudgeOrchestrator:** returns result — never calls `UserProfile.update()` directly

**Ownership analysis:**

| Principle | Preserved? | Evidence |
|-----------|-----------|----------|
| Profile is already authorised before companionCore runs | ✅ | Caller resolves profile via RLS (orchestrator) or authenticated fetch (companionService) |
| companionCore does not accept arbitrary profile_id | ✅ | Receives the profile OBJECT, not a profile_id to look up |
| companionCore does not perform asServiceRole.get(arbitrary_id) | ✅ | Profile is already fetched and deserialized by the caller |
| Persistence uses the already-authorised profile's ID | ✅ | `update(authorisedProfile.id, payload)` — same profile that was RLS-validated |
| smudgeOrchestrator's code does not call UserProfile.update() | ✅ | companionCore calls it, using the base44 client passed in |
| companionService's contract is unchanged | ✅ | Same input/output, only internal implementation changes |
| Lifecycle transitions owned by companion logic | ✅ | companionCore contains the transition logic, not the caller |

### Doctrinal Decision Required

The question is whether "companionCore persists on behalf of the caller" satisfies "smudgeOrchestrator MUST NOT write UserProfile directly."

**Argument FOR:** companionCore is a separate module with its own contract. The orchestrator's code doesn't contain `UserProfile.update()`. The persistence decision is made by companionCore's deterministic logic, not by the orchestrator.

**Argument AGAINST:** companionCore runs in the orchestrator's process. The `base44` client is the orchestrator's client. Technically, the orchestrator's execution context is calling `UserProfile.update()`.

**Recommendation:** Present this as a doctrinal decision for Paul and Cipher. The architecture is viable either way — but the persistence model must be explicitly approved.

**Alternative if "MUST NOT write" is absolute:** companionCore returns a `persistencePayload` but does NOT persist. The caller persists. In this model:
- companionService persists (already authorised)
- smudgeOrchestrator cannot persist (directive forbids it)
- smudgeOrchestrator returns the payload to the frontend
- Frontend calls companionService with the payload for persistence

This adds a round-trip but maintains absolute separation. It is viable but adds latency.

---

## F. External Contract Preservation Assessment

### Current companionService API contract

**Input:**
```json
{
  "profile_id": "string",
  "current_mode": "EXPLORING",
  "new_discoveries": { ... },
  "user_response_type": "answering"
}
```

**Output:**
```json
{
  "session": { mode, areas_explored, areas_outstanding, profile_phase, assessment_confidence, user_confidence, confirmed },
  "flow_guidance": { next_area_to_explore, areas_with_substance, areas_missing, ready_to_reflect, ready_to_confirm, reflection_content, behavioural_notes },
  "profile": { ... },
  "engine_result": { areas, missing_areas, ready_for_confirmation, can_proceed, assessment_confidence }
}
```

### After extraction

The input and output remain IDENTICAL. companionService's wrapper:
1. Parses the request (same)
2. Fetches the profile (same)
3. Calls companionCore (new internal step — not visible externally)
4. Persists (same)
5. Returns the response (same structure)

**No existing caller or test would need rewriting.** The extraction is purely internal.

**Behaviour preservation:** All deterministic logic (assessment, confidence, flow guidance, mode determination, lifecycle transitions) moves verbatim to companionCore. The logic itself does not change — only its location.

### Known issue (pre-existing, not introduced by extraction)

companionService uses old lifecycle terminology (`Discover`/`Understand`) in its transition logic, not the locked 7-state lifecycle (`EXPLORING`/`CONFIRMING`/`CONFIRMED`). This is a pre-existing issue documented in the Packet 2B v1.1 Canonical Lifecycle Contract. companionCore would preserve this behaviour exactly — the extraction does NOT fix or change it. The lifecycle terminology fix is a separate workstream (Packet 2C implementation).

---

## G. Serialization Placement

### Current state

companionService:
1. Fetches profile (serialized — JSON strings for arrays/objects)
2. Deserializes (`deserializeProfile()`)
3. Processes (native structures)
4. Serializes for persistence (`serializeForPersistence()`)
5. Persists

smudgeOrchestrator:
1. Fetches profile (serialized)
2. Deserializes (`deserializeProfile()` — duplicated)
3. Processes (native structures)
4. Does not persist (companionService call fails)

### Proposed arrangement

**Serialization adapters live in companionCore:**
- `deserializeProfile()` — shared, both callers need it
- `serializeForPersistence()` — shared, both callers need it
- `parseJSON()` — shared helper

**companionCore contract:**
- Receives: DESERIALIZED (native) profile
- Returns: native structures + `persistencePayload` (already serialized)
- The caller's responsibility: fetch → deserialize (using shared adapter) → call core → persist (using returned payload) → respond

**Cleanest arrangement:**

```
companionCore
├── Serialization adapters (deserializeProfile, serializeForPersistence, parseJSON)
├── Domain logic (assessAreas, calcConfidence, generateFlowGuidance, mergeDiscoveries, etc.)
└── Persistence payload builder (constructs serialized payload from native result)
```

The caller calls `deserializeProfile(profile)` before passing to companionCore, and receives a `persistencePayload` from companionCore that is ready for `UserProfile.update()`.

**No serialization logic is duplicated.** The adapters live in one place.

---

## H. Shared-Version Deployment Rule

### The Problem

Base44 docs: "Each function is deployed with its own copy of shared code. Changing a shared file and deploying a single function updates only that function's copy."

If companionCore changes and only smudgeOrchestrator is redeployed, companionService would run the old version. This creates version drift.

### Proposed Rule

1. **Version constant:** companionCore exports `COMPANION_CORE_VERSION = "1.0.x"`
2. **Version reporting:** Both companionService and smudgeOrchestrator include `companion_core_version` in their responses
3. **Deployment rule:** Whenever companionCore changes, BOTH functions must be redeployed together
4. **Version parity check:** A diagnostic call to both functions verifies they report the same version
5. **Regression test:** The test suite (T8) verifies version parity

### Implementation (not yet — governance deferred per directive)

The version constant would be added to companionCore when the production refactor is authorised. For the feasibility proof, the rule is documented but not implemented.

---

## I. Proposed Test Plan

### Test sequence (for when production refactor is authorised)

| Test | Purpose | Method |
|------|---------|--------|
| T1 | Existing companionService behaviour unchanged after extraction | Call companionService with known input, compare output to pre-extraction baseline |
| T2 | Existing companionService ownership behaviour unchanged | Call companionService with invalid profile_id, confirm 404 |
| T3 | smudgeOrchestrator production-auth path reaches companionCore | Send message via orchestrator, confirm companionCore processes it |
| T4 | Direct user discovery is persisted correctly | Send factual message, verify profile updated with correct fields |
| T5 | Ambiguous interpretation is not persisted | Send tentative message, verify no persistence of uncertain discoveries |
| T6 | EXPLORING → CONFIRMING transition only through companion logic | Send enough discoveries to trigger transition, verify it follows companion rules |
| T7 | No CONFIRMED skip | Send confirming response_type during EXPLORING, verify it's downgraded to "answering" |
| T8 | Both wrappers report identical companionCore version | Call both functions, compare companion_core_version |
| T9 | Failure leaves profile unchanged | Trigger error mid-processing, verify profile unchanged |
| T10 | Bodge regression | Read-only: verify Bodge's substantive fields unchanged |

**T10 is read-only.** No Bodge mutation. Use a separate controlled EXPLORING test profile for T1-T9.

---

## J. Risks / Deviations

### Risks

1. **Persistence ownership doctrinal decision** — Whether companionCore persisting on behalf of smudgeOrchestrator satisfies "MUST NOT write UserProfile directly" is a doctrinal question. Requires Paul + Cipher ruling.

2. **Version drift** — If one function is redeployed without the other, they may run different companionCore versions. Mitigated by the deployment rule (Section H) but requires discipline.

3. **Lifecycle terminology mismatch** — companionService uses `Discover`/`Understand`, not the locked `EXPLORING`/`CONFIRMING`. companionCore preserves this. The fix is a separate workstream (Packet 2C).

4. **companionService asServiceRole access** — companionService uses `asServiceRole.entities.UserProfile.get(profile_id)` with profile_id from the request body. This is the R1-C.1A-V finding. companionCore doesn't change this — the wrapper still fetches the profile. But it's a pre-existing risk that should be addressed separately.

5. **Shared module bundling** — Each function gets its own copy. If companionCore has a bug, both copies have the same bug. But if only one is redeployed with a fix, the other still has the bug.

### Deviations

- **Bodge deviation (R1-C.1B):** Recorded in R1-C.1B-D. EVALUATING → EXPLORING → EVALUATING (restored). `updated_date` changed. All substantive fields unchanged. 1 journey + 9 checkpoints intact. No further Bodge mutation authorised.

---

## K. Recommendation

### Verdict: R1-C.1B-S — SHARED CORE ARCHITECTURE VIABLE

The shared companion core architecture is viable:

1. **Platform proof passed** — `base44/shared/` works in the GapMap MATE app editor
2. **Clean decomposition exists** — companionService's domain logic is entirely separable from its trust boundary
3. **Ownership can be preserved** — companionCore operates on an already-authorised profile, not an arbitrary profile_id
4. **External contract unchanged** — companionService's API input/output is identical after extraction
5. **Serialization not duplicated** — adapters live in companionCore, both callers use them
6. **Version drift manageable** — deployment rule + version constant + parity check

### One doctrinal decision required before implementation

**Does companionCore persisting via the caller's `base44` client satisfy "smudgeOrchestrator MUST NOT write UserProfile directly"?**

- If YES: companionCore receives `base44`, persists, returns result. Simplest path.
- If NO: companionCore returns a `persistencePayload`. companionService persists it. smudgeOrchestrator returns the payload to the frontend, which calls companionService for persistence. Adds a round-trip but maintains absolute separation.

### What I recommend

Option A (companionCore persists) is the cleaner architecture. The orchestrator's code never contains `UserProfile.update()`. The persistence decision is made by companionCore's deterministic logic. The ownership was already established by the caller's RLS-scoped profile resolution.

But this is Cipher's call.

### No production refactor authorised

This report is feasibility/design proof only. No companionService modification. No smudgeOrchestrator modification. No companionCore implementation. All of these require Paul's authorisation and Cipher's doctrine review.

---

*Ash — Chief Engineer*
*19 August 2026*

*SMUDGE CONDUCTS THE ORCHESTRA; HE DOES NOT BECOME THE ORCHESTRA.*
*ONE MOUNTAIN. THREE VIEWS. ONE TRUTH.*
