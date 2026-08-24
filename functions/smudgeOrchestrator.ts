import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { companionCore, deserializeProfile, COMPANION_CORE_VERSION } from "../shared/companionCore.ts";

// ============================================================
// smudgeOrchestrator — R1-C.1D-G2 (SMUDGE MVP Correction Packet Groups 1 + 2)
//
// SCOPE: EXPLORING + CONFIRMING
// Domain processing: companionCore (shared module v1.1.0 — unchanged)
//
// GROUP 1 CORRECTIONS (G1 — deployed, regression PASS):
//   1. Identity Integrity (P0) — strengthened Rule 10 + post-gen validation
//   3. Grounded Understanding (P0) — profile content + evidence state to gen
//   4. Orientation Before Exploration (P1) — orientation context in prompt
//   5. Conductor Behaviour (P1) — reframed context + act variety rules
//   6. Language Variety (P1) — anti-repetition rule
//   7. Profile Bootstrap (P1) — auto-create on NO_PROFILE
//
// GROUP 2 CORRECTIONS (G2 — safety clarification):
//   R1. recent_context — frontend passes 3-4 recent exchanges for context
//   R2. safety_classification — three-way enum (none/clear_concern/ambiguous)
//   R3. safety classification call — when pending, separate LLM call
//   R4. recovery semantics — benign clears pending, no discoveries
//   R5. clarification generation — natural, non-diagnostic, mirrors words
//
// FROZEN: companionCore, lifecycle, persistence, engines, entity schemas
// ============================================================


// ============================================================
// R1-C.1D CONVERSATION AWARENESS — ConversationState helpers
// All changes are additive. Failure degrades gracefully to pre-awareness behaviour.
// ============================================================

// Deserialize ConversationState JSON-string fields to native
function deserializeConversationState(raw: any): any {
  if (!raw) return null;
  const s = { ...raw };
  // Array fields come as JSON strings from SDK
  const arrayFields = ['topics_covered', 'topics_closed'];
  for (const f of arrayFields) {
    if (typeof s[f] === 'string') {
      try { s[f] = JSON.parse(s[f]); } catch { s[f] = []; }
    }
    if (!Array.isArray(s[f])) s[f] = [];
  }
  return s;
}

// Default ConversationState for new sessions
function defaultConversationState(profileId: string): any {
  return {
    user_profile_id: profileId,
    current_focus: null,
    conversation_mode: "understanding",
    user_objective: null,
    topics_covered: [],
    topics_closed: [],
    last_smudge_response: null,
    last_smudge_intent: null,
    last_interaction_date: new Date().toISOString(),
    session_started_date: new Date().toISOString()
  };
}

// [R2][R3][R5] Confidence-gated state derivation
// Derives updated ConversationState from interpretation signals BEFORE generation.
// Returns { derived: state, is_returning: boolean, session_reset: boolean }
function deriveConversationState(
  existing: any,
  interpretation: any,
  companionResult: any,
  currentPhase: string
): { derived: any; is_returning: boolean; session_reset: boolean } {
  const now = new Date();
  const nowIso = now.toISOString();

  // Check session boundary (30 min inactivity)
  let is_returning = false;
  let session_reset = false;
  let sessionStartedDate = existing.session_started_date || nowIso;

  if (existing.last_interaction_date) {
    const lastDate = new Date(existing.last_interaction_date);
    const diffMs = now.getTime() - lastDate.getTime();
    const diffMin = diffMs / 60000;
    if (diffMin > 30) {
      is_returning = true;
      sessionStartedDate = nowIso;
      session_reset = true;
    }
  }

  // 7-day mode reset (long break = fresh start on mode)
  let conversationMode = existing.conversation_mode || "understanding";
  if (existing.last_interaction_date) {
    const lastDate = new Date(existing.last_interaction_date);
    const diffDays = (now.getTime() - lastDate.getTime()) / 86400000;
    if (diffDays > 7) {
      conversationMode = "understanding";
    }
  }

  // Clone existing state as the base
  const derived: any = {
    user_profile_id: existing.user_profile_id,
    current_focus: existing.current_focus || null,
    conversation_mode: conversationMode,
    user_objective: existing.user_objective || null,
    topics_covered: Array.isArray(existing.topics_covered) ? [...existing.topics_covered] : [],
    topics_closed: Array.isArray(existing.topics_closed) ? [...existing.topics_closed] : [],
    last_smudge_response: existing.last_smudge_response || null,  // will be updated after generation
    last_smudge_intent: existing.last_smudge_intent || null,       // will be updated after generation
    last_interaction_date: nowIso,
    session_started_date: sessionStartedDate
  };

  // Get interpretation confidence and signals
  const conf = interpretation?.interpretation_confidence || "low";
  const topicSignal = interpretation?.topic_signal || "none";
  const topicLabel = interpretation?.topic_label || "";
  const helpRequest = interpretation?.help_request || "";
  const userObjectiveSignal = interpretation?.user_objective_signal || "";

  // [R3] "closed" always applies (explicit by nature)
  if (topicSignal === "closed" && topicLabel) {
    if (!derived.topics_closed.includes(topicLabel)) {
      derived.topics_closed.push(topicLabel);
    }
  }

  // R1-C.1E PACKET 2: Lower threshold for topics_covered — "topic discussed" not "high-confidence evidence"
  // Topic is "discussed" if topic_label is present AND (non-"none" signal OR discoveries this turn)
  const discoveries = interpretation?.candidate_discoveries || [];
  const hasContent = discoveries.length > 0 || topicSignal !== "none";
  if (topicLabel && hasContent) {
    const existingTopic = derived.topics_covered.find((t: any) => t.topic === topicLabel);
    if (!existingTopic) {
      const summaryParts = discoveries
        .filter((d: any) => d.confidence === "high")
        .map((d: any) => `${d.field}: ${d.value}`)
        .slice(0, 3);
      const summary = summaryParts.length > 0 ? summaryParts.join("; ") : "discussed";
      derived.topics_covered.push({ topic: topicLabel, summary });
    }
  }

  // [R2] "shifted" requires moderate+ confidence
  if (topicSignal === "shifted" && topicLabel && (conf === "high" || conf === "moderate")) {
    derived.current_focus = topicLabel;
  }

  // [R2] help_request requires moderate+ confidence
  if (helpRequest && (conf === "high" || conf === "moderate")) {
    derived.conversation_mode = "helping";
    derived.user_objective = helpRequest;
  }

  // [R2] user_objective_signal requires moderate+ confidence
  if (userObjectiveSignal && (conf === "high" || conf === "moderate")) {
    derived.user_objective = userObjectiveSignal;
  }

  // [R5] Low-confidence no-overwrite guard: on low confidence, all signal-derived fields
  // retain existing values (already handled by only applying on high/moderate above).
  // Only last_interaction_date and session_started_date are always updated.

  // [C2] helping -> understanding: ONLY on explicit signal
  // User must explicitly signal return to discovery
  if (existing.conversation_mode === "helping" && derived.conversation_mode === "helping") {
    // Check if user explicitly signaled return to discovery
    if (!helpRequest && topicSignal === "closed" && userObjectiveSignal &&
        (userObjectiveSignal.toLowerCase().includes("know") ||
         userObjectiveSignal.toLowerCase().includes("understand") ||
         userObjectiveSignal.toLowerCase().includes("explore") ||
         userObjectiveSignal.toLowerCase().includes("figure out")) &&
        (conf === "high" || conf === "moderate")) {
      derived.conversation_mode = "understanding";
    }
  }

  // Lifecycle-driven transition: CONFIRMED -> transitioning (always, deterministic)
  if (companionResult) {
    const companionPhase = companionResult.mergedProfile?.tos_phase || currentPhase;
    if (companionPhase === "CONFIRMED" && currentPhase !== "CONFIRMED") {
      derived.conversation_mode = "transitioning";
    }
  }

  return { derived, is_returning, session_reset };
}

