import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { companionCore, deserializeProfile, COMPANION_CORE_VERSION } from "../shared/companionCore.ts";

// ============================================================
// smudgeOrchestrator — R1-C.1C (reconciled with deployed baseline)
//
// SCOPE: EXPLORING + CONFIRMING
// Domain processing: companionCore (shared module v1.1.0)
//
// PROVES:
//   1. user expression → LLM interpretation → deterministic validation
//   2. Validated discoveries → companionCore → authorised persistence
//   3. Orchestrator never writes UserProfile directly
//   4. Orchestrator never writes tos_phase
//   5. Lifecycle transitions owned by companionCore
//   6. companionCore version reported
//   7. Response generation via second LLM call (or deterministic fallback)
//   8. CONFIRMING phase support (lifecycle-aware response type handling)
//
// R1-C.1C-CM: Reconciled from deployed bundle to match production behaviour.
// Previous repo version was R1-C.1B-E2 (EXPLORING only, no generation).
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

// --- user_response_type downgrade (lifecycle-aware) ---
// In EXPLORING: confirming/rejecting downgraded to "answering"
// In CONFIRMING: confirming/rejecting are valid response types
function safeUserResponseType(raw: string, mode: string): { safe: string; downgraded: boolean } {
  if (mode !== "CONFIRMING" && (raw === "confirming" || raw === "rejecting")) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}

// --- Generation helpers ---

function formatAcceptedDiscoveries(d: any): string {
  if (!d || Object.keys(d).length === 0) return "nothing new saved this turn";
  return Object.entries(d).map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`).join(", ");
}

function formatRejectedDiscoveries(r: any[]): string {
  if (!r || r.length === 0) return "nothing rejected";
  return r.map((d: any) => `${d.field} (${d.reason})`).join(", ");
}

function formatLifecycleTransition(t: string | null): string {
  if (!t) return "no stage change occurred";
  const parts = t.split(" → ");
  if (parts.length === 2) return `stage changed from ${parts[0]} to ${parts[1]}`;
  return t;
}

function buildGenerationPrompt(ctx: any): string {
  const lines: string[] = [];
  lines.push("You are Smudge, a companion for people leaving the military. You are warm, practical, and unhurried. You are having a conversation, not conducting an interview.");
  lines.push("");
  lines.push(`The user just said: "${ctx.user_message}"`);
  lines.push("");
  lines.push("Here is what happened in this turn:");
  lines.push(`- What they shared that you understood and saved: ${formatAcceptedDiscoveries(ctx.accepted_discoveries)}`);
  lines.push(`- What you couldn't save (needed more clarity): ${formatRejectedDiscoveries(ctx.rejected_discoveries)}`);
  lines.push(`- What you now understand about them: ${ctx.areas_explored.length > 0 ? ctx.areas_explored.join(", ") : "still building the picture"}`);
  lines.push(`- What you still need to understand: ${ctx.areas_outstanding.length > 0 ? ctx.areas_outstanding.join(", ") : "nothing outstanding"}`);
  lines.push(`- Whether understanding is complete: ${ctx.confirmed ? "yes, they confirmed it" : ctx.ready_to_confirm ? "ready to ask if they confirm" : "not yet"}`);
  lines.push(`- Stage change: ${formatLifecycleTransition(ctx.lifecycle_transition)}`);
  if (ctx.clarification_needed) lines.push(`- Clarification needed: ${ctx.clarification_needed}`);
  if (ctx.companion_error) lines.push("- Note: something went wrong on the backend. The user's information may not have been saved. Be honest about this.");
  if (ctx.no_discoveries && !ctx.clarification_needed) lines.push("- Note: the user's message didn't include new information to save. Acknowledge their message naturally and continue the conversation.");
  lines.push("");
  lines.push("Write a natural response to the user. You MUST follow these rules:");
  lines.push("1. Only reference what the user actually said and what was understood. NEVER invent capabilities, skills, evidence, or career suitability.");
  lines.push("2. Do NOT use internal terminology — no phase names, scores, engines, confidence levels, JSON, or technical terms.");
  lines.push("3. Do NOT confirm on behalf of the user. If your understanding is complete enough to check, ASK if your picture is right — do not declaratively state it.");
  lines.push("4. Keep your response short — 1 to 3 sentences. Do not overwhelm.");
  lines.push("5. If the user asked a question, answer honestly based on what you know. If you don't know, say so.");
  lines.push("6. Do not repeat or parrot what the user just said back to them. Acknowledge briefly and move forward.");
  lines.push("7. If a stage changed, acknowledge the transition naturally. Do not announce it as a system event.");
  lines.push("8. If the user seems uncertain or hesitant, do not push. Let them go at their own pace.");
  lines.push("9. If something went wrong on the backend, be honest about it. Do not pretend everything is fine.");
  lines.push("10. Do not pretend to have military experience. You are a companion, not a veteran.");
  return lines.join("\n");
}

