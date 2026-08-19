import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ============================================================
// smudgeOrchestrator — R1-C.1B (companionService integration)
//
// SCOPE: EXPLORING only
// Engine connection: companionService (Understanding only)
//
// R1-C.1A-C: Test bypass removed. Production-only profile resolution.
// R1-C.1B: Deterministic validation gate + companionService call.
//
// PROVES:
//   1. user expression → LLM interpretation → deterministic validation
//   2. Validated discoveries → companionService → authorised profile update
//   3. Orchestrator never writes UserProfile directly
//   4. Orchestrator never writes tos_phase
//   5. Lifecycle transitions owned by companionService
// ============================================================

// --- Serialization adapters ---

function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

function deserializeProfile(profile: any): any {
  const arrayFields = ["service_history", "goals", "operational_context", "evidence_log", "capability_map", "confidence_scores", "recommended_pathways", "safety_flags", "operational_picture_history", "milestones"];
  const objectFields = ["assessment_confidence", "decision_factors", "soak_period", "communication_preferences"];
  for (const f of arrayFields) { profile[f] = parseJSON(profile[f], []); }
  for (const f of objectFields) { profile[f] = parseJSON(profile[f]); }
  return profile;
}

// --- Substance threshold ---
const SUBSTANCE_THRESHOLD = 15;

function isSubstantive(value: any): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.length >= SUBSTANCE_THRESHOLD;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

// --- Deterministic validation gate ---
// CONFIDENCE THRESHOLD: "high" for direct_statement only.
// This threshold is FIXED. The LLM does not decide it dynamically.