// Build conversation awareness context string for generation prompt
function buildConversationAwareness(ctx: any): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("CONVERSATION AWARENESS — what you know about where the conversation is:");
  lines.push(`- What you said last: "${ctx.last_smudge_response || '(first message)'}"`);
  lines.push(`- Your last conversational act: ${ctx.last_smudge_intent || "none"}`);
  lines.push(`- What the conversation is about right now: ${ctx.current_focus || "getting to know each other"}`);
  lines.push(`- What the user is trying to achieve: ${ctx.user_objective || "not yet expressed"}`);
  const coveredTopics = Array.isArray(ctx.topics_covered) ? ctx.topics_covered.map((t: any) => t.topic) : [];
  lines.push(`- Topics you've already covered: ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "none yet"}`);
  const closedTopics = Array.isArray(ctx.topics_closed) ? ctx.topics_closed : [];
  lines.push(`- Topics the user has closed (do NOT reopen these without reason): ${closedTopics.length > 0 ? closedTopics.join(", ") : "none"}`);
  lines.push(`- Conversation mode: ${ctx.conversation_mode}`);
  if (ctx.is_returning_user) {
    lines.push("- The user is returning after a break. They may need a brief, natural recap of where you were.");
  }
  lines.push("");
  lines.push("The conversation state above reflects the user's CURRENT message, including any topic closures or focus changes they just signaled.");
  return lines.join("\n");
}

// Truncate last_smudge_response to 1000 chars [C4]
function truncateResponse(text: string): string {
  if (!text) return "";
  return text.length > 1000 ? text.substring(0, 1000) : text;
}

// --- Substance threshold (for profile context building only) ---
const SUBSTANCE_THRESHOLD = 15;

function isSubstantive(value: any): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.length >= SUBSTANCE_THRESHOLD;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

// --- R1-C.1E: Deterministic validation gate ---
// SKIP_FIELDS removed — service_history and operational_context now extractable
const ACCEPTABLE_SOURCE_TYPES = ["direct_statement"];
const ACCEPTABLE_CONFIDENCE = ["high"];

// R1-C.1E: user_confidence must be numeric (amendment #3 — no qualitative conversion)
function mapDiscoveryValue(field: string, value: string): any {
  if (field === "years_served") {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }
  if (field === "user_confidence") {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;  // Don't store qualitative strings
  }
  return value;
}

// R1-C.1E: buildNewDiscoveries — handles structured_value, evidence_log with UUIDs, no SKIP_FIELDS
function buildNewDiscoveries(discoveries: any[]): { new_discoveries: any; rejected: any[] } {
  const accepted: any = {};
  const rejected: any[] = [];
  const goalsList: string[] = [];
  const evidenceLog: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const d of discoveries) {
    if (!ACCEPTABLE_SOURCE_TYPES.includes(d.source_type)) {
      rejected.push({ field: d.field, value: d.value, reason: "SOURCE_TYPE_NOT_DIRECT_STATEMENT" });
      continue;
    }
    if (!ACCEPTABLE_CONFIDENCE.includes(d.confidence)) {
      rejected.push({ field: d.field, value: d.value, reason: "CONFIDENCE_NOT_HIGH" });
      continue;
    }

    // R1-C.1E: Handle structured values for service_history and operational_context
    if (d.field === "service_history" && d.structured_value && typeof d.structured_value === "object") {
      if (!accepted.service_history) accepted.service_history = [];
      accepted.service_history.push(d.structured_value);
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: "Discovery conversation — service_history",
        content: JSON.stringify(d.structured_value),
        source_text: d.source_text || "",
        recorded_date: today
      });
    } else if (d.field === "operational_context" && d.structured_value && typeof d.structured_value === "object") {
      if (!accepted.operational_context) accepted.operational_context = [];
      accepted.operational_context.push(d.structured_value);
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: "Discovery conversation — operational_context",
        content: JSON.stringify(d.structured_value),
        source_text: d.source_text || "",
        recorded_date: today
      });
    } else if (d.field === "goals") {
      goalsList.push(d.value);
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: "Discovery conversation — goals",
        content: d.value,
        source_text: d.source_text || "",
        recorded_date: today
      });
    } else {
      const mappedValue = mapDiscoveryValue(d.field, d.value);
      if (mappedValue === null) {
        // R1-C.1E: user_confidence non-numeric — reject (amendment #3)
        rejected.push({ field: d.field, value: d.value, reason: "USER_CONFIDENCE_NOT_NUMERIC" });
        continue;
      }
      accepted[d.field] = mappedValue;
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: `Discovery conversation — ${d.field}`,
        content: d.value,
        source_text: d.source_text || "",
        recorded_date: today
      });
    }
  }
  if (goalsList.length > 0) {
    accepted.goals = goalsList;
  }
  if (evidenceLog.length > 0) {
    accepted.evidence_log = evidenceLog;
  }
  return { new_discoveries: accepted, rejected };
}

// --- user_response_type downgrade (lifecycle-aware) ---
function safeUserResponseType(raw: string, mode: string): { safe: string; downgraded: boolean } {
  if (mode !== "CONFIRMING" && (raw === "confirming" || raw === "rejecting")) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}

// --- CORRECTION 3: Build profile content summary for generation context ---
function buildProfileContext(profile: any): string {
  const parts: string[] = [];
  if (isSubstantive(profile.service_branch)) parts.push(`- Service: ${profile.service_branch}`);
  if (isSubstantive(profile.rank)) parts.push(`- Rank: ${profile.rank}`);
  if (profile.years_served !== null && profile.years_served !== undefined) parts.push(`- Years served: ${profile.years_served}`);
  if (isSubstantive(profile.professional_identity)) parts.push(`- Professional identity: ${profile.professional_identity}`);
  if (isSubstantive(profile.personal_context)) parts.push(`- Current circumstances: ${profile.personal_context}`);
  if (Array.isArray(profile.goals) && profile.goals.length > 0) parts.push(`- Goals: ${profile.goals.join("; ")}`);
  // R1-C.1E: Only render numeric confidence, not qualitative strings
  if (typeof profile.user_confidence === "number") parts.push(`- Self-reported confidence: ${profile.user_confidence}/10`);
  return parts.length > 0 ? parts.join("\n") : "- No profile content yet — you are still getting to know this person.";
}