const generationSchema = {
  type: "object",
  properties: {
    response_text: { type: "string", description: "Natural conversational response to the user" },
    response_intent: { type: "string", enum: ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "TRANSITION_ACKNOWLEDGEMENT"] },
    asks_question: { type: "boolean", description: "Whether the response asks the user a question" }
  },
  required: ["response_text", "response_intent", "asks_question"]
};

function buildFallbackResponse(ctx: any): { response_text: string; response_intent: string; asks_question: boolean } {
  if (ctx.companion_error) {
    return { response_text: "I heard you, but something went wrong on my end. Could you say that again?", response_intent: "CLARIFY", asks_question: true };
  }
  if (ctx.clarification_needed) {
    return { response_text: "I want to make sure I understand. Could you tell me a bit more about that?", response_intent: "CLARIFY", asks_question: true };
  }
  if (ctx.lifecycle_transition && ctx.lifecycle_transition.includes("CONFIRMING") && ctx.lifecycle_transition.includes("CONFIRMED")) {
    return { response_text: "That's great — I've got your picture confirmed. We can pick up from here when you're ready.", response_intent: "TRANSITION_ACKNOWLEDGEMENT", asks_question: false };
  }
  if (ctx.lifecycle_transition && ctx.lifecycle_transition.includes("EXPLORING") && ctx.lifecycle_transition.includes("CONFIRMING")) {
    return { response_text: "I think I've got a decent picture of where you're coming from now. Before we move on, I'd like to share what I'm hearing — can I tell you what I'm picking up?", response_intent: "CONFIRMATION_PROMPT", asks_question: true };
  }
  if (ctx.no_discoveries && !ctx.clarification_needed) {
    return { response_text: "I hear you. Tell me a bit more about what's on your mind.", response_intent: "EXPLORE", asks_question: true };
  }
  return { response_text: "I hear you. Go on.", response_intent: "ACKNOWLEDGE", asks_question: false };
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
    const currentPhase = profile.tos_phase || "EXPLORING";

    // ==================================================
    // 2. PHASE ROUTING — EXPLORING + CONFIRMING
    // ==================================================

    if (currentPhase !== "EXPLORING" && currentPhase !== "CONFIRMING") {
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about where things stand.",
        response_intent: "ACKNOWLEDGE", asks_question: false,
        tos_phase: currentPhase, state_changed: false,
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
      "You are in the " + currentPhase + " phase of the MATE journey.\n\n" +
      "Your role: listen, understand, and identify what the user is sharing. " +
      "You are NOT an advisor yet. You are building understanding.\n\n" +
      "Current profile context:\n" +
      "- Phase: " + currentPhase + "\n" +
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
        success: false, tos_phase: currentPhase, state_changed: false,
        response_text: "Something went wrong on my end. Could you try again?",
        response_intent: "CLARIFY", asks_question: true,
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
        success: true,
        response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
        response_intent: "CLARIFY", asks_question: true,
        tos_phase: currentPhase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: null,
        orchestration_note: "SAFETY_PATH_NO_ENGINE_CALL",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 7. FLOW CONTROL — single return with skip flag
    // g = true means skip companionCore and persistence
    // ==================================================

    let g = false; // skip flag
    let h: any = {}; // accepted discoveries
    let v: any[] = []; // rejected discoveries
    let R = interpretation.user_response_type || "answering"; // safe response type
    let E = false; // response type downgraded
    let T: any = null; // companionCore result
    let m: any = {
      tos_phase_before: currentPhase,
      tos_phase_after: currentPhase,
      state_changed: false,
      clarification_needed: null as string | null,
      no_discoveries: false,
      companion_error: false,
      accepted_discoveries: {} as any,
      rejected_discoveries: [] as any[],
      areas_explored: areas_explored,
      areas_outstanding: areas_outstanding,
      lifecycle_transition: null as string | null,
      ready_to_reflect: false,
      ready_to_confirm: false,
      confirmed: false
    };

    // ==================================================
    // 8. AMBIGUITY CHECK — no persistence if ambiguous
    // ==================================================

    if (interpretation.ambiguity_flag === true) {
      m.clarification_needed = interpretation.clarification_needed || "Could you tell me a bit more about that?";
      m.rejected_discoveries = (interpretation.candidate_discoveries || []).map((d: any) => ({
        field: d.field, value: d.value, reason: "AMBIGUOUS_INTERPRETATION"
      }));
      g = true;
    }

    // ==================================================
    // 9. DETERMINISTIC VALIDATION GATE
    // ==================================================

    if (!g) {
      const allDiscoveries = interpretation.candidate_discoveries || [];
      const { new_discoveries, rejected } = buildNewDiscoveries(allDiscoveries);
      h = new_discoveries;
      v = rejected;
      m.rejected_discoveries = v;

      const hasNonDirect = allDiscoveries.some((d: any) =>
        d.source_type === "reasonable_interpretation" || d.source_type === "uncertain");

      if (hasNonDirect && Object.keys(h).length === 0) {
        m.clarification_needed = "I want to make sure I understand correctly. Could you tell me a bit more about that?";
        g = true;
      } else if (hasNonDirect) {
        m.clarification_needed = "Some of what you've said is clear, but I want to understand the rest better. Could you tell me more?";
        g = true;
      } else if (allDiscoveries.length === 0) {
        // CONFIRMING special case: no discoveries but confirming/rejecting response type
        const { safe, down } = safeUserResponseType(R, currentPhase);
        R = safe;
        E = down;
        if (currentPhase === "CONFIRMING" && (R === "confirming" || R === "rejecting")) {
          h = { years_served: profile.years_served ?? 0 };
        } else {
          m.no_discoveries = true;
          g = true;
        }
      }
    }

    // ==================================================
    // 10. USER_RESPONSE_TYPE DOWNGRADE (if not already done)
    // ==================================================

    if (!g) {
      const { safe, down } = safeUserResponseType(R, currentPhase);
      R = safe;
      E = down;
    }

    // ==================================================
    // 11. COMPANIONCORE CALL (shared domain logic)
    // Orchestrator provides narrow persistence capability.
    // companionCore decides and executes persistence.
    // ==================================================

    if (!g && Object.keys(h).length > 0) {
      try {
        T = await companionCore({
          profile,
          currentMode: currentPhase === "CONFIRMING" ? "CONFIRMING" : "EXPLORING",
          newDiscoveries: h,
          userResponseType: R,
          persist: (id: string, payload: any) => base44.asServiceRole.entities.UserProfile.update(id, payload),
        });

        const companionPhase = T.mergedProfile?.tos_phase || currentPhase;
        m.tos_phase_after = companionPhase;
        m.state_changed = companionPhase !== currentPhase;
        m.accepted_discoveries = h;
        m.lifecycle_transition = m.state_changed ? `${currentPhase} → ${companionPhase}` : null;
        m.areas_explored = T.guidance?.areas_with_substance || areas_explored;
        m.areas_outstanding = T.guidance?.areas_missing || areas_outstanding;
        m.ready_to_reflect = T.engineResult?.ready_for_confirmation || false;
        m.ready_to_confirm = T.session?.mode === "CONFIRMING" || false;
        m.confirmed = T.session?.confirmed === true || companionPhase === "CONFIRMED";
      } catch {
        m.companion_error = true;
      }
    }

    // ==================================================
    // 12. RESPONSE GENERATION (second LLM call or fallback)
    // ==================================================

    let responseText = "";
    let responseIntent = "ACKNOWLEDGE";
    let asksQuestion = false;
    let generationFallback = false;

    const genContext = {
      user_message,
      accepted_discoveries: m.accepted_discoveries,
      rejected_discoveries: m.rejected_discoveries,
      areas_explored: m.areas_explored,
      areas_outstanding: m.areas_outstanding,
      confirmed: m.confirmed,
      ready_to_confirm: m.ready_to_confirm,
      lifecycle_transition: m.lifecycle_transition,
      clarification_needed: m.clarification_needed,
      companion_error: m.companion_error,
      no_discoveries: m.no_discoveries
    };

    try {
      const generation = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: buildGenerationPrompt(genContext),
        response_json_schema: generationSchema
      });

      if (generation && typeof generation === "object" &&
          typeof generation.response_text === "string" &&
          generation.response_text.trim().length > 0) {
        responseText = generation.response_text.trim();
        responseIntent = ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "TRANSITION_ACKNOWLEDGEMENT"]
          .includes(generation.response_intent) ? generation.response_intent : "ACKNOWLEDGE";
        asksQuestion = generation.asks_question === true;
      } else {
        generationFallback = true;
      }
    } catch {
      generationFallback = true;
    }

    if (generationFallback) {
      const fallback = buildFallbackResponse(genContext);
      responseText = fallback.response_text;
      responseIntent = fallback.response_intent;
      asksQuestion = fallback.asks_question;
    }

    // ==================================================
    // 13. SINGLE RETURN
    // ==================================================

    return new Response(JSON.stringify({
      success: true,
      response_text: responseText,
      response_intent: responseIntent,
      asks_question: asksQuestion,
      tos_phase: m.tos_phase_after,
      state_changed: m.state_changed,
      clarification_needed: m.clarification_needed,
      generation_fallback: generationFallback,
      candidate_discoveries_count: (interpretation.candidate_discoveries || []).length,
      accepted_discoveries_count: Object.keys(h).length,
      rejected_discoveries: m.rejected_discoveries,
      companion_result: T ? {
        session: T.session || null,
        engine_result: T.engineResult || null,
        areas_with_substance: T.guidance?.areas_with_substance || [],
        areas_missing: T.guidance?.areas_missing || [],
        ready_for_confirmation: T.engineResult?.ready_for_confirmation || false,
        lifecycle_transition: m.lifecycle_transition
      } : null,
      recoverable_error: m.companion_error ? "COMPANION_CORE_ERROR" : null,
      orchestration_note: m.companion_error
        ? "COMPANION_CORE_FAILED"
        : g && m.clarification_needed
        ? "CLARIFICATION_PATH"
        : g && m.no_discoveries
        ? "NO_DISCOVERIES"
        : "R1-C.1C_GENERATED",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: {
        validation_decisions: {
          gate: "DIRECT_STATEMENT_HIGH_CONFIDENCE_ONLY",
          accepted_fields: Object.keys(h),
          rejected: m.rejected_discoveries
        },
        raw_user_response_type: interpretation.user_response_type,
        response_type_downgraded: E,
        safe_user_response_type: R,
        persistence_model: "COMPANION_CORE_NARROW_CALLBACK",
        generation: {
          intent: responseIntent,
          asks_question: asksQuestion,
          fallback: generationFallback,
          context_phase_before: m.tos_phase_before,
          context_phase_after: m.tos_phase_after
        }
      }
    }), { headers: cors });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      tos_phase: null, state_changed: false,
      response_text: "Something went wrong on my end. Could you try again?",
      response_intent: "CLARIFY", asks_question: true,
      generation_fallback: true,
      candidate_discoveries_count: 0, accepted_discoveries_count: 0,
      companion_result: null, recoverable_error: "ORCHESTRATOR_ERROR",
      orchestration_note: "EXCEPTION",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: { error_message: error.message }
    }), { status: 500, headers: cors });
  }
});
