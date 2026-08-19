import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { companionCore, deserializeProfile, COMPANION_CORE_VERSION } from "../../shared/companionCore.ts";

// ============================================================
// smudgeOrchestrator — R1-C.1B-E2 (companionCore integration)
//
// SCOPE: EXPLORING only
// Domain processing: companionCore (shared module v1.0.0)
//
// PROVES:
//   1. user expression → LLM interpretation → deterministic validation
//   2. Validated discoveries → companionCore → authorised persistence
//   3. Orchestrator never writes UserProfile directly
//   4. Orchestrator never writes tos_phase
//   5. Lifecycle transitions owned by companionCore
//   6. companionCore version reported
// ============================================================

// --- Substance threshold (for profile context building only) ---
const SUBSTANCE_THRESHOLD = 15;

function isSubstantive(value: any): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.length >= SUBSTANCE_THRESHOLD;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

// --- Deterministic validation gate ---
const ACCEPTABLE_SOURCE_TYPES = ["direct_statement"];
const ACCEPTABLE_CONFIDENCE = ["high"];
const SKIP_FIELDS = ["service_history", "operational_context"];

function mapDiscoveryValue(field: string, value: string): any {
  if (field === "years_served" || field === "user_confidence") {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }
  return value;
}

function buildNewDiscoveries(discoveries: any[]): { new_discoveries: any; rejected: any[] } {
  const accepted: any = {};
  const rejected: any[] = [];
  const goalsList: string[] = [];

  for (const d of discoveries) {
    if (SKIP_FIELDS.includes(d.field)) {
      rejected.push({ field: d.field, value: d.value, reason: "COMPLEX_FIELD_SKIPPED" });
      continue;
    }
    if (!ACCEPTABLE_SOURCE_TYPES.includes(d.source_type)) {
      rejected.push({ field: d.field, value: d.value, reason: "SOURCE_TYPE_NOT_DIRECT_STATEMENT" });
      continue;
    }
    if (!ACCEPTABLE_CONFIDENCE.includes(d.confidence)) {
      rejected.push({ field: d.field, value: d.value, reason: "CONFIDENCE_NOT_HIGH" });
      continue;
    }
    const mappedValue = mapDiscoveryValue(d.field, d.value);
    if (d.field === "goals") {
      goalsList.push(d.value);
    } else {
      accepted[d.field] = mappedValue;
    }
  }
  if (goalsList.length > 0) {
    accepted.goals = goalsList;
  }
  return { new_discoveries: accepted, rejected };
}