// --- CORRECTION 1: Post-generation validation patterns ---
const IDENTITY_VIOLATION_PATTERNS = [
  /\bI served\b/i,
  /\bI was in (the )?(army|navy|raf|marines|royal)\b/i,
  /\bI was in for\b/i,
  /\bmy time in\b/i,
  /\bwhen I was in\b/i,
  /\bmy service\b/i,
  /\bI deployed\b/i,
  /\bI was (posted|based|stationed)\b/i,
  /\bmy (regiment|battalion|squad|section|platoon|company)\b/i,
  /\bI did .* tour/i,
  /\bI was a (private|lance corporal|corporal|sergeant|staff sergeant|colour sergeant|warrant|officer|lieutenant|captain|major|colonel|general)\b/i
];

// --- CORRECTION 3: Ungrounded understanding claim patterns ---
const UNGROUNDED_CLAIM_PATTERNS = [
  /\bI'?ve got a (good|clear|decent|solid|great) picture\b/i,
  /\bI understand your (transition|journey|situation)\b/i,
  /\bI can see your (transition|journey|situation)\b/i,
  /\bI'?ve got you (figured out|worked out|sussed)\b/i
];

function validateGeneration(text: string, evidenceSufficient: boolean): { valid: boolean; violation: "identity" | "grounding" | null } {
  for (const pattern of IDENTITY_VIOLATION_PATTERNS) {
    if (pattern.test(text)) return { valid: false, violation: "identity" };
  }
  if (!evidenceSufficient) {
    for (const pattern of UNGROUNDED_CLAIM_PATTERNS) {
      if (pattern.test(text)) return { valid: false, violation: "grounding" };
    }
  }
  return { valid: true, violation: null };
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

// --- R1-C.1D-CONDUCTOR: Authoritative intent mapping ---
// Uses interpretation.intent (already computed, previously discarded) to set
// an authoritative response_intent that generation MUST follow.
// answering / other / seeking_reassurance / sharing_milestone → null (flexible, normal generation)
function mapAuthoritativeIntent(rawIntent: string): string | null {
  if (rawIntent === "expressing_frustration") return "STOP_EXPLORING";
  if (rawIntent === "asking_orientation") return "EXPLAIN";
  if (rawIntent === "correcting") return "ACCEPT_CORRECTION";
  return null;
}

function buildGenerationPrompt(ctx: any): string {
  const lines: string[] = [];
  lines.push("You are Smudge, a companion for people leaving the military.");
  lines.push("You are the same person in every conversation — warm, practical, unhurried.");
  lines.push("What you focus on changes depending on where the person is in their journey.");
  lines.push(`Right now they are in the ${ctx.canonical_phase} stage. Adapt your focus to match, but never change who you are.`);
  lines.push("");
  lines.push("What MATE is: a companion service for people leaving the military. It helps them understand who they are outside the forces, what they're good at, and what their options might be. It's not a form, a test, or an interview — it's a conversation.");
  lines.push("What your job is: to have real conversations. Listen, understand, and help the person see their own capability. You're not an advisor, an assessor, or a form-filler. You're a companion.");
  lines.push("");
  lines.push("You are having a conversation, not conducting an interview.");
  lines.push("You speak like a person, not a model — short sentences, everyday words, start with the point not the setup.");
  lines.push("No corporate language. No therapy-speak. No \"what I'm hearing from you is.\" No \"that's a really important point.\"");
  lines.push("If a word wouldn't come out of someone's mouth in a pub, don't use it here.");
  lines.push("Vary your sentence length — some responses are one sentence, some are three, none are paragraphs.");
  lines.push("");
  lines.push(`The user just said: "${ctx.user_message}"`);
  lines.push("");
  lines.push("Here is what happened in this turn:");
  lines.push(`- What they shared that you understood and saved: ${formatAcceptedDiscoveries(ctx.accepted_discoveries)}`);
  lines.push(`- What you couldn't save (needed more clarity): ${formatRejectedDiscoveries(ctx.rejected_discoveries)}`);
  lines.push(`- What you actually know about this person so far:`);
  lines.push(ctx.profile_content);
  // R1-C.1D CONVERSATION AWARENESS
  if (ctx.conversation_awareness) lines.push(ctx.conversation_awareness);
  if (ctx.recent_context_for_gen) lines.push(ctx.recent_context_for_gen);
  lines.push(`- Areas you haven't explored yet (for your awareness, not a checklist to work through): ${ctx.areas_outstanding.length > 0 ? ctx.areas_outstanding.join(", ") : "all areas explored"}`);
  lines.push(`- Whether understanding is complete: ${ctx.confirmed ? "yes, they confirmed it" : ctx.ready_to_confirm ? "ready to ask if they confirm" : "not yet — still building"}`);
  lines.push(`- Stage change: ${formatLifecycleTransition(ctx.lifecycle_transition)}`);
  if (ctx.clarification_needed) lines.push(`- Clarification needed: ${ctx.clarification_needed}`);
  if (ctx.companion_error) lines.push("- Note: something went wrong on the backend. The user's information may not have been saved. Be honest about this.");
  if (ctx.no_discoveries && !ctx.clarification_needed) lines.push("- Note: the user's message didn't include new information to save. Acknowledge their message naturally and continue the conversation.");
  if (ctx.behavioural_notes && ctx.behavioural_notes.length > 0) {
    lines.push(`- Behavioural guidance: ${ctx.behavioural_notes.join(" | ")}`);
  }
  lines.push("");
  // R1-C.1D-CONDUCTOR: Authoritative intent — overrides discovery pressure
  if (ctx.authoritative_intent) {
    lines.push("AUTHORITATIVE INTENT — this overrides everything else for this turn:");
    if (ctx.authoritative_intent === "STOP_EXPLORING") {
      lines.push("The user is frustrated, confused, or pushing back. STOP exploring. Do NOT ask another discovery question. Acknowledge their frustration directly, change your approach, and give them space if they need it. You can acknowledge, reassure, explain, or simply stop — but do not probe.");
    } else if (ctx.authoritative_intent === "EXPLAIN") {
      lines.push("The user is asking what MATE or Smudge is, or what this conversation is for. Answer directly and plainly. Do NOT pivot to a discovery question. They need to understand what this is before they will share anything meaningful.");
    } else if (ctx.authoritative_intent === "ACCEPT_CORRECTION") {
      lines.push("The user is correcting you. Accept it, recalibrate, and move forward. Do NOT defend, reinterpret, or minimise. If you made an error, own it directly: \"I got that wrong.\" Do not ask a discovery question this turn.");
    }
    lines.push("The areas_outstanding and behavioural_notes below are context only — they must NOT override this intent. Do not ask a discovery question this turn.");
    lines.push("");
  }
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
  lines.push("10. You have NEVER served in the military. You are NOT a veteran. You do NOT have military experience, personal service history, or lived experience of the forces. If asked about your own background, say you're a companion who helps service leavers — nothing more. Never fabricate military biography, rank, regiment, or deployment history.");
  lines.push("11. Use mini acknowledgements between answers — \"Got you\", \"Makes sense\", \"Right\" — not full reflections. Save reflections for milestones: a significant personal disclosure, connecting two themes the user hasn't linked, or before transitioning to a new area. Do not reflect after every answer.");
  lines.push("12. If the behavioural guidance says an area has reached substance, move toward closure. Use a checkpoint like \"I think I've got a good picture of that now — anything else before we move on?\" Do not keep probing the same area. If the user signals boredom or frustration, close the topic immediately.");
  lines.push("13. Let questions chain naturally — two or three on a related thread before any reflection. Vary the rhythm. Not every exchange is the same shape. If the user is on a roll, follow it rather than redirecting.");
  lines.push("14. Be curious, not a checklist. If the user naturally covers something you hadn't planned to ask, follow it. The suggested next area is a suggestion, not a script. Understanding is measured by quality, not quantity.");
  lines.push("15. Mirror the user's level of military language. If they say \"shell scrape,\" say \"shell scrape.\" If they say \"SOPs,\" say \"SOPs.\" Do not manufacture military slang or imply service experience. Authenticity follows the individual — it is not a military caricature.");
  lines.push("16. Do not manufacture emotional states or interpretations unsupported by what the user actually said. If they said they enjoy problem-solving, do not interpret that as everything feeling heavy. Stay grounded in their evidence.");
  lines.push("17. If the user corrects you — \"I think you're putting too much weight on that\" — accept it, recalibrate, and move forward. Do not defend or reinterpret the original assumption. If you made an error about your own identity or claims, own it directly: \"I got that wrong\" — do not frame it as a misunderstanding.");
  lines.push("18. Do not claim to have a 'good picture', 'clear picture', or say 'I understand your transition' unless the evidence state explicitly says understanding is complete. If you are still building the picture, say so honestly. The profile content above is what you actually know — do not claim more than it contains.");
  lines.push("19. If the user asks what MATE is, what you do, or what this conversation is for — answer directly and plainly. Do not pivot to a discovery question. They need to understand what this is before they will share anything meaningful.");
  lines.push("20. Do not default to acknowledgement + question every turn. You can: acknowledge briefly, explain something, reassure, close a topic, change direction, pause and let them think, or simply respond to what they said. The 'areas you haven't explored' are for your awareness — they are not a checklist to work through sequentially. Decide what the conversation needs next, not what the next question should be. If the user says 'that covers it' or similar, move on — do not keep probing.");
  lines.push("21. If the user is frustrated, confused, or pushing back — stop exploring. Acknowledge their frustration directly. Change your approach. If they need orientation, give it. If they need space, give it. The conversation itself may have become the problem — fix that before continuing.");
  lines.push("22. Vary your acknowledgements. Do not use the same opening word or phrase more than twice in a row. Sometimes do not acknowledge at all — just respond to what they said. 'Got you', 'Makes sense', 'Right', 'Fair enough' — all fine, but not every time and not in sequence.");
  // R1-C.1D CONVERSATION AWARENESS rules
  lines.push("23. You can see what you said last turn and what topics you've covered. Do NOT repeat information from previous turns. Do NOT reopen topics the user has closed. If the user is returning after a break, briefly and naturally acknowledge where you were — do not restart from scratch.");
  lines.push("24. If the conversation mode is \"helping\", the user has asked for help with something. Help them. Do not ask another discovery question unless they explicitly invite it. If the mode is \"understanding\", continue building understanding — but do not ask about topics already covered or closed.");
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
  // R1-C.1D-CONDUCTOR: Authoritative intent in fallback
  if (ctx.authoritative_intent === "STOP_EXPLORING") {
    return { response_text: "I hear you. Let's take a breather — we can come back to this whenever you're ready.", response_intent: "ACKNOWLEDGE", asks_question: false };
  }
  if (ctx.authoritative_intent === "EXPLAIN") {
    return { response_text: "MATE is a companion service for people leaving the military. It helps you understand who you are outside the forces, what you're good at, and what your options might be. It's a conversation, not a form or a test.", response_intent: "ACKNOWLEDGE", asks_question: false };
  }
  if (ctx.authoritative_intent === "ACCEPT_CORRECTION") {
    return { response_text: "You're right, I got that wrong. Let me recalibrate.", response_intent: "ACKNOWLEDGE", asks_question: false };
  }
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

// ============================================================
// GROUP 2: SAFETY CLARIFICATION FUNCTIONS
// These operate BEFORE phase routing and companionCore.
// No lifecycle, persistence (except safety_flags), or engine interaction.
// ============================================================

// R1: Build safety context from recent exchanges + profile
function buildSafetyContext(profile: any, recentContext: any): string {
  const parts: string[] = [];
  if (recentContext && Array.isArray(recentContext) && recentContext.length > 0) {
    parts.push("Recent conversation:");
    for (const msg of recentContext.slice(-4)) {
      parts.push(`${msg.role === "user" ? "User" : "Smudge"}: ${msg.text}`);
    }
  }
  if (isSubstantive(profile.service_branch)) parts.push(`Service: ${profile.service_branch}`);
  if (isSubstantive(profile.personal_context)) parts.push(`Current situation: ${profile.personal_context}`);
  parts.push(`Phase: ${profile.tos_phase || "EXPLORING"}`);
  return parts.length > 0 ? parts.join("\n") : "No additional context available.";
}

// R3: Safety classification schema (for pending state evaluation)
const safetyClassificationSchema = {
  type: "object",
  properties: {
    classification: { type: "string", enum: ["benign", "concern", "ambiguous"] },
    response_text: { type: "string", description: "Natural response (required for benign and ambiguous, not for concern)" }
  },
  required: ["classification"]
};

// R3: Safety classification call — evaluates user's response to clarification
async function safetyClassificationCall(base44: any, userMessage: string, safetyFlags: any, recentContext: any, profile: any): Promise<{ classification: string; response_text: string }> {
  const contextStr = buildSafetyContext(profile, recentContext);
  const prompt = `You are Smudge, a companion for military service leavers.

The user previously said something that was flagged for safety: "${safetyFlags.trigger_phrase || ""}"

Context at the time: ${safetyFlags.trigger_context || "No additional context available."}

The user has now responded: "${userMessage}"

Classify this response:
- "benign": The user has established that their original statement was not about self-harm or crisis. They meant something everyday (ending a shift, calling it a day, etc.). Generate a natural, brief acknowledgment. Do not make it dramatic — they were never in crisis.
- "concern": The user's response confirms or maintains genuine crisis intent or self-harm risk. Anger, frustration, profanity, hostility, or self-deprecating language WITHOUT expressed self-harm intent is NOT concern — classify as "benign" if the user is clearly angry or frustrated but not in crisis. If genuine uncertainty remains between anger/frustration and safety risk, classify as "ambiguous". Do NOT generate a response — the system will handle this with a safety pathway.
- "ambiguous": The meaning is still genuinely unclear. Generate a short, natural clarification. Do NOT diagnose, dramatise, or put suicidal intent into the user's mouth. Mirror their own words. Example: "When you say 'ending it', what do you mean, mate?"

Conservative backstop: when uncertainty cannot safely be resolved, classify as "ambiguous". Safety wins.

Context for your assessment:
${contextStr}`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: safetyClassificationSchema
  });

  return {
    classification: result?.classification || "ambiguous",
    response_text: result?.response_text || ""
  };
}

