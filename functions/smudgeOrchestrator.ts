import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ============================================================
// smudgeOrchestrator — R1-C.1A FOUNDATION
//
// SCOPE: EXPLORING / CONFIRMING only (interpretation, no engine call)
// ALL OTHER PHASES: NOT_YET_IMPLEMENTED
//
// PROVES:
//   1. Authenticated invocation works
//   2. Canonical profile context acquisition
//   3. Canonical tos_phase read
//   4. InvokeLLM structured interpretation works
//   5. No profile mutation
//   6. No engine invocation
// ============================================================

// --- Serialization adapters (following companionService canonical pattern) ---

function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

function deserializeProfile(profile: any): any {
  const arrayFields = [
    "service_history", "goals", "operational_context", "evidence_log",
    "capability_map", "confidence_scores", "recommended_pathways",
    "safety_flags", "operational_picture_history", "milestones"
  ];
  const objectFields = [
    "assessment_confidence", "decision_factors", "soak_period",
    "communication_preferences"
  ];
  for (const f of arrayFields) { profile[f] = parseJSON(profile[f], []); }
  for (const f of objectFields) { profile[f] = parseJSON(profile[f]); }
  return profile;
}

// --- Substance threshold (locked from Packet 1) ---
const SUBSTANCE_THRESHOLD = 15;

function isSubstantive(value: any): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.length >= SUBSTANCE_THRESHOLD;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
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
    const conversation_context = body.conversation_context || [];

    const base44 = createClientFromRequest(req);

    // ==================================================
    // 1. PROFILE CONTEXT ACQUISITION
    // ==================================================

    let profile_id: string;
    let profile: any;

    if (body._test_mode === true && body.test_profile_id) {
      // TEST MODE ONLY — bypasses auth for verification
      // This path will be removed before production
      profile = await base44.asServiceRole.entities.UserProfile.get(body.test_profile_id);
      profile_id = body.test_profile_id;
    } else {
      // PRODUCTION: authenticate and find user's profile
      // Follows the proven profileBootstrap / Dashboard.jsx pattern
      const profiles = await base44.entities.UserProfile.list();
      if (profiles.length > 0) {
        profile_id = profiles[0].id;
        profile = profiles[0];
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: "NO_PROFILE",
          response_text: "I don't have your profile set up yet. Please visit your dashboard to get started, then come back and we can talk.",
          tos_phase: null,
          state_changed: false
        }), { headers: cors });
      }
    }

    // Deserialize profile (canonical adapter pattern)
    profile = deserializeProfile(profile);

    // ==================================================
    // 2. CANONICAL TOS_PHASE READ
    // ==================================================

    const tos_phase = profile.tos_phase || "UNKNOWN";

    // ==================================================
    // 3. PHASE ROUTING
    // ==================================================

    // R1-C.1A: ONLY EXPLORING and CONFIRMING are implemented
    const implemented_phases = ["EXPLORING", "CONFIRMING"];

    if (!implemented_phases.includes(tos_phase)) {
      // Safe fallback for all other phases
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about where things stand.",
        tos_phase: tos_phase,
        state_changed: false,
        orchestration_note: "NOT_YET_IMPLEMENTED"
      }), { headers: cors });
    }

    // ==================================================
    // 4. BUILD BOUNDED PROFILE CONTEXT (for LLM)
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
      "The user just said: \"" + user_message + "\"\n\n" +
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
        error: "LLM_INTERPRETATION_FAILED",
        response_text: "I'm having trouble processing that right now. Could you try again?",
        tos_phase: tos_phase,
        state_changed: false
      }), { headers: cors });
    }

    // ==================================================
    // 7. SAFETY CHECK
    // ==================================================

    if (interpretation.safety_flag === true) {
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too. Would you like to tell me more about what's going on?",
        tos_phase: tos_phase,
        state_changed: false,
        ui_cue: null
      }), { headers: cors });
    }

    // ==================================================
    // 8. AMBIGUITY CHECK
    // ==================================================

    if (interpretation.ambiguity_flag === true && interpretation.clarification_needed) {
      return new Response(JSON.stringify({
        success: true,
        response_text: "[R1-C.1A] Ambiguous - clarification needed: " + interpretation.clarification_needed,
        tos_phase: tos_phase,
        state_changed: false,
        orchestration_note: "AMBIGUOUS_INTERPRETATION",
        _internal: {
          interpretation,
          profile_context
        }
      }), { headers: cors });
    }

    // ==================================================
    // 9. R1-C.1A FOUNDATION RESPONSE
    // ==================================================

    // R1-C.1A: Return interpretation result WITHOUT calling any engine
    // No companionService call. No profile mutation. No response generation.

    const discoveries = interpretation.candidate_discoveries || [];
    const discovery_count = discoveries.length;
    const direct_count = discoveries.filter((d: any) => d.source_type === "direct_statement").length;
    const uncertain_count = discoveries.filter((d: any) => d.source_type === "uncertain").length;
    const interpreted_count = discoveries.filter((d: any) => d.source_type === "reasonable_interpretation").length;

    return new Response(JSON.stringify({
      success: true,
      response_text: "[R1-C.1A FOUNDATION] Interpretation complete. " + discovery_count + " candidate discoveries (" + direct_count + " direct, " + interpreted_count + " interpreted, " + uncertain_count + " uncertain). Intent: " + interpretation.intent + ". Response type: " + interpretation.user_response_type + ". No engine called. No profile mutation.",
      tos_phase: tos_phase,
      state_changed: false,
      orchestration_note: "R1-C.1A_FOUNDATION_ONLY",
      _internal: {
        interpretation,
        profile_context,
        discovery_summary: {
          total: discovery_count,
          direct_statement: direct_count,
          reasonable_interpretation: interpreted_count,
          uncertain: uncertain_count,
          intent: interpretation.intent,
          user_response_type: interpretation.user_response_type,
          interpretation_confidence: interpretation.interpretation_confidence,
          ambiguity_flag: interpretation.ambiguity_flag,
          safety_flag: interpretation.safety_flag
        }
      }
    }), { headers: cors });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: "ORCHESTRATOR_ERROR",
      response_text: "I'm having trouble connecting right now. Please try again in a moment.",
      tos_phase: null,
      state_changed: false,
      _internal: { error_message: error.message, error_stack: error.stack ? error.stack.slice(0, 500) : null }
    }), { status: 500, headers: cors });
  }
});