// --- user_response_type downgrade ---
function safeUserResponseType(raw: string): { safe: string; downgraded: boolean } {
  if (raw === "confirming" || raw === "rejecting") {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}

Deno.serve(async (req) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const user_message = body.user_message || "";
    const base44 = createClientFromRequest(req);

    // ==================================================
    // 1. PROFILE CONTEXT ACQUISITION (production only, RLS-protected)
    // ==================================================

    const profiles = await base44.entities.UserProfile.list();
    if (profiles.length === 0) {
      return new Response(JSON.stringify({
        success: false, error: "NO_PROFILE",
        response_text: "I don't have your profile set up yet. Please visit your dashboard to get started, then come back and we can talk.",
        tos_phase: null, state_changed: false, companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    const profile_id = profiles[0].id;
    const profile = deserializeProfile(profiles[0]);
    const tos_phase = profile.tos_phase || "UNKNOWN";

    // ==================================================
    // 2. PHASE ROUTING — EXPLORING ONLY
    // ==================================================

    if (tos_phase !== "EXPLORING") {
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about where things stand.",
        tos_phase: tos_phase, state_changed: false,
        orchestration_note: "NOT_YET_IMPLEMENTED",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 3. BUILD BOUNDED PROFILE CONTEXT (for LLM)
    // ==================================================

    const operational_areas = [
      { key: "professional_identity", label: "professional identity" },
      { key: "service_branch", label: "service branch" },
      { key: "service_history", label: "service history" },
      { key: "personal_context", label: "personal context" },
      { key: "goals", label: "goals" },
      { key: "operational_context", label: "current influences" },
      { key: "user_confidence", label: "self-confidence" }
    ];

    const areas_explored: string[] = [];
    const areas_outstanding: string[] = [];
    for (const area of operational_areas) {
      if (isSubstantive(profile[area.key])) { areas_explored.push(area.label); }
      else { areas_outstanding.push(area.label); }
    }

    // ==================================================
    // 4. LLM INTERPRETATION CALL (InvokeLLM)
    // ==================================================

    const interpretPrompt = "You are Smudge, a warm, grounded companion for military service leavers. " +
      "You are in the " + tos_phase + " phase of the MATE journey.\n\n" +
      "Your role: listen, understand, and identify what the user is sharing. " +
      "You are NOT an advisor yet. You are building understanding.\n\n" +
      "Current profile context:\n" +
      "- Phase: " + tos_phase + "\n" +
      "- Areas already explored: " + (areas_explored.join(", ") || "none yet") + "\n" +
      "- Areas still outstanding: " + (areas_outstanding.join(", ") || "none") + "\n" +
      "- Professional identity: " + (profile.professional_identity || "not yet shared") + "\n" +
      "- Service branch: " + (profile.service_branch || "not yet shared") + "\n\n" +
      'The user just said: "' + user_message + '"\n\n' +
      "Extract candidate discoveries from this message. Rules:\n" +
      "1. Only extract what the user DIRECTLY expressed or STRONGLY implied\n" +
      "2. Do NOT invent or fabricate information\n" +
      "3. Classify each discovery as:\n" +
      "   - direct_statement: user explicitly stated this\n" +
      "   - reasonable_interpretation: strong inference from what was said\n" +
      "   - uncertain: weak inference or guess\n" +
      "4. Include the user's actual words as source_text for each discovery\n" +
      "5. Map each discovery to a UserProfile field (e.g., professional_identity, service_branch, service_history, personal_context, goals, operational_context, user_confidence)\n\n" +
      "Also classify:\n" +
      "- The user's conversational intent\n" +
      "- Whether this is an explicit confirmation/rejection (only if unambiguous)\n" +
      "- Whether the interpretation is ambiguous\n" +
      "- Whether there are any safety concerns";

    const interpretSchema = {
      type: "object",
      properties: {
        candidate_discoveries: { type: "array", items: { type: "object", properties: {
          field: { type: "string", description: "UserProfile field name" },
          value: { type: "string", description: "Extracted value" },
          source_type: { type: "string", enum: ["direct_statement", "reasonable_interpretation", "uncertain"] },
          source_text: { type: "string", description: "The user's actual words that led to this extraction" },
          confidence: { type: "string", enum: ["high", "moderate", "low"] }
        }, required: ["field", "value", "source_type", "source_text", "confidence"] } },
        intent: { type: "string", enum: ["answering", "correcting", "asking_question", "seeking_reassurance", "expressing_frustration", "sharing_milestone", "other"] },
        user_response_type: { type: "string", enum: ["answering", "correcting", "confirming", "rejecting", "none"], description: "Only confirming if explicit unambiguous affirmation" },
        interpretation_confidence: { type: "string", enum: ["high", "moderate", "low"] },
        ambiguity_flag: { type: "boolean", description: "True if interpretation is uncertain or ambiguous" },
        clarification_needed: { type: "string", description: "Question to ask user if ambiguous" },
        safety_flag: { type: "boolean", description: "True if distress, crisis, or self-harm indicators detected" }
      },
      required: ["candidate_discoveries", "intent", "user_response_type", "interpretation_confidence", "ambiguity_flag", "safety_flag"]
    };

    const interpretation = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: interpretPrompt, response_json_schema: interpretSchema
    });

    // ==================================================
    // 5. VALIDATE INTERPRETATION — fail closed
    // ==================================================

    if (!interpretation || typeof interpretation !== "object") {
      return new Response(JSON.stringify({
        success: false, tos_phase: tos_phase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: "LLM_INTERPRETATION_FAILED",
        orchestration_note: "INTERPRETATION_INVALID",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 6. SAFETY CHECK — bypass companionCore entirely
    // ==================================================

    if (interpretation.safety_flag === true) {
      return new Response(JSON.stringify({
        success: true, tos_phase: tos_phase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: null,
        orchestration_note: "SAFETY_PATH_NO_ENGINE_CALL",
        safety_response: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 7. AMBIGUITY CHECK — no persistence if ambiguous
    // ==================================================

    if (interpretation.ambiguity_flag === true) {
      return new Response(JSON.stringify({
        success: true, tos_phase: tos_phase, state_changed: false,
        clarification_needed: interpretation.clarification_needed || "Could you tell me a bit more about that?",
        candidate_discoveries_count: (interpretation.candidate_discoveries || []).length,
        accepted_discoveries_count: 0, companion_result: null,
        orchestration_note: "AMBIGUOUS_NO_PERSISTENCE",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 8. DETERMINISTIC VALIDATION GATE
    // ==================================================

    const allDiscoveries = interpretation.candidate_discoveries || [];
    const { new_discoveries, rejected } = buildNewDiscoveries(allDiscoveries);

    const hasNonDirect = allDiscoveries.some((d: any) =>
      d.source_type === "reasonable_interpretation" || d.source_type === "uncertain");

    if (hasNonDirect && Object.keys(new_discoveries).length === 0) {
      return new Response(JSON.stringify({
        success: true, tos_phase: tos_phase, state_changed: false,
        clarification_needed: "I want to make sure I understand correctly. Could you tell me a bit more about that?",
        candidate_discoveries_count: allDiscoveries.length, accepted_discoveries_count: 0,
        rejected_discoveries: rejected, companion_result: null,
        orchestration_note: "TENTATIVE_LANGUAGE_NO_PERSISTENCE",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    if (hasNonDirect) {
      return new Response(JSON.stringify({
        success: true, tos_phase: tos_phase, state_changed: false,
        clarification_needed: "Some of what you've said is clear, but I want to understand the rest better. Could you tell me more?",
        candidate_discoveries_count: allDiscoveries.length, accepted_discoveries_count: 0,
        rejected_discoveries: rejected, companion_result: null,
        orchestration_note: "MIXED_DIRECT_AND_TENTATIVE_NO_PERSISTENCE",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    if (allDiscoveries.length === 0) {
      return new Response(JSON.stringify({
        success: true, tos_phase: tos_phase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, orchestration_note: "NO_DISCOVERIES",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 9. USER_RESPONSE_TYPE DOWNGRADE
    // ==================================================

    const rawResponseType = interpretation.user_response_type || "answering";
    const { safe: safeResponseType, downgraded } = safeUserResponseType(rawResponseType);

    // ==================================================
    // 10. COMPANIONCORE CALL (shared domain logic)
    // Orchestrator provides narrow persistence capability.
    // companionCore decides and executes persistence.
    // Orchestrator never constructs the persistence payload.
    // ==================================================

    let companionResult: any = null;
    let companionError: string | null = null;

    try {
      companionResult = await companionCore({
        profile,
        currentMode: "EXPLORING",
        newDiscoveries: new_discoveries,
        userResponseType: safeResponseType,
        persist: (id: string, payload: any) => base44.asServiceRole.entities.UserProfile.update(id, payload),
      });
    } catch (coreError) {
      companionError = "COMPANION_CORE_ERROR: " + (coreError as Error).message;
    }

    // ==================================================
    // 11. BUILD RESPONSE
    // ==================================================

    if (companionError) {
      return new Response(JSON.stringify({
        success: false, tos_phase: tos_phase, state_changed: false,
        candidate_discoveries_count: allDiscoveries.length,
        accepted_discoveries_count: Object.keys(new_discoveries).length,
        companion_result: null, recoverable_error: companionError,
        orchestration_note: "COMPANION_CORE_FAILED",
        companion_core_version: COMPANION_CORE_VERSION,
        _internal: {
          raw_user_response_type: rawResponseType, response_type_downgraded: downgraded,
          safe_user_response_type: safeResponseType
        }
      }), { headers: cors });
    }

    const companionPhase = companionResult.mergedProfile?.tos_phase || tos_phase;
    const stateChanged = companionPhase !== tos_phase;

    return new Response(JSON.stringify({
      success: true,
      tos_phase: companionPhase,
      state_changed: stateChanged,
      clarification_needed: null,
      candidate_discoveries_count: allDiscoveries.length,
      accepted_discoveries_count: Object.keys(new_discoveries).length,
      rejected_discoveries: rejected,
      companion_result: {
        session: companionResult.session || null,
        engine_result: companionResult.engineResult || null,
        areas_with_substance: companionResult.guidance?.areas_with_substance || [],
        areas_missing: companionResult.guidance?.areas_missing || [],
        ready_for_confirmation: companionResult.engineResult?.ready_for_confirmation || false,
        lifecycle_transition: stateChanged ? (tos_phase + " → " + companionPhase) : null
      },
      recoverable_error: null,
      orchestration_note: "R1-C.1B-E2_COMPANIONCORE_CALLED",
      companion_core_version: companionResult.companionCoreVersion || COMPANION_CORE_VERSION,
      _internal: {
        validation_decisions: {
          gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY",
          accepted_fields: Object.keys(new_discoveries),
          rejected: rejected
        },
        raw_user_response_type: rawResponseType,
        response_type_downgraded: downgraded,
        safe_user_response_type: safeResponseType,
        persistence_model: "COMPANION_CORE_NARROW_CALLBACK"
      }
    }), { headers: cors });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false, tos_phase: null, state_changed: false,
      candidate_discoveries_count: 0, accepted_discoveries_count: 0,
      companion_result: null, recoverable_error: "ORCHESTRATOR_ERROR",
      orchestration_note: "EXCEPTION",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: { error_message: error.message }
    }), { status: 500, headers: cors });
  }
});