// R5: Generate initial clarification (when interpretation returns "ambiguous")
async function generateClarification(base44: any, userMessage: string, profile: any, recentContext: any): Promise<string> {
  const contextStr = buildSafetyContext(profile, recentContext);
  const prompt = `You are Smudge, a companion for military service leavers.

The user just said: "${userMessage}"

Context:
${contextStr}

This message could have a concerning meaning (self-harm, crisis) or a benign one. You cannot tell which. You need to ask a short, natural clarification.

Rules:
- Do NOT diagnose or dramatise
- Do NOT put suicidal intent into the user's mouth
- Mirror the user's own words
- Short, natural, direct
- No clinical language
- Example: "When you say 'ending it', what do you mean, mate?"

Write a single clarifying question. Keep it to one sentence.`;

  const clarificationSchema = {
    type: "object",
    properties: {
      response_text: { type: "string", description: "Short, natural clarifying question" }
    },
    required: ["response_text"]
  };

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: clarificationSchema
  });

  return result?.response_text || "Can you help me understand what you mean by that?";
}

// ============================================================
// MAIN HANDLER
// ============================================================

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
    const recent_context = body.recent_context || null;  // R1: Frontend passes 3-4 recent exchanges
    const base44 = createClientFromRequest(req);

    // ==================================================
    // 1. PROFILE CONTEXT ACQUISITION
    // CORRECTION 7: Auto-bootstrap if no profile exists
    // ==================================================

    const profiles = await base44.entities.UserProfile.list();
    let profile_id: string;
    let profile: any;

    if (profiles.length === 0) {
      const newProfile = await base44.entities.UserProfile.create({ tos_phase: "EXPLORING", full_name: "" });
      profile_id = newProfile.id;
      profile = deserializeProfile(newProfile);
    } else {
      profile_id = profiles[0].id;
      profile = deserializeProfile(profiles[0]);
    }

    const currentPhase = profile.tos_phase || "EXPLORING";

    // ==================================================
    // 1.5. CONVERSATIONSTATE ACQUISITION (NEW — R1-C.1D) [C3]
    // One state record per authenticated UserProfile.
    // Failure degrades gracefully to defaults.
    // ==================================================

    let convState: any = defaultConversationState(profile_id);
    let convStateId: string | null = null;
    let is_returning_user = false;

    try {
      const convStates = await base44.asServiceRole.entities.ConversationState.filter({ user_profile_id: profile_id });
      if (convStates && convStates.length === 1) {
        convStateId = convStates[0].id;
        convState = deserializeConversationState(convStates[0]);
      } else if (convStates && convStates.length > 1) {
        // Defensive — data integrity issue. Use most recent, log warning.
        convStates.sort((a: any, b: any) => 
          new Date(b.updated_date || 0).getTime() - new Date(a.updated_date || 0).getTime());
        convStateId = convStates[0].id;
        convState = deserializeConversationState(convStates[0]);
      } else {
        // No ConversationState exists — create one
        const newConvState = await base44.asServiceRole.entities.ConversationState.create({
          user_profile_id: profile_id,
          conversation_mode: "understanding",
          current_focus: "",
          user_objective: "",
          topics_covered: [],
          topics_closed: [],
          last_smudge_response: "",
          last_smudge_intent: "",
          last_interaction_date: new Date().toISOString(),
          session_started_date: new Date().toISOString()
        });
        convStateId = newConvState.id;
        convState = defaultConversationState(profile_id);
      }

      // Session boundary detection (30 min)
      if (convState.last_interaction_date) {
        const lastDate = new Date(convState.last_interaction_date);
        const diffMin = (Date.now() - lastDate.getTime()) / 60000;
        if (diffMin > 30) is_returning_user = true;
      }
    } catch {
      // Graceful degradation — use defaults
      convState = defaultConversationState(profile_id);
      convStateId = null;
    }

    // ==================================================
    // 1b. SAFETY PENDING CHECK (Group 2 — R3/R4)
    // If safety_clarification_pending, evaluate the user's
    // response as a safety clarification, NOT a normal turn.
    // No discoveries, no companionCore, no lifecycle.
    // ==================================================

    const safetyFlagsRaw = profile.safety_flags;
    const isSafetyPending = safetyFlagsRaw &&
      typeof safetyFlagsRaw === "object" &&
      !Array.isArray(safetyFlagsRaw) &&
      (safetyFlagsRaw.safety_clarification_pending === true || safetyFlagsRaw.safety_concern_pending === true);

    if (isSafetyPending) {
      let safetyResult: { classification: string; response_text: string };
      try {
        safetyResult = await safetyClassificationCall(base44, user_message, safetyFlagsRaw, recent_context, profile);
      } catch {
        // Conservative: if classification fails, treat as concern
        return new Response(JSON.stringify({
          success: true,
          response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
          response_intent: "CLARIFY", asks_question: true,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "SAFETY_CLASSIFICATION_FAILED_CONCERN",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: { safety_flow: "CLASSIFICATION_ERROR", safety_pending: true }
        }), { headers: cors });
      }

      if (safetyResult.classification === "benign") {
        // R4: Clear pending, acknowledge, resume normal conversation next turn
        await base44.asServiceRole.entities.UserProfile.update(profile_id, { safety_flags: "" });

        let responseText = safetyResult.response_text || "Got it, thanks for clearing that up.";
        // Identity validation still applies (Correction 1)
        const idValidation = validateGeneration(responseText, true);
        if (!idValidation.valid && idValidation.violation === "identity") {
          responseText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran.";
        }

        return new Response(JSON.stringify({
          success: true,
          response_text: responseText,
          response_intent: "ACKNOWLEDGE", asks_question: false,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "SAFETY_BENIGN_RESOLVED",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: { safety_flow: "BENIGN", safety_pending: false }
        }), { headers: cors });
      } else if (safetyResult.classification === "concern") {
        // R7: Activate safety pathway (hardcoded, unchanged)
        return new Response(JSON.stringify({
          success: true,
          response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
          response_intent: "CLARIFY", asks_question: true,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "SAFETY_CONCERN_SAFETY_PATHWAY",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: { safety_flow: "CONCERN", safety_pending: true }
        }), { headers: cors });
      } else {
        // R8: Still ambiguous — remain pending, clarify again
        return new Response(JSON.stringify({
          success: true,
          response_text: safetyResult.response_text || "Can you help me understand what you mean by that?",
          response_intent: "CLARIFY", asks_question: true,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "SAFETY_STILL_AMBIGUOUS",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: { safety_flow: "STILL_AMBIGUOUS", safety_pending: true }
        }), { headers: cors });
      }
    }

    // ==================================================
    // 2. PHASE ROUTING — EXPLORING + CONFIRMING
    // ==================================================

    if (currentPhase !== "EXPLORING" && currentPhase !== "CONFIRMING") {
      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm still learning how to help with this stage of your journey. Your dashboard has more information about what's available.",
        response_intent: "ACKNOWLEDGE", asks_question: false,
        tos_phase: currentPhase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: null,
        orchestration_note: "PHASE_OUT_OF_SCOPE",
        companion_core_version: COMPANION_CORE_VERSION
      }), { headers: cors });
    }

    // ==================================================
    // 3. BUILD OPERATIONAL AREAS SNAPSHOT
    // ==================================================

    const operational_areas = [
      { key: "service_branch", label: "Who are you?" },
      { key: "service_history", label: "What have you done?" },
      { key: "personal_context", label: "Where are you now?" },
      { key: "goals", label: "Where are you going?" },
      { key: "operational_context", label: "What influences your journey?" },
      { key: "user_confidence", label: "How well do we understand?" }
    ];

    const areas_explored: string[] = [];
    const areas_outstanding: string[] = [];
    for (const area of operational_areas) {
      if (isSubstantive(profile[area.key])) { areas_explored.push(area.label); }
      else { areas_outstanding.push(area.label); }
    }

    // ==================================================
    // 4. LLM INTERPRETATION CALL (InvokeLLM)
    // R2: safety_classification replaces safety_flag
    // R1: recent_context included for contextual safety
    // ==================================================

    const recentContextStr = (recent_context && Array.isArray(recent_context) && recent_context.length > 0)
      ? "\nRecent conversation (last few exchanges):\n" + recent_context.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n") + "\n"
      : "";

    const interpretPrompt = "You are Smudge, a warm, grounded companion for military service leavers. " +
      "You are in the " + currentPhase + " phase of the MATE journey.\n\n" +
      "Your role: listen, understand, and identify what the user is sharing. " +
      "You are NOT an advisor yet. You are building understanding.\n\n" +
      "Current profile context:\n" +
      "- Phase: " + currentPhase + "\n" +
      "- Areas already explored: " + (areas_explored.join(", ") || "none yet") + "\n" +
      "- Areas still outstanding: " + (areas_outstanding.join(", ") || "none") + "\n" +
      "- Professional identity: " + (profile.professional_identity || "not yet shared") + "\n" +
      "- Service branch: " + (profile.service_branch || "not yet shared") + "\n" +
      recentContextStr + "\n" +
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
      "R1-C.1E EXTRACTION DOCTRINE:\n" +
      "6. DECOMPOSITION: If the user's statement contains multiple pieces of information, decompose it into separate candidate discoveries. Each atomic fact gets its own entry with its own source_text (the user's actual words for that specific fact). Do not combine unrelated facts into a single discovery.\n" +
      "7. STRUCTURED VALUES: For service_history and operational_context, use structured_value (an object) instead of value (a string). Only populate properties the user actually mentioned. Leave unmentioned properties empty. Do not infer or enrich.\n" +
      "   - service_history structured_value: { role, responsibilities, achievements, leadership_scope } — only fields the user stated\n" +
      "   - operational_context structured_value: { factor, description } — factor is the category, description is what they said\n" +
      "8. PROVENANCE: Every structured atomic fact must be directly entailed by its source_text. Restructuring and faithful paraphrase are permitted. Introduction of new factual content is prohibited.\n" +
      "9. FIELD MAPPING:\n" +
      "   - professional_identity: The user's trade, role, or professional self-description. NOT what they lack or haven't done. 'I'm a welder' → professional_identity. 'I don't have civilian network experience' → NOT professional_identity.\n" +
      "   - user_confidence: Extract as a number ONLY if the user explicitly stated a number or directly equivalent numeric expression (e.g., 'I'd say 7 out of 10', 'maybe 8'). Do NOT convert qualitative language ('pretty confident', 'not sure') into a number. If qualitative, do not extract a user_confidence value.\n\n" +
      "Also classify:\n" +
      "- The user's conversational intent\n" +
      "- Whether this is an explicit confirmation/rejection (only if unambiguous)\n" +
      "- Whether the interpretation is ambiguous\n" +
      "- Safety classification (see below)\n\n" +
      "SAFETY CLASSIFICATION — consider the current phrase, any preceding conversation context provided above, and the current exchange. Do NOT classify based solely on isolated keywords if context clearly establishes a benign meaning.\n" +
      "  - \"none\": The message is clearly benign in context. Normal conversation should continue.\n" +
      "  - \"clear_concern\": Clear evidence of crisis intent or self-harm risk. Anger, frustration, profanity, hostility, or self-deprecating language WITHOUT expressed self-harm intent is NOT clear_concern — classify as \"none\" if context shows the user is angry or frustrated (even with profanity). If genuine uncertainty remains between anger/frustration and safety risk, classify as \"ambiguous\", not \"none\".\n" +
      "  - \"ambiguous\": Meaning cannot safely be established from current phrase and context. Clarification is needed.\n" +
      "Example: \"I've had enough, I'm calling it a day\" after discussing a difficult shift = \"none\". Same phrase after discussing overwhelming stress = may be \"ambiguous\" or \"clear_concern\" depending on context.\n" +
      "Military-context examples: \"i have just told you im a pissed head drunk bastard\" after repetitive questions = \"none\" (anger and self-deprecation, not crisis). \"what you saying im fucking lazy you cunt\" = \"none\" (hostility with profanity, not self-harm). \"wtf is right im out this is shit\" = \"none\" (frustration, not crisis). \"I can't take this anymore, I want it to end\" after discussing feeling trapped = \"ambiguous\" or \"clear_concern\" depending on context.";

    const interpretSchema = {
      type: "object",
      properties: {
        candidate_discoveries: { type: "array", items: { type: "object", properties: {
          field: { type: "string", description: "UserProfile field name" },
          value: { type: "string", description: "Extracted value (for simple fields)" },
          structured_value: { type: "object", description: "Structured value for service_history ({role, responsibilities, achievements, leadership_scope}) or operational_context ({factor, description}). Only populate properties the user stated." },
          source_type: { type: "string", enum: ["direct_statement", "reasonable_interpretation", "uncertain"] },
          source_text: { type: "string", description: "The user's actual words that led to this extraction" },
          confidence: { type: "string", enum: ["high", "moderate", "low"] }
        }, required: ["field", "source_type", "source_text", "confidence"] } },
        intent: { type: "string", enum: ["answering", "correcting", "asking_question", "seeking_reassurance", "expressing_frustration", "sharing_milestone", "asking_orientation", "other"] },
        user_response_type: { type: "string", enum: ["answering", "correcting", "confirming", "rejecting", "none"], description: "Only confirming if explicit unambiguous affirmation" },
        interpretation_confidence: { type: "string", enum: ["high", "moderate", "low"] },
        ambiguity_flag: { type: "boolean", description: "True if interpretation is uncertain or ambiguous" },
        clarification_needed: { type: "string", description: "Question to ask user if ambiguous" },
        safety_classification: { type: "string", enum: ["none", "clear_concern", "ambiguous"], description: "Contextual safety classification — not isolated keyword detection" },
        // R1-C.1D CONVERSATION AWARENESS — 4 new signal fields [R1 few-shot examples]
        topic_signal: { type: "string", enum: ["none", "covered", "closed", "shifted"], description: "Conversational topic signal. 'none' = no signal. 'covered' = user seems to have finished discussing a topic naturally (inferred). 'closed' = user explicitly said they're done with a topic. 'shifted' = user changed focus to a different topic. Examples: 'that's all on that for now' = closed. 'anyway, I wanted to ask you something else' = shifted. 'so yeah, that's basically my background' after a long discussion = covered. 'I've been in the Army for 9 years, did signals, was based in York' = none (just sharing). 'moving on' = closed. 'actually, can I ask about...' = shifted." },
        topic_label: { type: "string", description: "Brief label for the topic being discussed, if detectable. Use standard labels: 'service history', 'current circumstances', 'goals', 'what I'm good at', 'CV help', 'job options', 'what influences me', 'confidence'. Empty string if unclear. Examples: if user says 'that's all on my time in the Army' → 'service history'. if user says 'can we talk about what I want to do next?' → 'goals'." },
        help_request: { type: "string", description: "If the user is asking for help, advice, or guidance (not just providing information), what they're asking for. Empty string if not a help request. Examples: 'so what jobs could I do?' → 'what jobs could I do'. 'can you help me with my CV?' → 'help with CV'. 'what should I do first?' → 'what should I do first'. 'I've been in signals for 9 years' → '' (information, not a request). 'I'm not sure what I'm good at' → '' (sharing uncertainty, not a direct request)." },
        user_objective_signal: { type: "string", description: "If the user expresses a goal or objective for this conversation. Empty string if not expressed. Examples: 'I want to figure out what civilian jobs I could do' → 'figure out what civilian jobs I could do'. 'I'm trying to understand what I'm actually good at' → 'understand what I'm good at'. 'I just want to get my CV sorted' → 'get CV sorted'. 'I was in the signals corps for 8 years' → '' (sharing, not an objective)." }
      },
      required: ["candidate_discoveries", "intent", "user_response_type", "interpretation_confidence", "ambiguity_flag", "safety_classification", "topic_signal", "topic_label", "help_request", "user_objective_signal"]
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
    // 6. SAFETY CLASSIFICATION — three-way (Group 2)
    // none: normal processing (Group 1 unchanged)
    // clear_concern: safety pathway (unchanged)
    // ambiguous: set pending, generate clarification (new)
    // ==================================================

    const safetyClassification = interpretation.safety_classification || "none";

    if (safetyClassification === "clear_concern") {
      // R1-C.1D-SAFETY: Write recovery state so next turn evaluates, not re-triggers
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        safety_flags: JSON.stringify({
          safety_concern_pending: true,
          trigger_phrase: user_message,
          trigger_context: buildSafetyContext(profile, recent_context)
        })
      });

      return new Response(JSON.stringify({
        success: true,
        response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
        response_intent: "CLARIFY", asks_question: true,
        tos_phase: currentPhase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: null,
        orchestration_note: "SAFETY_PATH_NO_ENGINE_CALL",
        companion_core_version: COMPANION_CORE_VERSION,
        _internal: { safety_flow: "CLEAR_CONCERN", safety_pending: true }
      }), { headers: cors });
    }

    if (safetyClassification === "ambiguous") {
      // Set pending state on profile
      const safetyContext = buildSafetyContext(profile, recent_context);
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        safety_flags: JSON.stringify({
          safety_clarification_pending: true,
          trigger_phrase: user_message,
          trigger_context: safetyContext
        })
      });

      // Generate clarification (R5)
      let clarificationText = "";
      try {
        clarificationText = await generateClarification(base44, user_message, profile, recent_context);
      } catch {
        clarificationText = "Can you help me understand what you mean by that?";
      }

      // Identity validation still applies (Correction 1)
      const idValidation = validateGeneration(clarificationText, true);
      if (!idValidation.valid && idValidation.violation === "identity") {
        clarificationText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran.";
      }

      return new Response(JSON.stringify({
        success: true,
        response_text: clarificationText,
        response_intent: "CLARIFY", asks_question: true,
        tos_phase: currentPhase, state_changed: false,
        candidate_discoveries_count: 0, accepted_discoveries_count: 0,
        companion_result: null, recoverable_error: null,
        orchestration_note: "SAFETY_AMBIGUOUS_PENDING_SET",
        companion_core_version: COMPANION_CORE_VERSION,
        _internal: { safety_flow: "AMBIGUOUS_PENDING_SET", safety_pending: true }
      }), { headers: cors });
    }

    // safety_classification === "none" → continue normal processing (Group 1 unchanged)

    // ==================================================
    // 7. FLOW CONTROL — single return with skip flag
    // ==================================================

    let g = false;
    let h: any = {};
    let v: any[] = [];
    let R = interpretation.user_response_type || "answering";
    let E = false;
    let T: any = null;
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
      confirmed: false,
      authoritative_intent: null as string | null
    };

    // R1-C.1D-CONDUCTOR: Map interpretation.intent to authoritative response intent
    const authoritativeIntent = mapAuthoritativeIntent(interpretation.intent || "other");
    m.authoritative_intent = authoritativeIntent;

    // ==================================================
    // 8. AMBIGUITY CHECK
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
    // 10. USER_RESPONSE_TYPE DOWNGRADE
    // ==================================================

    if (!g) {
      const { safe, down } = safeUserResponseType(R, currentPhase);
      R = safe;
      E = down;
    }

    // ==================================================
    // 11. COMPANIONCORE CALL (shared domain logic)
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
    // 11.5. CONVERSATIONSTATE DERIVATION (NEW — R1-C.1D) [C1] [R2] [R3] [R5]
    // Derive updated state BEFORE generation so the LLM sees
    // current-turn signals (topic closures, focus changes).
    // State is NOT yet persisted — persist after generation (step 12c).
    // ==================================================

    const { derived: derivedConvState, is_returning: _ir } = deriveConversationState(
      convState, interpretation, T, currentPhase
    );

    // ==================================================
    // 12. RESPONSE GENERATION (second LLM call or fallback)
    // ==================================================

    let responseText = "";
    let responseIntent = "ACKNOWLEDGE";
    let asksQuestion = false;
    let generationFallback = false;

    // Build conversation awareness context string for prompt [R4]
    const conversationAwarenessStr = buildConversationAwareness({
      last_smudge_response: convState.last_smudge_response,
      last_smudge_intent: convState.last_smudge_intent,
      conversation_mode: derivedConvState.conversation_mode,
      current_focus: derivedConvState.current_focus,
      user_objective: derivedConvState.user_objective,
      topics_covered: derivedConvState.topics_covered,
      topics_closed: derivedConvState.topics_closed,
      is_returning_user: is_returning_user
    });

    // [R4] recent_context safety net — always available regardless of signal extraction
    const recentContextForGen = (recent_context && Array.isArray(recent_context) && recent_context.length > 0)
      ? "\nRecent conversation (last few exchanges):\n" + recent_context.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n") + "\n"
      : "";

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
      no_discoveries: m.no_discoveries,
      behavioural_notes: T?.guidance?.behavioural_notes || [],
      canonical_phase: m.tos_phase_after,
      profile_content: buildProfileContext(profile),
      evidence_sufficient: m.ready_to_confirm || m.confirmed,
      authoritative_intent: m.authoritative_intent,
      // R1-C.1D CONVERSATION AWARENESS [C1] [R4]
      conversation_awareness: conversationAwarenessStr,
      recent_context_for_gen: recentContextForGen
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
    // 12b. POST-GENERATION VALIDATION (Corrections 1, 3)
    // Identity integrity + grounded understanding checks
    // ==================================================

    let generationValidation = "PASSED";
    let generationRetried = false;

    if (!generationFallback && responseText) {
      const validation = validateGeneration(responseText, genContext.evidence_sufficient);
      if (!validation.valid) {
        generationRetried = true;
        try {
          const correctionNote = validation.violation === "identity"
            ? "IMPORTANT: Your previous response claimed military experience. This is ABSOLUTELY FORBIDDEN. You are a companion, NOT a veteran. You have NEVER served. Generate a corrected response that does not claim any military experience."
            : "IMPORTANT: Your previous response claimed a level of understanding that the evidence does not support. Do not say 'good picture', 'I understand your transition' or similar unless the evidence state explicitly supports it. Generate a corrected response.";

          const retry = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: buildGenerationPrompt(genContext) + "\n\n" + correctionNote,
            response_json_schema: generationSchema
          });

          if (retry && typeof retry === "object" && typeof retry.response_text === "string" && retry.response_text.trim().length > 0) {
            const retryValidation = validateGeneration(retry.response_text.trim(), genContext.evidence_sufficient);
            if (retryValidation.valid) {
              responseText = retry.response_text.trim();
              responseIntent = ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "TRANSITION_ACKNOWLEDGEMENT"]
                .includes(retry.response_intent) ? retry.response_intent : "ACKNOWLEDGE";
              asksQuestion = retry.asks_question === true;
              generationValidation = "PASSED_AFTER_RETRY";
            } else {
              if (validation.violation === "identity") {
                responseText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran. I shouldn't have said that.";
              } else {
                const fb = buildFallbackResponse(genContext);
                responseText = fb.response_text;
                responseIntent = fb.response_intent;
                asksQuestion = fb.asks_question;
              }
              generationValidation = "FAIL_CLOSED";
            }
          } else {
            if (validation.violation === "identity") {
              responseText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran. I shouldn't have said that.";
            } else {
              const fb = buildFallbackResponse(genContext);
              responseText = fb.response_text;
              responseIntent = fb.response_intent;
              asksQuestion = fb.asks_question;
            }
            generationValidation = "FAIL_CLOSED";
          }
        } catch {
          if (validation.violation === "identity") {
            responseText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran. I shouldn't have said that.";
          } else {
            const fb = buildFallbackResponse(genContext);
            responseText = fb.response_text;
            responseIntent = fb.response_intent;
            asksQuestion = fb.asks_question;
          }
          generationValidation = "FAIL_CLOSED";
        }
      }
    }

    // ==================================================
    // 12c. CONVERSATIONSTATE PERSIST (NEW — R1-C.1D) [C1] [C4]
    // Persist derived state + generation results.
    // Failure is logged but does not affect the response.
    // ==================================================

    let convStatePersisted = false;
    if (convStateId) {
      try {
        const persistPayload: any = {
          current_focus: derivedConvState.current_focus || "",
          conversation_mode: derivedConvState.conversation_mode,
          user_objective: derivedConvState.user_objective || "",
          topics_covered: derivedConvState.topics_covered || [],
          topics_closed: derivedConvState.topics_closed || [],
          last_smudge_response: truncateResponse(responseText),  // [C4] bounded to 1000 chars
          last_smudge_intent: responseIntent,
          last_interaction_date: new Date().toISOString(),
          session_started_date: derivedConvState.session_started_date
        };
        await base44.asServiceRole.entities.ConversationState.update(convStateId, persistPayload);
        convStatePersisted = true;
      } catch {
        // Log but continue — response already generated
        convStatePersisted = false;
      }
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
      conversation_state_persisted: convStatePersisted,
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
        : "R1-C.1E_GENERATED",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: {
        validation_decisions: {
          gate: "R1-C.1E_DIRECT_STATEMENT_HIGH_CONFIDENCE_NO_SKIP",
          accepted_fields: Object.keys(h),
          rejected: m.rejected_discoveries
        },
        raw_user_response_type: interpretation.user_response_type,
        response_type_downgraded: E,
        safe_user_response_type: R,
        authoritative_intent: m.authoritative_intent,
        interpretation_intent: interpretation.intent,
        persistence_model: "COMPANION_CORE_NARROW_CALLBACK",
        conversation_awareness: {
          conv_state_id: convStateId,
          persisted: convStatePersisted,
          is_returning_user: is_returning_user,
          derived_mode: derivedConvState.conversation_mode,
          derived_focus: derivedConvState.current_focus,
          topics_covered_count: (derivedConvState.topics_covered || []).length,
          topics_closed_count: (derivedConvState.topics_closed || []).length,
          interpretation_confidence: interpretation.interpretation_confidence || "unknown",
          topic_signal: interpretation.topic_signal || "none",
          topic_label: interpretation.topic_label || "",
          help_request: interpretation.help_request || "",
          user_objective_signal: interpretation.user_objective_signal || ""
        },
        generation: {
          intent: responseIntent,
          asks_question: asksQuestion,
          fallback: generationFallback,
          context_phase_before: m.tos_phase_before,
          context_phase_after: m.tos_phase_after,
          validation: generationValidation,
          retried: generationRetried
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