const ACCEPTABLE_SOURCE_TYPES = ["direct_statement"];
const ACCEPTABLE_CONFIDENCE = ["high"];
const SKIP_FIELDS = ["service_history", "operational_context"]; // complex objects, not reliable for R1-C.1B

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
    // Skip complex fields
    if (SKIP_FIELDS.includes(d.field)) {
      rejected.push({ field: d.field, value: d.value, reason: "COMPLEX_FIELD_SKIPPED" });
      continue;
    }

    // Deterministic gate: only direct_statement + high confidence
    if (!ACCEPTABLE_SOURCE_TYPES.includes(d.source_type)) {
      rejected.push({ field: d.field, value: d.value, reason: "SOURCE_TYPE_NOT_DIRECT_STATEMENT" });
      continue;
    }
    if (!ACCEPTABLE_CONFIDENCE.includes(d.confidence)) {
      rejected.push({ field: d.field, value: d.value, reason: "CONFIDENCE_NOT_HIGH" });
      continue;
    }

    const mappedValue = mapDiscoveryValue(d.field, d.value);

    // Goals are collected into an array
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
// EXPLORING-origin interaction may reach CONFIRMING only.
// It must never confirm in the same interaction.
// confirming/rejecting → downgraded to answering.

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
        success: false,
        error: "NO_PROFILE",
        response_text: "I don't have your profile set up yet. Please visit your dashboard to get started, then come back and we can talk.",
        tos_phase: null,
        state_changed: false
      }), { headers: cors });
    }

    const profile_id = profiles[0].id;
    let profile = profiles[0];
    profile = deserializeProfile(profile);

    // ==================================================
    // 2. CANONICAL TOS_PHASE READ
    // ==================================================

    const tos_phase = profile.tos_phase || "UNKNOWN";

    // ==================================================
    // 3. PHASE ROUTING — EXPLORING ONLY
    // ==================================================

    if (tos_phase !== "EXPLORING") {
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about where things stand.",
        tos_phase: tos_phase,
        state_changed: false,
        orchestration_note: "NOT_YET_IMPLEMENTED"
      }), { headers: cors });
    }

    // ==================================================
    // 4. BUILD BOUNDED PROFILE CONTEXT
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
      if (isSubstantive(profile[area.key])) {
        areas_explored.push(area.label);
      } else {
        areas_outstanding.push(area.label);
      }
    }

    const profile_context = {
      tos_phase: tos_phase,
      areas_explored,
      areas_outstanding,
      has_service_history: Array.isArray(profile.service_history) && profile.service_history.length > 0,
      has_goals: Array.isArray(profile.goals) && profile.goals.length > 0,
      professional_identity: profile.professional_identity || null,
      service_branch: profile.service_branch || null
    };

    // ==================================================
    // 5. LLM INTERPRETATION CALL (InvokeLLM)
    // ==================================================

    const interpretPrompt = "You are Smudge, a warm, grounded companion for military service leavers. " +
      "You are in the " + tos_phase + " phase of the MATE journey.\n\n" +
      "Your role: listen, understand, and identify what the user is sharing. " +
      "You are NOT an advisor yet. You are building understanding.\n\n" +
      "Current profile context:\n" +
      "- Phase: " + tos_phase + "\n" +
      "- Areas already explored: " + (areas_explored.join(", ") || "none yet") + "\n" +
      "- Areas still outstanding: " + (areas_outstanding.join(", ") || "none") + "\n" +
      "- Professional identity: " + (profile_context.professional_identity || "not yet shared") + "\n" +
      "- Service branch: " + (profile_context.service_branch || "not yet shared") + "\n\n" +
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
        candidate_discoveries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "UserProfile field name" },
              value: { type: "string", description: "Extracted value" },
              source_type: { type: "string", enum: ["direct_statement", "reasonable_interpretation", "uncertain"] },
              source_text: { type: "string", description: "The user's actual words that led to this extraction" },
              confidence: { type: "string", enum: ["high", "moderate", "low"] }
            },
            required: ["field", "value", "source_type", "source_text", "confidence"]
          }
        },
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
      prompt: interpretPrompt,
      response_json_schema: interpretSchema
    });

    // ==================================================
    // 6. VALIDATE INTERPRETATION
    // ==================================================

    if (!interpretation || typeof interpretation !== "object") {
      return new Response(JSON.stringify({
        success: false,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: null,
        candidate_discoveries_count: 0,
        accepted_discoveries_count: 0,
        companion_result: null,
        recoverable_error: "LLM_INTERPRETATION_FAILED",
        orchestration_note: "INTERPRETATION_INVALID"
      }), { headers: cors });
    }

    // ==================================================
    // 7. SAFETY CHECK — stop all orchestration
    // ==================================================

    if (interpretation.safety_flag === true) {
      return new Response(JSON.stringify({
        success: true,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: null,
        candidate_discoveries_count: 0,
        accepted_discoveries_count: 0,
        companion_result: null,
        recoverable_error: null,
        orchestration_note: "SAFETY_PATH_NO_ENGINE_CALL",
        safety_response: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too."
      }), { headers: cors });
    }

    // ==================================================
    // 8. AMBIGUITY CHECK — no persistence if ambiguous
    // ==================================================

    if (interpretation.ambiguity_flag === true) {
      return new Response(JSON.stringify({
        success: true,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: interpretation.clarification_needed || "Could you tell me a bit more about that?",
        candidate_discoveries_count: (interpretation.candidate_discoveries || []).length,
        accepted_discoveries_count: 0,
        companion_result: null,
        recoverable_error: null,
        orchestration_note: "AMBIGUOUS_NO_PERSISTENCE",
        _internal: {
          interpretation,
          profile_context
        }
      }), { headers: cors });
    }

    // ==================================================
    // 9. DETERMINISTIC VALIDATION GATE
    // ==================================================

    const allDiscoveries = interpretation.candidate_discoveries || [];
    const { new_discoveries, rejected } = buildNewDiscoveries(allDiscoveries);

    // Check if ANY discovery was reasonable_interpretation or uncertain
    const hasNonDirect = allDiscoveries.some((d: any) =>
      d.source_type === "reasonable_interpretation" || d.source_type === "uncertain");

    // If there are non-direct discoveries, return clarification (do not persist ANY)
    if (hasNonDirect && Object.keys(new_discoveries).length === 0) {
      return new Response(JSON.stringify({
        success: true,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: "I want to make sure I understand correctly. Could you tell me a bit more about that?",
        candidate_discoveries_count: allDiscoveries.length,
        accepted_discoveries_count: 0,
        rejected_discoveries: rejected,
        companion_result: null,
        recoverable_error: null,
        orchestration_note: "TENTATIVE_LANGUAGE_NO_PERSISTENCE",
        _internal: {
          interpretation,
          profile_context,
          validation_decisions: { gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY", result: "ALL_REJECTED" }
        }
      }), { headers: cors });
    }

    // If there are non-direct discoveries mixed with direct, still return clarification
    // (directive: "REASONABLE_INTERPRETATION → DO NOT persist automatically")
    if (hasNonDirect) {
      return new Response(JSON.stringify({
        success: true,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: "Some of what you've said is clear, but I want to understand the rest better. Could you tell me more?",
        candidate_discoveries_count: allDiscoveries.length,
        accepted_discoveries_count: 0,
        rejected_discoveries: rejected,
        companion_result: null,
        recoverable_error: null,
        orchestration_note: "MIXED_DIRECT_AND_TENTATIVE_NO_PERSISTENCE",
        _internal: {
          interpretation,
          profile_context,
          validation_decisions: { gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY", result: "MIXED_REJECTED" }
        }
      }), { headers: cors });
    }

    // If no discoveries at all, return without calling companionService
    if (allDiscoveries.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: null,
        candidate_discoveries_count: 0,
        accepted_discoveries_count: 0,
        companion_result: null,
        recoverable_error: null,
        orchestration_note: "NO_DISCOVERIES",
        _internal: {
          interpretation,
          profile_context
        }
      }), { headers: cors });
    }

    // ==================================================
    // 10. USER_RESPONSE_TYPE DOWNGRADE
    // ==================================================

    const rawResponseType = interpretation.user_response_type || "answering";
    const { safe: safeResponseType, downgraded } = safeUserResponseType(rawResponseType);

    // ==================================================
    // 11. COMPANIONSERVICE CALL
    // ==================================================

    // Call companionService via SDK (handles auth automatically per Base44 docs)
    let companionResult: any = null;
    let companionError: string | null = null;

    try {
      const companionPayload = {
        profile_id: profile_id,
        current_mode: "EXPLORING",
        new_discoveries: new_discoveries,
        user_response_type: safeResponseType
      };

      // Try SDK function invoke first (handles auth automatically)
      if (typeof (base44 as any).functions?.invoke === "function") {
        companionResult = await (base44 as any).functions.invoke("companionService", companionPayload);
      } else {
        // Fallback: HTTP call via app domain
        const apiUrl = req.headers.get("base44-api-url") || "https://app.base44.com";
        const appId = req.headers.get("base44-app-id") || "";
        const companionUrl = apiUrl + "/api/apps/" + appId + "/functions/companionService";
        const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
        if (authHeader) fetchHeaders["Authorization"] = authHeader;
        const serviceAuth = req.headers.get("base44-service-authorization");
        if (serviceAuth) fetchHeaders["base44-service-authorization"] = serviceAuth;
        fetchHeaders["base44-api-url"] = apiUrl;
        if (appId) fetchHeaders["base44-app-id"] = appId;
        const companionResponse = await fetch(companionUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(companionPayload)
        });
        if (!companionResponse.ok) {
          companionError = "COMPANION_SERVICE_HTTP_ERROR_" + companionResponse.status;
        } else {
          companionResult = await companionResponse.json();
        }
      }
    } catch (invokeError) {
      companionError = "COMPANION_INVOKE_FAILED: " + (invokeError as Error).message;
    }

    // ==================================================
    // 12. BUILD RESPONSE
    // ==================================================

    if (companionError) {
      return new Response(JSON.stringify({
        success: false,
        tos_phase: tos_phase,
        state_changed: false,
        clarification_needed: null,
        candidate_discoveries_count: allDiscoveries.length,
        accepted_discoveries_count: Object.keys(new_discoveries).length,
        companion_result: null,
        recoverable_error: companionError,
        orchestration_note: "COMPANION_SERVICE_FAILED",
        _internal: {
          validation_decisions: { gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY", accepted_fields: Object.keys(new_discoveries) },
          raw_user_response_type: rawResponseType,
          response_type_downgraded: downgraded,
          safe_user_response_type: safeResponseType
        }
      }), { headers: cors });
    }

    // Extract state change info from companion result
    const companionPhase = companionResult?.profile?.tos_phase || tos_phase;
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
        session: companionResult?.session || null,
        engine_result: companionResult?.engine_result || null,
        areas_with_substance: companionResult?.flow_guidance?.areas_with_substance || [],
        areas_missing: companionResult?.flow_guidance?.areas_missing || [],
        ready_for_confirmation: companionResult?.engine_result?.ready_for_confirmation || false,
        lifecycle_transition: stateChanged ? (tos_phase + " → " + companionPhase) : null
      },
      recoverable_error: null,
      orchestration_note: "R1-C.1B_COMPANIONSERVICE_CALLED",
      _internal: {
        interpretation,
        profile_context,
        validation_decisions: {
          gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY",
          accepted_fields: Object.keys(new_discoveries),
          rejected: rejected
        },
        raw_user_response_type: rawResponseType,
        response_type_downgraded: downgraded,
        safe_user_response_type: safeResponseType,
        companion_service_method: typeof (base44 as any).functions?.invoke === "function" ? "SDK_INVOKE" : "HTTP_FETCH"
      }
    }), { headers: cors });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      tos_phase: null,
      state_changed: false,
      clarification_needed: null,
      candidate_discoveries_count: 0,
      accepted_discoveries_count: 0,
      companion_result: null,
      recoverable_error: "ORCHESTRATOR_ERROR",
      orchestration_note: "EXCEPTION",
      _internal: { error_message: error.message }
    }), { status: 500, headers: cors });
  }
});
