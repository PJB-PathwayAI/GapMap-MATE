// D1 UPDATE — Journey Orchestration v1.0
// Packet 2 R1-C.1F — Confirmation Authority Gate — v2.0
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { companionCore, deserializeProfile, serializeForPersistence, COMPANION_CORE_VERSION } from "./companionCore.ts";

// ─── B01: Rejected Directions helper (evidence_log persistence) ───
// Rejected directions are stored as evidence_log entries with area: "rejected_direction".
// This helper extracts them into the shape used by filtering code.
function extractRejectedDirections(profile: any): { direction: string; rejection_text?: string; rejected_date?: string }[] {
  const evidenceLog = Array.isArray(profile?.evidence_log) ? profile.evidence_log : [];
  return evidenceLog
    .filter((e: any) => e && e.area === "rejected_direction" && e.content)
    .map((e: any) => ({
      direction: String(e.content).toLowerCase().trim(),
      rejection_text: e.source_text || "",
      rejected_date: e.recorded_date || ""
    }));
}

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

// D3: Smudge Capability Awareness — canonical boundary statement (DI §8.3)
const SMUDGE_CAPABILITY_STATEMENT = `I'm Smudge. I work alongside people leaving the military to help them understand what they're bringing with them and where they could fit.

I can:
- Listen to your story and help you see the capabilities you've built
- Show you civilian pathways that match what you're good at
- Help you think through what matters to you in your next move
- Walk with you while you figure out your first steps
- Be here when you come back

I can't:
- Get you a job directly
- Tell you what to do
- Access your military records
- Connect you to recruiters
- Make decisions for you

I'm not a veteran. I'm not a counsellor. I'm a companion who happens to know how to help you see yourself more clearly.`;

function isOrientationQuestion(userMessage: string): boolean {
  const msg = userMessage.toLowerCase().trim();
  const orientationPhrases = [
    "what can you do", "what can you actually do", "what can you help",
    "what can you do for", "what is this", "what's this", "how does this work",
    "what are you", "who are you", "what's your job", "what do you do",
    "what's your purpose", "what is this for", "what are you for",
    "help me understand what this is", "what is mate", "what's mate",
    "what should i expect", "what happens here"
  ];
  return orientationPhrases.some(p => msg.includes(p));
}
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
const SUBSTANCE_THRESHOLD = 5;

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

// R1-C.1E: Field aliases — map LLM field names to canonical UserProfile fields
const FIELD_ALIASES: Record<string, string> = {
  "name": "full_name",
};

// R1-C.1E Close-out: Sanitize structured_value — strip placeholders and empty strings.
// Unmentioned properties must be genuinely absent, not persisted as "none" or "".
const PLACEHOLDER_VALUES = new Set(["", "none", "unknown", "not mentioned", "not stated", "n/a", "na", "null", "undefined", "unspecified", "not applicable", "not relevant", "nothing", "no", "nil"]);
function sanitizeStructuredValue(sv: any): any {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(sv)) {
    if (typeof value === "string" && PLACEHOLDER_VALUES.has(value.toLowerCase().trim())) continue;
    if (value !== null && value !== undefined && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// R1-C.1E: buildNewDiscoveries — handles structured_value, evidence_log with UUIDs, no SKIP_FIELDS
function buildNewDiscoveries(discoveries: any[]): { new_discoveries: any; rejected: any[] } {
  const accepted: any = {};
  const rejected: any[] = [];
  const goalsList: string[] = [];
  const evidenceLog: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const d of discoveries) {
    const field = FIELD_ALIASES[d.field] || d.field;
    if (!ACCEPTABLE_SOURCE_TYPES.includes(d.source_type)) {
      rejected.push({ field: field, value: d.value, reason: "SOURCE_TYPE_NOT_DIRECT_STATEMENT" });
      continue;
    }
    if (!ACCEPTABLE_CONFIDENCE.includes(d.confidence)) {
      rejected.push({ field: field, value: d.value, reason: "CONFIDENCE_NOT_HIGH" });
      continue;
    }

    // R1-C.1E: Handle structured values for service_history and operational_context
    if (field === "service_history" && d.structured_value && typeof d.structured_value === "object") {
      const cleanedSV = sanitizeStructuredValue(d.structured_value);
      if (Object.keys(cleanedSV).length === 0) continue; // skip empty objects entirely
      if (!accepted.service_history) accepted.service_history = [];
      accepted.service_history.push(cleanedSV);
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: "Discovery conversation — service_history",
        content: JSON.stringify(cleanedSV),
        source_text: d.source_text || "",
        recorded_date: today
      });
    } else if (field === "operational_context" && d.structured_value && typeof d.structured_value === "object") {
      const cleanedSV = sanitizeStructuredValue(d.structured_value);
      if (Object.keys(cleanedSV).length === 0) continue; // skip empty objects entirely
      if (!accepted.operational_context) accepted.operational_context = [];
      accepted.operational_context.push(cleanedSV);
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: "Discovery conversation — operational_context",
        content: JSON.stringify(cleanedSV),
        source_text: d.source_text || "",
        recorded_date: today
      });
    } else if (field === "goals") {
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
      const mappedValue = mapDiscoveryValue(field, d.value);
      if (mappedValue === null) {
        // R1-C.1E: user_confidence non-numeric — reject (amendment #3)
        rejected.push({ field: field, value: d.value, reason: "USER_CONFIDENCE_NOT_NUMERIC" });
        continue;
      }
      accepted[field] = mappedValue;
      evidenceLog.push({
        evidence_id: crypto.randomUUID(),
        source_type: "conversation",
        source_reference: `Discovery conversation — ${field}`,
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
  // Packet 2: New authority signals only valid in CONFIRMING
  if (mode !== "CONFIRMING" && (raw === "confirming" || raw === "rejecting" || raw === "progressing" || raw === "confirming_progressing" || raw === "declining")) {
    return { safe: "answering", downgraded: true };
  }
  return { safe: raw || "answering", downgraded: false };
}

// --- CORRECTION 3: Build profile content summary for generation context ---
// ==================================================
// R1-C.1E PACKET 3: CONVERSATIONAL SUFFICIENCY GATE
// ==================================================

const SUFFICIENCY_FLOOR = {
  minAreasWithSubstance: 2,
  coreAreas: ['Who are you?', 'What have you done?', 'Where are you now?', 'Where are you going?'],
  requiresUserObjective: true,
};

function checkSufficiencyFloor(areas: any[], userObjective: string): boolean {
  const areasWithSubstance = areas.filter(a => a.has_substance);
  if (areasWithSubstance.length < SUFFICIENCY_FLOOR.minAreasWithSubstance) return false;
  if (SUFFICIENCY_FLOOR.requiresUserObjective && (!userObjective || userObjective.trim().length === 0)) return false;
  return true;
}

const SUFFICIENCY_SCHEMA = {
  type: "object",
  properties: {
    sufficient: { type: "boolean", description: "True if you understand enough of this person to reflect your understanding back usefully and honestly" },
    reason: { type: "string", description: "One sentence explaining why sufficient or not sufficient" },
    missing: { type: "array", items: { type: "string" }, description: "Specific gaps if not sufficient. Empty array if sufficient." }
  },
  required: ["sufficient", "reason", "missing"]
};

const SUFFICIENCY_PROMPT = `You are evaluating whether a companion AI (Smudge) has gathered sufficient evidence to reflect its understanding of a service leaver back to them.

Sufficient means: "I understand enough of this person, from evidence they have actually given me, to reflect my understanding back usefully and honestly."

It does NOT mean:
- All six discovery areas must be populated
- The profile must be complete
- A career recommendation is possible
- Missing information should be fabricated

If sufficient, the companion will offer a Reflection Moment ("Can I tell you what I'm hearing?") — a summary of what they understand, including gaps.

If not sufficient, the companion will continue exploring the most relevant gap.

Evaluate based on the ACTUAL EVIDENCE accumulated — not on field counts or area completion.

Profile content:
{PROFILE_CONTENT}

Areas with substance:
{AREAS_WITH_SUBSTANCE}

Areas without substance:
{AREAS_WITHOUT_SUBSTANCE}

Conversation state:
- Topics covered: {TOPICS_COVERED}
- Topics closed: {TOPICS_CLOSED}
- User's stated objective: {USER_OBJECTIVE}
- Recent conversation (last 4 exchanges):
{RECENT_CONTEXT}

Return your judgment as JSON: { sufficient: boolean, reason: string, missing: string[] }`;

async function runSufficiencyGate(base44: any,
  mergedProfile: any,
  engineResult: any,
  convState: any,
  recentContext: any[]
): Promise<{ sufficient: boolean; reason: string; missing: string[] } | null> {
  const areasWithSubstance = (engineResult.areas || []).filter((a: any) => a.has_substance).map((a: any) => a.area);
  const areasWithoutSubstance = (engineResult.areas || []).filter((a: any) => !a.has_substance).map((a: any) => a.area);

  const recentStr = (recentContext && Array.isArray(recentContext) && recentContext.length > 0)
    ? recentContext.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n")
    : "No recent context available.";

  const topicsCovered = Array.isArray(convState?.topics_covered) ? convState.topics_covered.join(", ") : "none";
  const topicsClosed = Array.isArray(convState?.topics_closed) ? convState.topics_closed.join(", ") : "none";
  const userObjective = convState?.user_objective || "not yet stated";

  const prompt = SUFFICIENCY_PROMPT
    .replace("{PROFILE_CONTENT}", buildProfileContext(mergedProfile))
    .replace("{AREAS_WITH_SUBSTANCE}", areasWithSubstance.join(", ") || "none")
    .replace("{AREAS_WITHOUT_SUBSTANCE}", areasWithoutSubstance.join(", ") || "none")
    .replace("{TOPICS_COVERED}", topicsCovered)
    .replace("{TOPICS_CLOSED}", topicsClosed)
    .replace("{USER_OBJECTIVE}", userObjective)
    .replace("{RECENT_CONTEXT}", recentStr);

  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SUFFICIENCY_SCHEMA
    });

    if (result && typeof result === "object" && typeof result.sufficient === "boolean") {
      // Handle anomalous state: not sufficient but no missing items
      if (!result.sufficient && (!result.missing || result.missing.length === 0)) {
        return { sufficient: false, reason: result.reason || "Anomalous: not sufficient but no gaps identified", missing: ["SUFFICIENCY_ANOMALOUS"] };
      }
      return {
        sufficient: result.sufficient,
        reason: result.reason || "",
        missing: Array.isArray(result.missing) ? result.missing : []
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildProfileContext(profile: any): string {
  const parts: string[] = [];
  // Skills Inbox / SMUDGE 6: full_name for persistent conversational awareness (2-char threshold — names are short)
  if (profile.full_name && typeof profile.full_name === "string" && profile.full_name.trim().length >= 2) parts.push(`- Name: ${profile.full_name}`);
  if (isSubstantive(profile.service_branch)) parts.push(`- Service: ${profile.service_branch}`);
  if (isSubstantive(profile.rank)) parts.push(`- Rank: ${profile.rank}`);
  if (profile.years_served !== null && profile.years_served !== undefined) parts.push(`- Years served: ${profile.years_served}`);
  if (isSubstantive(profile.professional_identity)) parts.push(`- Professional identity: ${profile.professional_identity}`);
  if (isSubstantive(profile.personal_context)) parts.push(`- Current circumstances: ${profile.personal_context}`);
  // Skills Inbox: compact service_history summary (not full evidence_log dump)
  if (Array.isArray(profile.service_history) && profile.service_history.length > 0) {
    const histStr = profile.service_history.map((h: any) =>
      [h.role, h.responsibilities].filter(Boolean).join(' — ')).join('; ');
    parts.push(`- Service history: ${histStr}`);
  }
  // Skills Inbox: compact operational_context summary
  if (Array.isArray(profile.operational_context) && profile.operational_context.length > 0) {
    const ctxStr = profile.operational_context.map((c: any) =>
      [c.factor, c.description].filter(Boolean).join(': ')).join('; ');
    parts.push(`- Operational context: ${ctxStr}`);
  }
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

// Safe JSON parse for entity fields that may be empty string, null, or undefined
function safeJsonParse(value: any, defaultValue: any): any {
  if (typeof value === "string" && value.trim().length > 0) {
    try { return JSON.parse(value); } catch { return defaultValue; }
  }
  return value || defaultValue;
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
  // R1-C.1E PACKET 3: Sufficiency gate context
  if (ctx.sufficiency_orchestration === "SUFFICIENT" || ctx.ready_to_confirm) {
    lines.push("- SUFFICIENCY: You now understand enough of this person to reflect your understanding back. Offer a Reflection Moment: \"Can I tell you what I'm hearing?\" Summarise what you know, including what you don't yet know (gaps are fine). Do not fabricate. Let them confirm or correct.");
  } else if (ctx.sufficiency_orchestration === "NOT_SUFFICIENT" && ctx.sufficiency_missing && ctx.sufficiency_missing.length > 0) {
    lines.push(`- SUFFICIENCY: Not yet enough to reflect back. The most relevant gap is: ${ctx.sufficiency_missing.join(", ")}. Reason: ${ctx.sufficiency_reason || "not specified"}. Move the conversation naturally toward this gap — do not announce it as a task.`);
  } else if (ctx.sufficiency_orchestration === "SUFFICIENCY_ANOMALOUS") {
    lines.push("- SUFFICIENCY: Anomalous state — not sufficient but no specific gaps identified. Continue exploring naturally. Do not force advancement.");
  } else if (ctx.sufficiency_orchestration === "FLOOR_NOT_MET") {
    lines.push("- SUFFICIENCY: Still early in the conversation. Continue building understanding naturally.");
  }
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
  lines.push("10a. Do NOT claim to have found, retrieved, or verified external resources, services, or support. Do NOT output placeholders like [Insert Links]. If the user asks about external support, say you don't have that capability and suggest they speak to their transition partner or look into it themselves.");
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
  // Packet 2 DI §4.4: Progression invitation guidance
  if (ctx.confirmed && ctx.canonical_phase === "CONFIRMING") {
    lines.push("25. The user\'s Operational Picture has been validated but they have not yet chosen to progress. You may offer a progression invitation: ask if they\'re ready to look at what they\'re actually good at, or whatever the natural next step is. Do not pressure. If they decline, continue the conversation naturally.");
  }
  if (ctx.progression_declined) {
    lines.push("26. The user declined progression. Do not pressure. Do not immediately re-issue the invitation. Continue the conversation naturally. Let them raise readiness when they choose.");
  }
  return lines.join("\n");
}

const generationSchema = {
  type: "object",
  properties: {
    response_text: { type: "string", description: "Natural conversational response to the user" },
    response_intent: { type: "string", enum: ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "PROGRESSION_INVITATION", "TRANSITION_ACKNOWLEDGEMENT"] },
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
  // Packet 2 DI §4.8: Validated but not progressed
  if (ctx.confirmed && ctx.canonical_phase === "CONFIRMING" && !ctx.progression_declined) {
    return { response_text: "I've got a good picture of where you're coming from. Whenever you're ready, we could start looking at what you're actually good at — but only when it feels right to you.", response_intent: "PROGRESSION_INVITATION", asks_question: true };
  }
  // Packet 2: Progression declined
  if (ctx.progression_declined) {
    return { response_text: "No rush at all. We can stay here for now — is there anything else on your mind?", response_intent: "EXPLORE", asks_question: true };
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


// ============================================================
// R1-C.1F PACKET 1: CONVERSATIONAL LIFELINE
// State-aware conversational handling for post-CONFIRMING states.
// Architectural invariant: No lifecycle state may disable the
// companion relationship.
// No engine invocation. No lifecycle transitions. Conversation only.
// ============================================================

const STATE_CONTEXT: Record<string, { name: string; description: string; whats_next: string; can_discuss: string }> = {
  CONFIRMED: {
    name: "Operational Picture Confirmed",
    description: "The user has confirmed that Smudge's understanding of who they are, what they've done, and where they are now is accurate. The foundational understanding is established.",
    whats_next: "The next stage is looking at their capabilities — what they're actually good at, in civilian terms. That's something we can explore together when they're ready. For now, they can ask questions, talk about what we've covered, or just chat.",
    can_discuss: "What we've talked about so far, what they've established about themselves, questions about the MATE process, what happens next, or just a normal conversation."
  },
  EVALUATING: {
    name: "Evaluating",
    description: "The user is in the evaluation phase — looking at their capabilities and exploring what options might fit. They may have capability insights and pathway suggestions to consider.",
    whats_next: "When they feel ready, there's a reflection period — a chance to sit with what they've explored before deciding to take practical action. But there's no rush. They can ask questions, discuss what they've found, or take their time.",
    can_discuss: "Their capabilities, what civilian roles might fit, what options they're considering, what matters to them, questions about the process, or just a normal conversation."
  },
  READY_TO_ACT: {
    name: "Ready to Act",
    description: "The user has indicated they feel ready to begin moving from evaluating possibilities into practical action. They may have explored pathways and reflected on what matters to them.",
    whats_next: "When they're ready to start something concrete — CV work, an application, training, reaching out to a transition partner — we can begin looking at that together. For now, they can talk about what they're thinking of doing, what steps feel right, or just chat.",
    can_discuss: "What they're thinking of doing next, what practical steps they might take, what support they might need, questions about the process, or just a normal conversation."
  },
  IN_TRANSITION: {
    name: "In Transition",
    description: "The user is in active transition — taking practical steps towards their next chapter. They may be working on CVs, applications, training, or engaging with transition support.",
    whats_next: "I'm here throughout. When they feel like they're finding their feet and don't need active transition support anymore, we can talk about that too. But there's no pressure — they can talk about how things are going, what's working, what's not, or just chat.",
    can_discuss: "How things are going, what they're working on, challenges, milestones, what's going well, what's not, support they might need, or just a normal conversation."
  },
  SETTLED: {
    name: "Settled",
    description: "The user has indicated they feel sufficiently established that they no longer require active transition support from MATE. The active transition journey is complete, but the relationship with Smudge continues.",
    whats_next: "I'm here if they need me. No agenda, no process — just a conversation if they want one. They can talk about how things are going, ask questions, or just chat. If their circumstances change, we can talk about that too.",
    can_discuss: "How things are going, what's new, questions about anything, or just a normal conversation. The process is complete but the companion relationship is not."
  }
};

function buildStateAwareProfileContext(profile: any, currentPhase: string): string {
  const parts: string[] = [];
  // Base profile (same as buildProfileContext but extended for later states)
  // Skills Inbox / SMUDGE 6: full_name for persistent conversational awareness (2-char threshold — names are short)
  if (profile.full_name && typeof profile.full_name === "string" && profile.full_name.trim().length >= 2) parts.push(`- Name: ${profile.full_name}`);
  if (isSubstantive(profile.service_branch)) parts.push(`- Service: ${profile.service_branch}`);
  if (isSubstantive(profile.rank)) parts.push(`- Rank: ${profile.rank}`);
  if (profile.years_served !== null && profile.years_served !== undefined) parts.push(`- Years served: ${profile.years_served}`);
  if (isSubstantive(profile.professional_identity)) parts.push(`- Professional identity: ${profile.professional_identity}`);
  if (isSubstantive(profile.personal_context)) parts.push(`- Current circumstances: ${profile.personal_context}`);
  // Skills Inbox: compact service_history summary
  if (Array.isArray(profile.service_history) && profile.service_history.length > 0) {
    const histStr = profile.service_history.map((h: any) =>
      [h.role, h.responsibilities].filter(Boolean).join(' — ')).join('; ');
    parts.push(`- Service history: ${histStr}`);
  }
  // Skills Inbox: compact operational_context summary
  if (Array.isArray(profile.operational_context) && profile.operational_context.length > 0) {
    const ctxStr = profile.operational_context.map((c: any) =>
      [c.factor, c.description].filter(Boolean).join(': ')).join('; ');
    parts.push(`- Operational context: ${ctxStr}`);
  }
  if (Array.isArray(profile.goals) && profile.goals.length > 0) parts.push(`- Goals: ${profile.goals.join("; ")}`);
  if (typeof profile.user_confidence === "number") parts.push(`- Self-reported confidence: ${profile.user_confidence}/10`);

  // State-specific context
  if (currentPhase === "EVALUATING" || currentPhase === "READY_TO_ACT" || currentPhase === "IN_TRANSITION" || currentPhase === "SETTLED") {
    const capMap = Array.isArray(profile.capability_map) ? profile.capability_map : [];
    if (capMap.length > 0) {
      const capSummary = capMap.slice(0, 5).map((c: any) => c.skill || c.name || "capability").join(", ");
      parts.push(`- Capabilities identified: ${capSummary}${capMap.length > 5 ? " (and others)" : ""}`);
    }
  }

  // B01: Rejected directions note (capabilities retained, directions suppressed)
  const rejectedDirs = extractRejectedDirections(profile);
  if (rejectedDirs.length > 0) {
    parts.push(`- Directions the user has explicitly ruled out: ${rejectedDirs.map((r: any) => r.direction).join(", ")}. Do NOT suggest these as career directions. Their capabilities are still valid evidence of what they can do — but they do not want these used as suggested directions.`);
  }

  if (currentPhase === "READY_TO_ACT" || currentPhase === "IN_TRANSITION" || currentPhase === "SETTLED") {
    const pathways = Array.isArray(profile.recommended_pathways) ? profile.recommended_pathways : [];
    // B01: Filter pathways by rejected directions
    const filteredPwys = pathways.filter((p: any) => {
      const name = (p.pathway_name || p.name || p.title || "").toLowerCase();
      return !rejectedDirs.some((r: any) =>
        name.includes(r.direction) || r.direction.includes(name) || tokenOverlap(name, r.direction) >= 0.4
      );
    });
    if (filteredPwys.length > 0) {
      const pathSummary = filteredPwys.slice(0, 3).map((p: any) => p.name || p.title || "pathway").join(", ");
      parts.push(`- Pathways explored: ${pathSummary}`);
    }

    const soak = profile.soak_period;
    if (soak && typeof soak === "object" && soak.state) {
      if (soak.state === "COMPLETED") parts.push("- Reflection period: completed");
      else if (soak.state === "BYPASSED") parts.push("- Reflection period: bypassed");
      else if (soak.state === "SOAKING") parts.push("- Reflection period: in progress");
    }
  }

  if (currentPhase === "IN_TRANSITION" || currentPhase === "SETTLED") {
    const milestones = Array.isArray(profile.milestones) ? profile.milestones : [];
    if (milestones.length > 0) {
      parts.push(`- Milestones recorded: ${milestones.length}`);
    }
    if (isSubstantive(profile.action_plan)) parts.push(`- Action plan: ${typeof profile.action_plan === "string" ? profile.action_plan : "active"}`);
  }

  return parts.length > 0 ? parts.join("\n") : "- No profile content available — you are still getting to know this person.";
}

function buildStateAwarePrompt(profile: any, currentPhase: string, userMessage: string, recentContext: any, engineContext?: string): string {
  const stateInfo = STATE_CONTEXT[currentPhase] || STATE_CONTEXT["CONFIRMED"];
  const profileContent = buildStateAwareProfileContext(profile, currentPhase);

  const recentStr = (recentContext && Array.isArray(recentContext) && recentContext.length > 0)
    ? recentContext.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n")
    : "No recent context available.";

  return `You are Smudge, a companion for military service leavers. You are talking to someone who is in the "${currentPhase}" phase of their MATE journey.

What this phase means:
${stateInfo.description}

What happens next:
${stateInfo.whats_next}

What you can discuss in this phase:
${stateInfo.can_discuss}

What you know about this person:
${profileContent}${engineContext ? "\n" + engineContext : ""}

Recent conversation:
${recentStr}

The user just said: "${userMessage}"

Write a natural, conversational response. You MUST follow these rules:

1. Be conversational and warm. This is a relationship, not a system prompt response. Talk like a real person.
2. You can discuss anything in the "What you can discuss" section above. Be genuinely helpful.
3. If the user asks "what happens next" or "what do I do now", use the "What happens next" section above — in your own words, not copied.
4. If the user asks what MATE is or what you do, answer directly: MATE is a companion service for people leaving the military. It helps you understand who you are outside the forces, what you're good at, and what your options might be.
5. You have NEVER served in the military. You are NOT a veteran. You do NOT have military experience. If asked about your own background, say you're a companion who helps service leavers.
6. NEVER invent capabilities, skills, evidence, career suitability, or transition outcomes. Only reference what's in the profile content above.
7. Do NOT use internal terminology — no phase names, scores, engines, confidence levels, JSON, or technical terms. The user does not know what "CONFIRMED" or "EVALUATING" means.
8. Keep your response short — 1 to 3 sentences. Do not overwhelm.
9. If the user asked a question, answer honestly based on what you know. If you don't know, say so.
10. Do not repeat or parrot what the user just said back to them. Acknowledge briefly and move forward.
11. If the user seems uncertain or hesitant, do not push. Let them go at their own pace.
12. If the user says something that could indicate a safety risk (self-harm, crisis), respond with care. Signpost Samaritans on 116 123 and NHS 111. Do not diagnose or dramatise.
13. If the user corrects you — "I think you're putting too much weight on that" — accept it, recalibrate, and move forward. Do not defend or reinterpret.
14. Vary your acknowledgements. Do not use the same opening word or phrase more than twice in a row.
15. You can acknowledge, explain, reassure, discuss, answer questions, or just respond naturally. You are not limited to one type of response.
16. Do NOT claim to have done any analysis, capability assessment, or evaluation. If the user asks about their capabilities or options, refer to what's in the profile content. If it's not there, say you don't have that information yet.
17. If the user wants to go back to something, revisit a topic, or change direction, let them. Changing your mind is part of the process.
18. You do NOT have the ability to search for, find, retrieve, or verify external resources, services, support organisations, or referrals. Do NOT claim to have found, pulled together, or located any external support. Do NOT output placeholders like [Insert Links] or [Insert Contact]. If the user asks about external support — housing, jobs, services, helplines — be honest: tell them you don't have that capability and suggest they speak to their transition partner or look into it themselves. The only exception is safety signposting (Samaritans 116 123, NHS 111) which you may always share.
19. The user may have explicitly rejected certain career directions (listed in the profile context as "Directions the user has explicitly ruled out"). Do NOT resurface, reframe, or re-suggest these directions. This applies to BOTH pathways and directions inferred from capabilities. For example, if the user rejected "engineering", do not suggest engineering roles — even if they have welding or technical capabilities that might align. Capabilities remain valid evidence of what the person can do, but a rejected direction means they do not want it suggested as a career path. Do not work around a rejection by using different words for the same direction. However, if the user THEMSELVES raise a previously rejected direction ("actually, tell me more about logistics"), you may discuss it — the rejection prevents Smudge from initiating, not the user from revisiting.`;
}

const postConfirmingSchema = {
  type: "object",
  properties: {
    response_text: { type: "string", description: "Natural conversational response to the user" },
    response_intent: { type: "string", enum: ["ACKNOWLEDGE", "EXPLORE", "CLARIFY"] },
    asks_question: { type: "boolean", description: "Whether the response asks the user a question" }
  },
  required: ["response_text", "response_intent", "asks_question"]
};

// ─── Packet 3: Capability Handover (CONFIRMED → EVALUATING) ───
// Authority: valid progression to CONFIRMED already authorises capability evaluation.
// classifyDeferral is a conversational safeguard, NOT a permission gate.
// Default = proceed. Explicit user deferral = remain conversational.

// ─── Precondition Validation (inline — mirrors engine logic) ───
function validateCapabilityPreconditions(profile: any): { met: boolean; failures: string[] } {
  const failures: string[] = [];
  if (profile.operational_picture_confirmed !== true) failures.push("Operational Picture not confirmed");
  const assessmentRating = profile.assessment_confidence?.rating;
  if (assessmentRating !== "HIGH" && assessmentRating !== "MODERATE") {
    failures.push(`Assessment Confidence insufficient (current: ${assessmentRating || "none"})`);
  }
  if (!profile.service_branch || !Array.isArray(profile.service_history) || profile.service_history.length === 0) {
    failures.push("UserProfile not validated (missing branch or service history)");
  }
  const evidenceLog = Array.isArray(profile.evidence_log) ? profile.evidence_log : [];
  if (evidenceLog.length === 0) failures.push("Evidence Log not available (empty or missing)");
  return { met: failures.length === 0, failures };
}

// ─── Seed Evidence (inline — mirrors engine logic) ───
function seedEvidenceFromProfile(profile: any): any[] {
  const entries: any[] = [];
  let counter = 1;
  const makeId = () => `EV-${String(counter++).padStart(3, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  if (Array.isArray(profile.service_history)) {
    for (const role of profile.service_history) {
      const parts: string[] = [];
      if (role.role) parts.push(`Role: ${role.role}`);
      if (role.responsibilities) parts.push(`Responsibilities: ${role.responsibilities}`);
      if (role.achievements) parts.push(`Achievements: ${role.achievements}`);
      if (role.leadership_scope) parts.push(`Leadership: ${role.leadership_scope}`);
      if (role.decision_making) parts.push(`Decision-making: ${role.decision_making}`);
      if (role.deployment) parts.push(`Deployment: ${role.deployment}`);
      if (parts.length > 0) {
        entries.push({
          evidence_id: makeId(), source_type: "service_history",
          source_reference: `${role.role || "Military role"} (${role.start_date || ""}-${role.end_date || "present"})`,
          content: parts.join(". "), recorded_date: today
        });
      }
    }
  }
  if (profile.professional_identity && profile.professional_identity.length > 15) {
    entries.push({ evidence_id: makeId(), source_type: "conversation", source_reference: "Discovery conversation — professional identity", content: profile.professional_identity, recorded_date: today });
  }
  if (profile.personal_context && profile.personal_context.length > 15) {
    entries.push({ evidence_id: makeId(), source_type: "user_statement", source_reference: "Discovery conversation — personal context", content: profile.personal_context, recorded_date: today });
  }
  if (Array.isArray(profile.operational_context)) {
    for (const ctx of profile.operational_context) {
      if (ctx.description && ctx.description.length > 10) {
        entries.push({ evidence_id: makeId(), source_type: "user_statement", source_reference: `Discovery conversation — ${ctx.factor || "operational context"}`, content: ctx.description, recorded_date: today });
      }
    }
  }
  if (Array.isArray(profile.goals) && profile.goals.length > 0) {
    entries.push({ evidence_id: makeId(), source_type: "user_statement", source_reference: "Discovery conversation — goals and aspirations", content: profile.goals.join(". "), recorded_date: today });
  }
  return entries;
}

// ─── Deferral Classification (conversational safeguard, NOT permission gate) ───
async function classifyDeferral(
  base44: any, userMessage: string, recentContext: any
): Promise<"proceed" | "defer"> {
  try {
    const recentStr = (recentContext && Array.isArray(recentContext) && recentContext.length > 0)
      ? recentContext.slice(-3).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n")
      : "No recent context.";
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a conversational context classifier for a military service leaver companion service.

The user is in the CONFIRMED stage — they have ALREADY authorised capability evaluation by progressing to this stage. Authority is already established. You are NOT deciding whether to grant permission. You are only checking whether NOW is the right conversational moment.

Classify the user's message:
- "defer": The user is explicitly pausing, asking a question, changing topic, or saying "not yet." They are actively redirecting away from capability evaluation.
- "proceed": Everything else — including neutral messages, going along, agreement, silence-equivalent, or messages that don't actively redirect.

Conservative default: when in doubt, classify as "proceed." The user has already authorised this; you are only checking for active deferral.

Recent conversation:
${recentStr}

User message: "${userMessage}"`,
      response_json_schema: {
        type: "object",
        properties: { classification: { type: "string", enum: ["proceed", "defer"] } },
        required: ["classification"]
      }
    });
    return result?.classification === "defer" ? "defer" : "proceed";
  } catch {
    return "proceed"; // Default to proceed on classification failure
  }
}

// ─── Capability Identification (single-pass LLM) ───
async function identifyCapabilities(
  base44: any, profile: any, evidenceLog: any[]
): Promise<any[]> {
  const evidenceText = evidenceLog.map(e =>
    `[${e.evidence_id}] (${e.source_type}) ${e.source_reference}: ${e.content}`
  ).join("\n");
  const profileContext = buildProfileContext(profile);

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are identifying capabilities for a military service leaver based on their evidence log.

This is what we know about the person:
${profileContext}

This is the evidence log:
${evidenceText}

Identify the person's capabilities. For each capability, provide:
- capability_name: What they can do (military terms are fine)
- civilian_translation: What this means in civilian terms
- evidence_refs: Array of evidence_id values from the evidence log that support this capability
- transferability_notes: How this transfers to civilian work

Rules:
1. Every capability MUST reference at least one evidence_id from the evidence log above
2. Do not invent capabilities not supported by evidence
3. Do not infer capabilities from rank or branch alone — look at what they actually did
4. Focus on transferable capabilities, not military-specific skills
5. Aim for 3-7 capabilities — quality over quantity

Return as a JSON array.`,
    response_json_schema: {
      type: "object",
      properties: {
        capabilities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              capability_name: { type: "string" },
              civilian_translation: { type: "string" },
              evidence_refs: { type: "array", items: { type: "string" } },
              transferability_notes: { type: "string" }
            },
            required: ["capability_name", "civilian_translation", "evidence_refs"]
          }
        }
      },
      required: ["capabilities"]
    }
  });
  return Array.isArray(result?.capabilities) ? result.capabilities : [];
}

// ─── Confidence Calculation (inline — mirrors engine logic) ───
function calculateCapabilityConfidence(
  evidenceRefs: string[], evidenceLog: any[]
): { score: number; rating: string } {
  const referenced = evidenceLog.filter(e => evidenceRefs.includes(e.evidence_id));
  if (referenced.length === 0) return { score: 0, rating: "LOW" };
  let score = 40;
  score += Math.min(referenced.length - 1, 3) * 15;
  if (referenced.some(e => e.content && e.content.length > 30)) score += 10;
  if (new Set(referenced.map(e => e.source_type)).size > 1) score += 10;
  score = Math.min(100, score);
  return { score, rating: score < 41 ? "LOW" : score < 71 ? "MODERATE" : "HIGH" };
}

// ─── Build, Persist, and Transition (inline — mirrors engine submit_capabilities) ───
async function buildAndPersistCapabilities(
  base44: any, profile: any, profile_id: string,
  capabilities: any[], evidenceLog: any[]
): Promise<{ accepted: any[]; rejected: any[]; capability_picture: any }> {
  const accepted: any[] = [];
  const rejected: any[] = [];

  for (const cap of capabilities) {
    if (!cap.capability_name || !cap.civilian_translation) {
      rejected.push({ capability_name: cap.capability_name || "(unnamed)", reason: "Missing capability_name or civilian_translation" });
      continue;
    }
    if (!cap.evidence_refs || cap.evidence_refs.length === 0) {
      rejected.push({ capability_name: cap.capability_name, reason: "No evidence references provided" });
      continue;
    }
    const validRefs = cap.evidence_refs.filter((refId: string) => evidenceLog.some(e => e.evidence_id === refId));
    if (validRefs.length === 0) {
      rejected.push({ capability_name: cap.capability_name, reason: `Evidence references not found: ${cap.evidence_refs.join(", ")}` });
      continue;
    }
    const { score, rating } = calculateCapabilityConfidence(validRefs, evidenceLog);
    const evidenceSummary = validRefs.map((refId: string) => {
      const entry = evidenceLog.find(e => e.evidence_id === refId);
      return entry ? `[${entry.source_type}] ${entry.source_reference}: ${entry.content}` : `Unknown evidence ref: ${refId}`;
    });
    accepted.push({
      capability_name: cap.capability_name, civilian_translation: cap.civilian_translation,
      evidence_refs: validRefs, evidence_summary: evidenceSummary,
      confidence_score: score, confidence_rating: rating,
      transferability_notes: cap.transferability_notes || ""
    });
  }

  if (accepted.length === 0) return { accepted: [], rejected, capability_picture: null };

  const capabilityMap = accepted.map(c => ({
    skill: c.capability_name, civilian_equivalent: c.civilian_translation,
    evidence: c.evidence_summary.join(" | "), evidence_ref: c.evidence_refs.join(","), score: c.confidence_score
  }));
  const confidenceScores = accepted.map(c => ({
    skill: c.capability_name, confidence: c.confidence_score,
    evidence_refs: c.evidence_refs.join(","), evidence_ref: c.evidence_refs[0]
  }));

  const existingCapMap = Array.isArray(profile.capability_map) ? profile.capability_map : [];
  const existingConfidence = Array.isArray(profile.confidence_scores) ? profile.confidence_scores : [];
  const mergedCapMap = [...existingCapMap.filter(c => !accepted.some(a => a.capability_name === c.skill)), ...capabilityMap];
  const mergedConfidence = [...existingConfidence.filter(c => !accepted.some(a => a.capability_name === c.skill)), ...confidenceScores];

  // Persist + transition (under orchestrator authority — R-P3-1)
  // Re-serialize entire profile (deserializeProfile converts strings to objects;
  // the entity schema expects strings, so we must serialize back before update)
  const persistPayload = serializeForPersistence({
    ...profile,
    capability_map: mergedCapMap,
    confidence_scores: mergedConfidence,
    tos_phase: "EVALUATING"
  });
  await base44.asServiceRole.entities.UserProfile.update(profile_id, persistPayload);

  // Build capability picture
  const high = accepted.filter(c => c.confidence_rating === "HIGH").length;
  const moderate = accepted.filter(c => c.confidence_rating === "MODERATE").length;
  const low = accepted.filter(c => c.confidence_rating === "LOW").length;
  const sorted = [...accepted].sort((a, b) => b.confidence_score - a.confidence_score);

  return {
    accepted, rejected,
    capability_picture: {
      generated: true, profile_name: profile.full_name || "Unknown",
      total_capabilities: accepted.length,
      confidence_summary: { high, moderate, low },
      capabilities: sorted,
      ready_for_phase_four: accepted.length > 0 && low === 0,
      presentation_guidance: {
        tone: "observation not judgement", approach: "invite recognition, never impose identity",
        example_phrasing: '"From everything we\'ve explored together, one capability keeps appearing."',
        avoid: ["You are definitely a leader", "You should consider...", "This means you could..."],
        success_indicator: 'User responds with something similar to "I\'d never thought about it like that."'
      },
      explainability: "Every capability includes evidence_summary showing exactly how it was identified."
    }
  };
}

// ─── Capability Presentation (conversational LLM) ───
async function generateCapabilityPresentation(
  base44: any, profile: any, accepted: any[], rejected: any[], recentContext: any
): Promise<{ response_text: string; response_intent: string; asks_question: boolean } | null> {
  const capList = accepted.map(c =>
    `- ${c.capability_name} (civilian: ${c.civilian_translation}) — Confidence: ${c.confidence_rating}. Evidence: ${c.evidence_summary.join("; ")}`
  ).join("\n");
  const recentStr = (recentContext && Array.isArray(recentContext) && recentContext.length > 0)
    ? recentContext.slice(-4).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n") : "";

  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are Smudge, a companion for people leaving the military.

You have just completed a capability evaluation for this person. You need to present the results conversationally.

The person is in the CONFIRMED stage — they agreed to look at their capabilities. You are presenting what you found.

What you know about this person:
${buildProfileContext(profile)}

Capabilities identified (with evidence):
${capList}

${rejected.length > 0 ? `Capabilities rejected (no valid evidence — DO NOT mention these): ${rejected.map(r => r.capability_name).join(", ")}` : ""}

Recent conversation:
${recentStr}

Write a natural response presenting these capabilities. You MUST follow these rules:

1. Present capabilities as OBSERVATIONS, not judgements. "From what you've told me, a few things keep coming through..." not "You are definitely a leader."
2. Invite recognition, never impose identity. Let the user see themselves in the capabilities.
3. Do NOT dump all capabilities at once. Weave them naturally — lead with the strongest, mention 2-3, let the rest emerge in conversation.
4. Do NOT use the rejected capabilities. They failed the evidence check.
5. Reference evidence naturally when relevant — "when you talked about leading your section through..."
6. Do NOT use internal terminology — no confidence scores, no evidence IDs, no phase names, no JSON.
7. Keep it conversational — 3-5 sentences. This is the beginning of a conversation about capabilities, not a final report.
8. End with an open invitation — let the user react, question, or sit with it.
9. Do NOT say "I've analysed" or "the engine has determined." You are Smudge, having a conversation.
10. If there's only one capability, that's fine. Don't pad.
11. Do NOT claim to have found, retrieved, or verified external resources, services, or support. Do NOT output placeholders like [Insert Links]. If the user asks about external support, say you don't have that capability.`,
      response_json_schema: {
        type: "object",
        properties: {
          response_text: { type: "string", description: "Natural conversational response presenting capabilities" },
          response_intent: { type: "string", enum: ["ACKNOWLEDGE", "EXPLORE", "CLARIFY"] },
          asks_question: { type: "boolean" }
        },
        required: ["response_text", "response_intent", "asks_question"]
      }
    });
    if (result && typeof result.response_text === "string" && result.response_text.trim().length > 0) {
      return {
        response_text: result.response_text.trim(),
        response_intent: ["ACKNOWLEDGE", "EXPLORE", "CLARIFY"].includes(result.response_intent) ? result.response_intent : "ACKNOWLEDGE",
        asks_question: result.asks_question === true
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Precondition Failure Response (conversational) ───
async function generatePreconditionFailureResponse(
  base44: any, failures: string[], convState: any, convStateId: string | null, cors: Record<string, string>
): Promise<Response> {
  let gapText = "";
  if (failures.some(f => f.includes("Assessment Confidence"))) {
    gapText = "I want to make sure we've got enough to work with before we start looking at this properly. Can you tell me a bit more about your service experience?";
  } else if (failures.some(f => f.includes("UserProfile not validated"))) {
    gapText = "I need to know a bit more about your service background before we can look at this properly.";
  } else if (failures.some(f => f.includes("Operational Picture not confirmed"))) {
    gapText = "Something's changed since we last talked. Can we make sure I've still got the right picture?";
  } else {
    gapText = "I'm not quite ready to look at this yet. Can we talk a bit more first?";
  }

  if (convStateId) {
    try {
      await base44.asServiceRole.entities.ConversationState.update(convStateId, {
        last_smudge_response: truncateResponse(gapText), last_smudge_intent: "CLARIFY",
        last_interaction_date: new Date().toISOString()
      });
    } catch { /* ignore */ }
  }

  return new Response(JSON.stringify({
    success: true, response_text: gapText, response_intent: "CLARIFY", asks_question: true,
    tos_phase: "CONFIRMED", state_changed: false,
    candidate_discoveries_count: 0, accepted_discoveries_count: 0,
    companion_result: null, recoverable_error: null,
    orchestration_note: "CAPABILITY_PRECONDITION_FAILED", companion_core_version: COMPANION_CORE_VERSION,
    _internal: { phase: "CONFIRMED", precondition_failures: failures, lifecycle_neutral: true }
  }), { headers: cors });
}

// ─── Fallback Response (conversational) ───
async function generateHandoverFallback(
  base44: any, text: string, phase: string, note: string,
  convState: any, convStateId: string | null, cors: Record<string, string>
): Promise<Response> {
  if (convStateId) {
    try {
      await base44.asServiceRole.entities.ConversationState.update(convStateId, {
        last_smudge_response: truncateResponse(text), last_smudge_intent: "CLARIFY",
        last_interaction_date: new Date().toISOString()
      });
    } catch { /* ignore */ }
  }
  return new Response(JSON.stringify({
    success: true, response_text: text, response_intent: "CLARIFY", asks_question: true,
    tos_phase: phase, state_changed: false,
    candidate_discoveries_count: 0, accepted_discoveries_count: 0,
    companion_result: null, recoverable_error: null,
    orchestration_note: note, companion_core_version: COMPANION_CORE_VERSION,
    _internal: { phase: phase, fallback: true, lifecycle_neutral: true }
  }), { headers: cors });
}

// ─── Capability Handover Orchestrator ───
async function handleCapabilityHandover(
  base44: any, profile: any, profile_id: string, userMessage: string,
  recentContext: any, convState: any, convStateId: string | null, cors: Record<string, string>
): Promise<Response> {
  // Step 1: Validate preconditions
  const preconditions = validateCapabilityPreconditions(profile);

  if (!preconditions.met) {
    // Try seed_evidence if evidence log is empty
    const evidenceLog = Array.isArray(profile.evidence_log) ? profile.evidence_log : [];
    if (evidenceLog.length === 0 && preconditions.failures.some(f => f.includes("Evidence Log"))) {
      const seeded = seedEvidenceFromProfile(profile);
      if (seeded.length > 0) {
        try {
          await base44.asServiceRole.entities.UserProfile.update(profile_id, { evidence_log: seeded });
          const updatedProfile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
          const retry = validateCapabilityPreconditions(updatedProfile);
          if (!retry.met) {
            return await generatePreconditionFailureResponse(base44, retry.failures, convState, convStateId, cors);
          }
          profile = updatedProfile; // Continue with updated profile
        } catch {
          return await generatePreconditionFailureResponse(base44, preconditions.failures, convState, convStateId, cors);
        }
      } else {
        return await generatePreconditionFailureResponse(base44, preconditions.failures, convState, convStateId, cors);
      }
    } else {
      return await generatePreconditionFailureResponse(base44, preconditions.failures, convState, convStateId, cors);
    }
  }

  // Step 2: Identify capabilities from evidence_log (single-pass LLM)
  // B01: Exclude rejected_direction entries — they are not capability evidence
  const evidenceLog = (Array.isArray(profile.evidence_log) ? profile.evidence_log : []).filter((e: any) => e && e.area !== "rejected_direction");
  let capabilities: any[] = [];
  try {
    capabilities = await identifyCapabilities(base44, profile, evidenceLog);
  } catch {
    return await generateHandoverFallback(base44, "I'm having trouble processing that right now. Can we try again in a moment?", "CONFIRMED", "CAPABILITY_IDENTIFY_FAILED", convState, convStateId, cors);
  }

  if (capabilities.length === 0) {
    return await generateHandoverFallback(base44, "I've been looking at everything we've talked about, but I'm not quite ready to share anything yet. Can you tell me a bit more about what you did day-to-day?", "CONFIRMED", "CAPABILITY_NONE_IDENTIFIED", convState, convStateId, cors);
  }

  // Step 3: Submit capabilities (validate evidence rule, calculate confidence, persist, transition)
  let result: { accepted: any[]; rejected: any[]; capability_picture: any };
  try {
    result = await buildAndPersistCapabilities(base44, profile, profile_id, capabilities, evidenceLog);
  } catch {
    return await generateHandoverFallback(base44, "Something went wrong on my end. Give me a moment and we can try again.", "CONFIRMED", "CAPABILITY_PERSIST_FAILED", convState, convStateId, cors);
  }

  if (result.accepted.length === 0) {
    return await generateHandoverFallback(base44, "I've been looking at what we've discussed, but I don't think I've got enough detail yet to tell you what you're genuinely good at. Can you tell me more about what your day-to-day actually involved?", "CONFIRMED", "CAPABILITY_ALL_REJECTED", convState, convStateId, cors);
  }

  // Step 4: Generate conversational presentation
  let presentation: { response_text: string; response_intent: string; asks_question: boolean } | null = null;
  try {
    presentation = await generateCapabilityPresentation(base44, profile, result.accepted, result.rejected, recentContext);
  } catch { presentation = null; }

  if (!presentation) {
    const topCap = result.accepted[0];
    presentation = {
      response_text: `From what you've told me, one thing keeps coming through — ${topCap.civilian_translation}. That's something civilians will value. Want to talk through what that looks like?`,
      response_intent: "EXPLORE", asks_question: true
    };
  }

  // Step 5: Update ConversationState
  if (convStateId) {
    try {
      const now = new Date().toISOString();
      let sessionStartedDate = convState.session_started_date || now;
      if (convState.last_interaction_date) {
        const diffMin = (Date.now() - new Date(convState.last_interaction_date).getTime()) / 60000;
        if (diffMin > 30) sessionStartedDate = now;
      }
      await base44.asServiceRole.entities.ConversationState.update(convStateId, {
        last_smudge_response: truncateResponse(presentation.response_text),
        last_smudge_intent: presentation.response_intent,
        last_interaction_date: now, session_started_date: sessionStartedDate
      });
    } catch { /* ignore */ }
  }

  // Step 6: Return response
  return new Response(JSON.stringify({
    success: true, response_text: presentation.response_text,
    response_intent: presentation.response_intent, asks_question: presentation.asks_question,
    tos_phase: "EVALUATING", state_changed: true,
    candidate_discoveries_count: 0, accepted_discoveries_count: result.accepted.length,
    companion_result: null, recoverable_error: null,
    orchestration_note: "CAPABILITY_HANDOVER_COMPLETE", companion_core_version: COMPANION_CORE_VERSION,
    _internal: {
      phase: "EVALUATING",
      capability_handover: {
        preconditions_met: true, capabilities_identified: capabilities.length,
        capabilities_accepted: result.accepted.length, capabilities_rejected: result.rejected.length,
        lifecycle_transition: "CONFIRMED → EVALUATING"
      }, lifecycle_neutral: false
    }
  }), { headers: cors });
}

// ─── End Packet 3 Functions ───

// ============================================================
// D1: JOURNEY ORCHESTRATION — EVALUATING ENGINE INTEGRATION
// Design Intent v1.0 — accepted 28 Aug 2026
// Scope: EVALUATING state only. D2/D3 not authorised.
// ============================================================

// D1: callEngine helper — HTTP fetch wrapper for engine invocation
// D1: Inline engine actions (platform limitation: functions can't call other functions via HTTP)
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

async function inlineEngineAction(
  base44: any, profile: any, profile_id: string, action: string, params?: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (action === "get_status") {
      const decisionFactors = safeJsonParse(profile.decision_factors, {});
      const expressedFactors = Object.entries(decisionFactors)
        .filter(([, v]: [string, any]) => v?.expressed === true)
        .map(([k]) => k);
      const soakPeriod = safeJsonParse(profile.soak_period, { state: "NOT_STARTED" });
      const recommendedPathways = safeJsonParse(profile.recommended_pathways, []);
      const capabilityMap = safeJsonParse(profile.capability_map, []);
      return {
        success: true,
        data: {
          tos_phase: profile.tos_phase,
          soak_period: soakPeriod,
          soak_state: soakPeriod.state || "NOT_STARTED",
          pathway_count: Array.isArray(recommendedPathways) ? recommendedPathways.length : 0,
          expressed_decision_factors: expressedFactors,
          capability_count: Array.isArray(capabilityMap) ? capabilityMap.length : 0
        }
      };
    }

    if (action === "evaluate_pathways") {
      const allPathways = await base44.asServiceRole.entities.OCIPathway.list();
      const capabilityMap = safeJsonParse(profile.capability_map, []);
      const evidenceLog = safeJsonParse(profile.evidence_log, []);
      const evidenceIndex = new Set(evidenceLog.map((e: any) => e.evidence_id));

      const profileCapabilities = capabilityMap.map((cap: any) => ({
        name: (cap.skill || cap.capability || "").toLowerCase().trim(),
        confidence: cap.score || cap.confidence || 0,
        evidence_refs: Array.isArray(cap.evidence_refs) ? cap.evidence_refs : (cap.evidence_ref ? String(cap.evidence_ref).split(",").map((r: string) => r.trim()) : []),
      }));

      for (const cap of profileCapabilities) {
        for (const ref of cap.evidence_refs) {
          if (ref && !evidenceIndex.has(ref)) {
            return { success: false, error: `Evidence integrity failure: capability '${cap.name}' references evidence '${ref}' which does not exist.` };
          }
        }
      }

      const matches: any[] = [];
      const now = new Date().toISOString();
      for (const pathway of allPathways) {
        if (pathway.review_status === "retired") continue;
        const pathwayCapabilities = Array.isArray(pathway.capability_profile)
          ? pathway.capability_profile.map((c: string) => (c || "").toLowerCase().trim())
          : [];
        if (pathwayCapabilities.length === 0) continue;

        const alignedCapabilities: string[] = [];
        for (const required of pathwayCapabilities) {
          const match = profileCapabilities.find((pc: any) =>
            pc.name.includes(required) || required.includes(pc.name) || tokenOverlap(pc.name, required) >= 0.5
          );
          if (match) alignedCapabilities.push(match.name);
        }

        if (alignedCapabilities.length > 0) {
          matches.push({
            pathway_id: pathway.id,
            pathway_name: pathway.name,
            alignment_score: alignedCapabilities.length / pathwayCapabilities.length,
            aligned_capabilities: alignedCapabilities,
            pathway_capabilities: pathwayCapabilities,
            entry_routes: pathway.entry_routes || [],
            common_transition_gaps: pathway.common_transition_gaps || [],
            development_opportunities: pathway.development_opportunities || [],
            civilian_context: pathway.civilian_context || "",
            lifestyle_considerations: pathway.lifestyle_considerations || {},
            evaluated_date: now
          });
        }
      }
      matches.sort((a, b) => b.alignment_score - a.alignment_score);

      await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
        recommended_pathways: matches
      }));

      return {
        success: true,
        data: { pathway_count: matches.length, pathways: matches }
      };
    }

    if (action === "initiate_soak") {
      const currentSoak = safeJsonParse(profile.soak_period, {});
      if ((currentSoak.state || "NOT_STARTED") !== "NOT_STARTED") {
        return { success: false, error: `Cannot initiate from '${currentSoak.state}'` };
      }
      await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
        soak_period: { state: "SOAKING", initiated_date: new Date().toISOString(), completed_date: null, bypassed_date: null, bypass_reason: null, reflection_notes: "" }
      }));
      return { success: true, data: { soak_state: "SOAKING", tos_phase: profile.tos_phase } };
    }

    if (action === "complete_soak") {
      const currentSoak = safeJsonParse(profile.soak_period, {});
      if ((currentSoak.state || "NOT_STARTED") !== "SOAKING") {
        return { success: false, error: `Cannot complete from '${currentSoak.state}'` };
      }
      await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
        soak_period: { ...currentSoak, state: "COMPLETED", completed_date: new Date().toISOString(), reflection_notes: params?.reflection_notes || "" },
        tos_phase: "READY_TO_ACT"
      }));
      return { success: true, data: { soak_state: "COMPLETED", tos_phase: "READY_TO_ACT" } };
    }

    if (action === "bypass_soak") {
      const currentSoak = safeJsonParse(profile.soak_period, {});
      if (!["NOT_STARTED", "SOAKING"].includes(currentSoak.state || "NOT_STARTED")) {
        return { success: false, error: `Cannot bypass from '${currentSoak.state}'` };
      }
      await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
        soak_period: { ...currentSoak, state: "BYPASSED", bypassed_date: new Date().toISOString(), bypass_reason: params?.soak_bypass_reason || "" },
        tos_phase: "READY_TO_ACT"
      }));
      return { success: true, data: { soak_state: "BYPASSED", tos_phase: "READY_TO_ACT" } };
    }

    return { success: false, error: `Unknown action: ${action}` };
  } catch (err: any) {
    return { success: false, error: `${action} failed: ${err?.message || "Unknown error"}` };
  }
}

// D2: Inline Transition Partnership actions (same platform constraint as D1)
function deserializeJourney(journey: any): any {
  const jsonFields = ["current_blockers", "significant_milestones", "active_commitments", "transition_status", "referral_history", "wellbeing_awareness"];
  for (const f of jsonFields) {
    if (typeof journey[f] === "string" && journey[f].length > 0) {
      try { journey[f] = JSON.parse(journey[f]); } catch { /* not JSON */ }
    }
    if (journey[f] === null || journey[f] === undefined) {
      journey[f] = (f === "current_blockers" || f === "significant_milestones" || f === "active_commitments" || f === "referral_history") ? [] : {};
    }
  }
  return journey;
}

async function findActiveJourneyInline(base44: any, profileId: string): Promise<any | null> {
  try {
    const journeys = await base44.asServiceRole.entities.TransitionJourney.list();
    const active = journeys.find((j: any) =>
      j.user_profile_id === profileId && j.partnership_state !== "INDEPENDENT"
    );
    return active ? deserializeJourney(active) : null;
  } catch { return null; }
}

const TP_VALID_TRANSITIONS: Record<string, string[]> = {
  "ACTIVE": ["MONITORING", "SUPPORT_REQUIRED", "REFERRAL", "INDEPENDENT"],
  "MONITORING": ["ACTIVE", "SUPPORT_REQUIRED", "REFERRAL", "INDEPENDENT"],
  "SUPPORT_REQUIRED": ["ACTIVE", "REFERRAL", "INDEPENDENT"],
  "REFERRAL": ["ACTIVE", "MONITORING", "INDEPENDENT"],
  "INDEPENDENT": []
};

async function inlineTPAction(
  base44: any, profile: any, profile_id: string, action: string, params?: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (action === "get_journey_status") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: true, data: { active: false, partnership_state: null } };
      return {
        success: true,
        data: {
          active: true, journey_id: journey.id, partnership_state: journey.partnership_state,
          confidence_band: journey.confidence_band || "BUILDING",
          current_direction: journey.current_direction || "",
          current_blockers: Array.isArray(journey.current_blockers) ? journey.current_blockers : [],
          significant_milestones: Array.isArray(journey.significant_milestones) ? journey.significant_milestones : [],
          active_commitments: Array.isArray(journey.active_commitments) ? journey.active_commitments : [],
          operational_readiness: journey.operational_readiness || "ON_COURSE"
        }
      };
    }

    if (action === "start_journey") {
      if (profile.tos_phase !== "READY_TO_ACT")
        return { success: false, error: `Precondition failed: requires READY_TO_ACT. Current: ${profile.tos_phase}` };
      const soakPeriod = safeJsonParse(profile.soak_period, {});
      if (soakPeriod.state !== "COMPLETED" && soakPeriod.state !== "BYPASSED")
        return { success: false, error: `Precondition failed: soak must be COMPLETED or BYPASSED. Current: ${soakPeriod.state || "NOT_STARTED"}` };
      const capMap = safeJsonParse(profile.capability_map, []);
      if (!Array.isArray(capMap) || capMap.length === 0)
        return { success: false, error: "Precondition failed: capability_map is empty" };
      const existing = await findActiveJourneyInline(base44, profile_id);
      if (existing)
        return { success: true, data: { journey_id: existing.id, partnership_state: existing.partnership_state, already_exists: true } };
      const pathways = safeJsonParse(profile.recommended_pathways, []);
      const direction = Array.isArray(pathways) && pathways.length > 0 ? (pathways[0].pathway_name || pathways[0].name || "") : "";
      const today = new Date().toISOString().split("T")[0];
      const journey = await base44.asServiceRole.entities.TransitionJourney.create({
        user_profile_id: profile_id, partnership_state: "ACTIVE",
        transition_status: JSON.stringify({ employment: "", training: "", applications: [], interviews: [] }),
        current_direction: direction, active_commitments: JSON.stringify([]),
        current_blockers: JSON.stringify([]), confidence_band: "BUILDING", confidence_trend: "STABLE",
        wellbeing_awareness: JSON.stringify({ awareness: "NONE" }), significant_milestones: JSON.stringify([]),
        referral_history: JSON.stringify([]), operational_readiness: "ON_COURSE",
        last_interaction_date: today, journey_started_date: today,
        journey_concluded_date: "", conclusion_summary: ""
      });
      await base44.asServiceRole.entities.UserProfile.update(profile_id, { tos_phase: "IN_TRANSITION" });
      return { success: true, data: { journey_id: journey.id, partnership_state: "ACTIVE", direction, tos_phase: "IN_TRANSITION" } };
    }

    if (action === "record_milestone") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: false, error: "No active journey found" };
      const milestones = Array.isArray(journey.significant_milestones) ? [...journey.significant_milestones] : [];
      milestones.push({ text: params.milestone_text, date: new Date().toISOString().split("T")[0] });
      await base44.asServiceRole.entities.TransitionJourney.update(journey.id, serializeForPersistence({
        significant_milestones: milestones, last_interaction_date: new Date().toISOString().split("T")[0]
      }));
      return { success: true, data: { milestone: params.milestone_text, total_milestones: milestones.length } };
    }

    if (action === "record_blocker") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: false, error: "No active journey found" };
      const blockers = Array.isArray(journey.current_blockers) ? [...journey.current_blockers] : [];
      if (!blockers.includes(params.blocker)) blockers.push(params.blocker);
      await base44.asServiceRole.entities.TransitionJourney.update(journey.id, serializeForPersistence({
        current_blockers: blockers, last_interaction_date: new Date().toISOString().split("T")[0]
      }));
      return { success: true, data: { blocker: params.blocker, current_blockers: blockers } };
    }

    if (action === "resolve_blocker") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: false, error: "No active journey found" };
      const blockers = Array.isArray(journey.current_blockers) ? [...journey.current_blockers] : [];
      const updatedBlockers = blockers.filter((b: string) => b !== params.blocker);
      await base44.asServiceRole.entities.TransitionJourney.update(journey.id, serializeForPersistence({
        current_blockers: updatedBlockers, last_interaction_date: new Date().toISOString().split("T")[0]
      }));
      return { success: true, data: { resolved_blocker: params.blocker, remaining_blockers: updatedBlockers } };
    }

    if (action === "update_direction") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: false, error: "No active journey found" };
      await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
        current_direction: params.new_direction, last_interaction_date: new Date().toISOString().split("T")[0]
      });
      return { success: true, data: { previous_direction: journey.current_direction, new_direction: params.new_direction } };
    }

    if (action === "conclude_journey") {
      const journey = await findActiveJourneyInline(base44, profile_id);
      if (!journey) return { success: false, error: "No active journey found" };
      const currentState = journey.partnership_state;
      const allowed = TP_VALID_TRANSITIONS[currentState];
      if (!allowed || !allowed.includes("INDEPENDENT"))
        return { success: false, error: `Cannot conclude from state ${currentState}` };
      const today = new Date().toISOString().split("T")[0];
      await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
        partnership_state: "INDEPENDENT", journey_concluded_date: today,
        conclusion_summary: params.summary || "The individual has demonstrated sustained confidence, stability and self-direction. The partnership has succeeded.",
        last_interaction_date: today
      });
      await base44.asServiceRole.entities.UserProfile.update(profile_id, { tos_phase: "SETTLED" });
      return { success: true, data: { partnership_state: "INDEPENDENT", tos_phase: "SETTLED", concluded_date: today } };
    }

    return { success: false, error: `Unknown TP action: ${action}` };
  } catch (err: any) {
    return { success: false, error: `${action} failed: ${err?.message || "Unknown error"}` };
  }
}

// D1: EVALUATING lifecycle intent classifier
async function classifyEvaluatingIntent(
  base44: any, userMessage: string, recentContext: any, soakState: string, pathwayCount: number
): Promise<{ intent: string; rejected_direction: string }> {
  try {
    const recentStr = (recentContext && Array.isArray(recentContext) && recentContext.length > 0)
      ? recentContext.slice(-3).map((m: any) => `${m.role === "user" ? "User" : "Smudge"}: ${m.text}`).join("\n")
      : "No recent context.";

    const prompt = `You are a lifecycle intent classifier for a military service leaver companion service called MATE.

The user is in the EVALUATING phase — they have completed capability identification and are exploring civilian pathways and reflecting on next steps.

Current state:
- Soak period: ${soakState}
- Pathways evaluated: ${pathwayCount}

Classify the user's message into ONE of these intents:
- "reflecting": User is discussing, exploring, thinking, asking questions. No action needed.
- "expressing_factor": User expresses a decision factor — what matters to them (e.g. family, location, money, purpose, lifestyle, health).
- "ready_to_soak": User wants time to think, asks for space, says they need to reflect before deciding.
- "returning_from_soak": User has been away and is now back with thoughts or reflection. Only valid if soak_state is SOAKING.
- "skipping_soak": User explicitly chooses to skip reflection and move forward. Only valid if soak_state is NOT_STARTED or SOAKING.
- "ready_to_act": User feels ready to move forward to practical action.
- "declining": User declines to advance, resists progression, or changes the subject.
- "rejecting_direction": User explicitly rejects, dismisses, or tells Smudge to stop discussing a specific career direction or work area. This includes rejections of pathways AND rejections of directions inferred from capabilities (e.g., "I don't want to do engineering" when engineering was suggested based on welding capability). When this intent is detected, also return "rejected_direction": a short lowercase label for the direction being rejected (e.g., "logistics", "engineering", "supply chain", "welding"). Extract this from the user's words, not from internal pathway names.
- "orientation": User asks what this is, what you can do, how it works.

IMPORTANT: When ambiguous, default to "reflecting". Do not over-classify. A user saying "I'm thinking about it" is "reflecting", not "ready_to_soak". "I want to move forward" is "ready_to_act" only if soak is completed or bypassed.

User message: "${userMessage}"
Recent conversation:
${recentStr}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          intent: { type: "string", enum: ["reflecting", "expressing_factor", "ready_to_soak", "returning_from_soak", "skipping_soak", "ready_to_act", "declining", "rejecting_direction", "orientation"] },
          rejected_direction: { type: "string", description: "Short lowercase label for the rejected direction, if intent is rejecting_direction. Empty string or omitted otherwise." }
        },
        required: ["intent"]
      }
    });
    return { intent: result?.intent || "reflecting", rejected_direction: result?.rejected_direction || "" };
  } catch {
    return { intent: "reflecting", rejected_direction: "" };
  }
}

async function classifyTransitionIntent(
  base44: any, userMessage: string, recentContext: any[], currentPhase: string, journeyActive: boolean
): Promise<string> {
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are classifying a user message during a military-to-civilian transition support conversation.

The user is in the ${currentPhase} phase — ${journeyActive ? "they are in an active transition journey, taking practical steps." : "they are ready to start their transition journey but have not begun yet."}

Classify the user message into exactly one:

For READY_TO_ACT (journey not yet started):
- "starting": User wants to begin taking practical steps, start the journey, get going.
- "reflecting": User is not ready to start yet, wants to think more, or is just chatting.
- "orientation": User asks what this is, what you can do, how it works.

For IN_TRANSITION (journey active):
- "milestone": User reports progress, achievement, something completed, good news.
- "blocker": User reports a setback, obstacle, challenge, something in the way.
- "resolve_blocker": User reports a previous obstacle has been overcome or resolved.
- "change_direction": User is changing their direction, pathway, or goal.
- "concluding": User expresses they no longer need help, they have got this, they are independent, ready to finish.
- "orientation": User asks what this is or what you can do.
- "conversing": General conversation, none of the above. Default for ambiguous.

For SETTLED (journey concluded, user independent):
- "re_entry": User's circumstances have changed, they need to re-engage with MATE, they want to come back, things have changed.
- "conversing": General conversation, catching up, sharing updates. Default.

IMPORTANT: When ambiguous, default to "conversing". Do not over-classify.

User message: "${userMessage}"

Return JSON: { "intent": "<one of the above>" }`,
      response_json_schema: {
        type: "object",
        properties: { intent: { type: "string" } },
        required: ["intent"]
      }
    });
    return result?.intent || "conversing";
  } catch {
    return "conversing";
  }
}

// D1: Build EVALUATING engine context for prompt
function buildEvaluatingEngineContext(
  pathways: any[], soakState: string, expressedFactors: string[], engineAction: string, stateChanged: boolean, rejectedDirections: any[]
): string {
  const parts: string[] = [];

  // B01: Filter out rejected directions from pathways
  const rejectedDirs = Array.isArray(rejectedDirections) ? rejectedDirections : [];
  const filteredPathways = pathways.filter((p: any) => {
    const name = (p.pathway_name || p.name || "").toLowerCase();
    return !rejectedDirs.some((r: any) =>
      tokenOverlap(name, r.direction) >= 0.4 || name.includes(r.direction) || r.direction.includes(name)
    );
  });

  if (filteredPathways && filteredPathways.length > 0) {
    parts.push("CIVILIAN PATHWAYS THAT MATCH THIS PERSON'S CAPABILITIES:");
    for (const p of filteredPathways.slice(0, 4)) {
      parts.push(`- ${p.pathway_name} (${p.confidence_level})`);
      if (p.capability_explanation) parts.push(`  Why: ${p.capability_explanation}`);
      if (p.matching_capabilities && p.matching_capabilities.length > 0) parts.push(`  Matching capabilities: ${p.matching_capabilities.join(", ")}`);
      if (p.decision_factor_alignment) parts.push(`  Personal fit: ${p.decision_factor_alignment}`);
      if (p.unresolved_gaps && p.unresolved_gaps.length > 0) parts.push(`  Gaps to consider: ${p.unresolved_gaps.join("; ")}`);
    }
    parts.push("");
    parts.push("Present these as observations, not directives. Do NOT say 'you should' or 'I recommend'. Say 'this looks like it could fit' or 'this aligns with what you've told me'.");
  }

  if (soakState === "SOAKING") {
    parts.push("REFLECTION PERIOD: The user is currently in a reflection period (soak). They took time to think. Ask how their thinking went. Do not push them to act.");
  } else if (soakState === "NOT_STARTED" && pathways.length > 0) {
    parts.push("REFLECTION PERIOD: Not yet started. If the user seems uncertain, you can mention there's no rush — they can take time to think about what they've explored. But do not force it.");
  } else if (soakState === "COMPLETED") {
    parts.push("REFLECTION PERIOD: Completed. The user has reflected and is ready to move forward when they choose.");
  } else if (soakState === "BYPASSED") {
    parts.push("REFLECTION PERIOD: Skipped. The user chose to move forward without reflection. That's their choice.");
  }

  if (expressedFactors && expressedFactors.length > 0) {
    parts.push(`WHAT MATTERS TO THIS PERSON: ${expressedFactors.join(", ")}`);
  }

  if (engineAction === "evaluate_pathways") {
    parts.push("NOTE: Pathways have just been evaluated. Present them naturally in this response.");
  }

  if (engineAction === "initiate_soak") {
    parts.push("NOTE: The user has been offered a reflection period. Acknowledge this warmly — they're taking time to think.");
  }

  if (stateChanged) {
    parts.push("NOTE: The lifecycle state has changed. The user is now READY_TO_ACT. Acknowledge their decision and let them know they can take practical steps when ready.");
  }

  return parts.length > 0 ? parts.join("\n") : "";
}

function buildTransitionEngineContext(
  journeyStatus: any, d2_engine_action: string, d2_state_changed: boolean, currentPhase: string
): string {
  if (!journeyStatus || !journeyStatus.active) {
    if (currentPhase === "READY_TO_ACT") {
      return "The user is ready to begin their transition journey but has not started yet. If they want to start, acknowledge it positively. If they want to talk first, that is fine too.";
    }
    return "";
  }

  const parts: string[] = [];
  parts.push(`Active journey: ${journeyStatus.partnership_state}`);
  if (journeyStatus.current_direction) parts.push(`Current direction: ${journeyStatus.current_direction}`);
  if (journeyStatus.significant_milestones?.length > 0)
    parts.push(`Milestones recorded: ${journeyStatus.significant_milestones.length}`);
  if (journeyStatus.current_blockers?.length > 0)
    parts.push(`Current blockers: ${journeyStatus.current_blockers.join("; ")}`);

  if (d2_state_changed) {
    if (d2_engine_action === "start_journey")
      parts.push("NOTE: The transition journey has just started. The user is now IN_TRANSITION. Acknowledge this positively.");
    else if (d2_engine_action === "conclude_journey")
      parts.push("NOTE: The journey has concluded. The user is now SETTLED. Acknowledge their independence. The goal was independence, not dependence.");
  }

  if (d2_engine_action === "record_milestone")
    parts.push("NOTE: A milestone has been recorded. Acknowledge the progress.");
  else if (d2_engine_action === "record_blocker")
    parts.push("NOTE: A blocker has been recorded. Acknowledge it as positional, not permanent.");
  else if (d2_engine_action === "resolve_blocker")
    parts.push("NOTE: A blocker has been resolved. The path forward is clearer.");
  else if (d2_engine_action === "update_direction")
    parts.push("NOTE: Direction has changed. Changing direction is evidence of learning, not failure.");

  return parts.length > 0 ? parts.join("\n") : "";
}

async function handlePostConfirmingState(
  base44: any,
  profile: any,
  profile_id: string,
  currentPhase: string,
  userMessage: string,
  recentContext: any,
  convState: any,
  convStateId: string | null,
  cors: Record<string, string>,
  origin: string,
  authHeader: string | null
): Promise<Response> {
  // 1. Lightweight safety classification
  let safetyClass = "none";
  try {
    const safetyPrompt = `You are a safety classifier for a military service leaver companion service.

Read the user's message and classify:
- "none": No safety concern. Normal conversation, questions, discussion, frustration, or everyday language.
- "clear_concern": Genuine crisis intent, self-harm risk, or suicidal ideation. Anger, frustration, profanity WITHOUT expressed self-harm intent is NOT concern.
- "ambiguous": Could be concerning or benign — genuinely cannot tell. Example: "ending it" without context.

Conservative backstop: when uncertainty cannot safely be resolved, classify as "ambiguous". Safety wins.

User message: "${userMessage}"
Profile context: ${buildProfileContext(profile)}`;

    const safetyResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: safetyPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          classification: { type: "string", enum: ["none", "clear_concern", "ambiguous"] }
        },
        required: ["classification"]
      }
    });
    safetyClass = safetyResult?.classification || "none";
  } catch {
    // If safety classification fails, proceed with caution — the generation prompt includes safety awareness
    safetyClass = "none";
  }

  // Handle safety concern — same pathway as EXPLORING/CONFIRMING
  if (safetyClass === "clear_concern") {
    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      safety_flags: JSON.stringify({
        safety_concern_pending: true,
        trigger_phrase: userMessage,
        trigger_context: buildSafetyContext(profile, recentContext)
      })
    });
    return new Response(JSON.stringify({
      success: true,
      response_text: "I'm here. That sounds really difficult. You don't have to face this alone. Samaritans is available 24/7 on 116 123, and NHS 111 can help too.",
      response_intent: "CLARIFY", asks_question: true,
      tos_phase: currentPhase, state_changed: false,
      candidate_discoveries_count: 0, accepted_discoveries_count: 0,
      companion_result: null, recoverable_error: null,
      orchestration_note: "POST_CONFIRMING_SAFETY_CONCERN",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: { safety_flow: "CONCERN", phase: currentPhase, safety_pending: true }
    }), { headers: cors });
  }

  if (safetyClass === "ambiguous") {
    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      safety_flags: JSON.stringify({
        safety_clarification_pending: true,
        trigger_phrase: userMessage,
        trigger_context: buildSafetyContext(profile, recentContext)
      })
    });
    return new Response(JSON.stringify({
      success: true,
      response_text: "Can you help me understand what you mean by that?",
      response_intent: "CLARIFY", asks_question: true,
      tos_phase: currentPhase, state_changed: false,
      candidate_discoveries_count: 0, accepted_discoveries_count: 0,
      companion_result: null, recoverable_error: null,
      orchestration_note: "POST_CONFIRMING_SAFETY_AMBIGUOUS",
      companion_core_version: COMPANION_CORE_VERSION,
      _internal: { safety_flow: "AMBIGUOUS", phase: currentPhase, safety_pending: true }
    }), { headers: cors });
  }

  // 1b. CAPABILITY HANDOVER CHECK (CONFIRMED only — Packet 3)
  // Authority already established by progression to CONFIRMED.
  // This checks conversational context only — NOT a permission gate.
  // Default = proceed. Explicit deferral = remain conversational.
  if (currentPhase === "CONFIRMED") {
    const deferralClass = await classifyDeferral(base44, userMessage, recentContext);
    if (deferralClass === "proceed") {
      return await handleCapabilityHandover(
        base44, profile, profile_id, userMessage, recentContext,
        convState, convStateId, cors
      );
    }
    // "defer": fall through to normal conversation
  }

  // ==================================================
  // D1: EVALUATING ENGINE INTEGRATION
  // Calls engineDecisionReadiness for pathway evaluation, soak management.
  // Engine owns EVALUATING -> READY_TO_ACT transition (via complete_soak / bypass_soak).
  // ==================================================
  let d1_engine_context = "";
  let d1_state_changed = false;
  let d1_new_phase = currentPhase;
  let d1_engine_action = "none";
  let d1_engine_error: string | null = null;

  if (currentPhase === "EVALUATING") {
    // 1. Call get_status to read current engine state
    const statusResult = await inlineEngineAction(base44, profile, profile_id, "get_status");

    if (statusResult.success) {
      const status = statusResult.data;
      const soakState = status.soak_state || "NOT_STARTED";
      const pathwayCount = status.pathway_count || 0;
      const expressedFactors = status.expressed_decision_factors || [];

      // 2. First EVALUATING turn: evaluate pathways if not yet done
      let currentPathways: any[] = [];
      if (pathwayCount === 0 && soakState === "NOT_STARTED") {
        const evalResult = await inlineEngineAction(base44, profile, profile_id, "evaluate_pathways");
        if (evalResult.success) {
          d1_engine_action = "evaluate_pathways";
          try {
            const updatedProfile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
            const rp = updatedProfile.recommended_pathways;
            currentPathways = typeof rp === "string" ? JSON.parse(rp) : (Array.isArray(rp) ? rp : []);
          } catch { currentPathways = []; }
        } else {
          d1_engine_error = evalResult.error;
        }
      } else if (pathwayCount > 0) {
        currentPathways = Array.isArray(profile.recommended_pathways) ? profile.recommended_pathways : [];
      }

      // 3. Classify lifecycle intent
      const evalIntentResult = await classifyEvaluatingIntent(base44, userMessage, recentContext, soakState, pathwayCount);
      const intent = evalIntentResult.intent;
      // B01: Persist rejected direction as evidence_log entry (area: "rejected_direction")
      if (intent === "rejecting_direction" && evalIntentResult.rejected_direction) {
        try {
          const dirLabel = evalIntentResult.rejected_direction.toLowerCase().trim();
          const existingRejected = extractRejectedDirections(profile);
          if (!existingRejected.some((r: any) => r.direction === dirLabel)) {
            const newEntry = {
              evidence_id: crypto.randomUUID(),
              area: "rejected_direction",
              content: dirLabel,
              source_type: "conversation",
              source_reference: "Explicit rejection during evaluation",
              source_text: userMessage.slice(0, 300),
              recorded_date: new Date().toISOString()
            };
            const updatedEvidenceLog = [...(Array.isArray(profile.evidence_log) ? profile.evidence_log : []), newEntry];
            await base44.asServiceRole.entities.UserProfile.update(profile_id, {
              evidence_log: JSON.stringify(updatedEvidenceLog)
            });
            profile.evidence_log = updatedEvidenceLog;
          }
        } catch { /* B01 persistence failure — non-fatal, rejection still handled conversationally */ }
      }

      // 4. Handle engine actions based on intent
      if (intent === "ready_to_soak" && soakState === "NOT_STARTED") {
        const soakResult = await inlineEngineAction(base44, profile, profile_id, "initiate_soak");
        if (soakResult.success) {
          d1_engine_action = "initiate_soak";
        } else {
          d1_engine_error = soakResult.error;
        }
      } else if (intent === "returning_from_soak" && soakState === "SOAKING") {
        const soakResult = await inlineEngineAction(base44, profile, profile_id, "complete_soak", { reflection_notes: userMessage.slice(0, 500) });
        if (soakResult.success) {
          d1_state_changed = true;
          d1_new_phase = "READY_TO_ACT";
          d1_engine_action = "complete_soak";
        } else {
          d1_engine_error = soakResult.error;
        }
      } else if (intent === "skipping_soak" && (soakState === "NOT_STARTED" || soakState === "SOAKING")) {
        const bypassReason = userMessage.length >= 10 ? userMessage : "User chose to skip reflection period and move forward";
        const soakResult = await inlineEngineAction(base44, profile, profile_id, "bypass_soak", { soak_bypass_reason: bypassReason.slice(0, 200) });
        if (soakResult.success) {
          d1_state_changed = true;
          d1_new_phase = "READY_TO_ACT";
          d1_engine_action = "bypass_soak";
        } else {
          d1_engine_error = soakResult.error;
        }
      }
      // expressing_factor: Known safe limitation — orchestrator cannot provide evidence_ref.
      // Decision factors recorded during assessment/capability handover. Orchestrator references conversationally.
      // orientation: D3 scope — handled as reflecting for D1.

      // 5. Build engine context for prompt
      d1_engine_context = buildEvaluatingEngineContext(
        currentPathways, soakState, expressedFactors, d1_engine_action, d1_state_changed, extractRejectedDirections(profile)
      );

      // 6. Update profile if state changed
      if (d1_state_changed) {
        try {
          const updatedProfile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
          profile = deserializeProfile(updatedProfile);
        } catch { /* graceful degradation */ }
      }
    } else {
      d1_engine_error = statusResult.error;
      // Engine unavailable — graceful degradation. Continue conversationally.
    }
  }


  // ==================================================
  // D2: TRANSITION PARTNERSHIP ENGINE INTEGRATION
  // Handles READY_TO_ACT → IN_TRANSITION → SETTLED lifecycle.
  // Mirrors engineTransitionPartnership inline (same platform constraint as D1).
  // ==================================================
  let d2_engine_context = "";
  let d2_state_changed = false;
  let d2_new_phase = currentPhase;
  let d2_engine_action = "none";
  let d2_engine_error: string | null = null;

  if (currentPhase === "READY_TO_ACT" || currentPhase === "IN_TRANSITION") {
    // 1. Get current journey status
    const journeyResult = await inlineTPAction(base44, profile, profile_id, "get_journey_status");
    const journeyStatus = journeyResult.success ? journeyResult.data : null;
    const journeyActive = journeyStatus?.active === true;

    if (currentPhase === "READY_TO_ACT" && !journeyActive) {
      // 2a. READY_TO_ACT: classify intent — does user want to start?
      const intent = await classifyTransitionIntent(base44, userMessage, recentContext, currentPhase, false);
      if (intent === "starting") {
        const startResult = await inlineTPAction(base44, profile, profile_id, "start_journey");
        if (startResult.success) {
          d2_engine_action = "start_journey";
          d2_state_changed = true;
          d2_new_phase = "IN_TRANSITION";
        } else {
          d2_engine_error = startResult.error;
        }
      }
    } else if (currentPhase === "IN_TRANSITION" && journeyActive) {
      // 2b. IN_TRANSITION: classify intent and dispatch action
      const intent = await classifyTransitionIntent(base44, userMessage, recentContext, currentPhase, true);

      if (intent === "milestone") {
        const milestoneText = userMessage.slice(0, 300);
        const result = await inlineTPAction(base44, profile, profile_id, "record_milestone", { milestone_text: milestoneText });
        if (result.success) d2_engine_action = "record_milestone";
        else d2_engine_error = result.error;
      } else if (intent === "blocker") {
        const blockerText = userMessage.slice(0, 200);
        const result = await inlineTPAction(base44, profile, profile_id, "record_blocker", { blocker: blockerText });
        if (result.success) d2_engine_action = "record_blocker";
        else d2_engine_error = result.error;
      } else if (intent === "resolve_blocker") {
        const blockerText = userMessage.slice(0, 200);
        const result = await inlineTPAction(base44, profile, profile_id, "resolve_blocker", { blocker: blockerText });
        if (result.success) d2_engine_action = "resolve_blocker";
        else d2_engine_error = result.error;
      } else if (intent === "change_direction") {
        const newDirection = userMessage.slice(0, 200);
        const result = await inlineTPAction(base44, profile, profile_id, "update_direction", { new_direction: newDirection });
        if (result.success) d2_engine_action = "update_direction";
        else d2_engine_error = result.error;
      } else if (intent === "concluding") {
        const summary = userMessage.slice(0, 500);
        const result = await inlineTPAction(base44, profile, profile_id, "conclude_journey", { summary });
        if (result.success) {
          d2_engine_action = "conclude_journey";
          d2_state_changed = true;
          d2_new_phase = "SETTLED";
        } else {
          d2_engine_error = result.error;
        }
      }
      // "conversing" and "orientation": no engine action, continue conversationally
    }

    // 3. Build engine context
    const refreshedStatus = d2_state_changed
      ? await inlineTPAction(base44, profile, profile_id, "get_journey_status")
      : { success: true, data: journeyStatus };
    d2_engine_context = buildTransitionEngineContext(
      refreshedStatus.success ? refreshedStatus.data : journeyStatus,
      d2_engine_action, d2_state_changed,
      d2_state_changed ? d2_new_phase : currentPhase
    );

    // 4. Refresh profile if state changed
    if (d2_state_changed) {
      try {
        const updatedProfile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
        profile = deserializeProfile(updatedProfile);
      } catch { /* graceful degradation */ }
    }
  }

  // ==================================================
  // D3: SETTLED RE-ENTRY
  // Handles SETTLED → EVALUATING on explicit user re-entry authority.
  // Preserves concluded TransitionJourney, capability_map, POP evidence.
  // Does NOT reset soak_period (existing EVALUATING flow can safely operate with COMPLETED soak).
  // ==================================================
  let d3_engine_context = "";
  let d3_state_changed = false;
  let d3_new_phase = currentPhase;
  let d3_engine_action = "none";
  let d3_engine_error: string | null = null;

  if (currentPhase === "SETTLED") {
    const reEntryIntent = await classifyTransitionIntent(base44, userMessage, recentContext, currentPhase, false);

    if (reEntryIntent === "re_entry") {
      try {
        await base44.asServiceRole.entities.UserProfile.update(profile_id, { tos_phase: "EVALUATING" });
        d3_engine_action = "re_entry";
        d3_state_changed = true;
        d3_new_phase = "EVALUATING";
        d3_engine_context = "The user has re-entered MATE after their journey was concluded. Their circumstances have changed. Previous capabilities and pathways were identified before — present them as 'what we identified before' not 'what you are good at now'. The user needs to re-explore. Acknowledge their return warmly.";

        // Refresh profile after transition
        try {
          const updatedProfile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
          profile = deserializeProfile(updatedProfile);
        } catch { /* graceful degradation */ }
      } catch (err: any) {
        d3_engine_error = `Re-entry failed: ${err?.message || "Unknown error"}`;
      }
    }
    // "conversing": no engine action, continue conversationally (D3-T1 already satisfied by D2)
  }

  // 2. Build state-aware prompt and generate response
  let responseText = "";
  let responseIntent = "ACKNOWLEDGE";
  let asksQuestion = false;
  let generationFallback = false;

  try {
    const engineContext = [d1_engine_context, d2_engine_context, d3_engine_context].filter(Boolean).join("\n\n");
    const prompt = buildStateAwarePrompt(profile, currentPhase, userMessage, recentContext, engineContext);
    const generation = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: postConfirmingSchema
    });

    if (generation && typeof generation === "object" &&
        typeof generation.response_text === "string" &&
        generation.response_text.trim().length > 0) {
      responseText = generation.response_text.trim();
      responseIntent = ["ACKNOWLEDGE", "EXPLORE", "CLARIFY"].includes(generation.response_intent) ? generation.response_intent : "ACKNOWLEDGE";
      asksQuestion = generation.asks_question === true;
      // B02: Post-generation [Insert] detection — fail closed, no regeneration
      if (/\[Insert\s/i.test(responseText)) {
        responseText = "I don't have the ability to look up external services or support. If you need help finding something specific, I'd suggest speaking to your transition partner or looking into it directly.";
        generationFallback = true;
      }
    } else {
      generationFallback = true;
    }
  } catch {
    generationFallback = true;
  }

  // Fallback responses (state-specific)
  if (generationFallback || !responseText) {
    const stateInfo = STATE_CONTEXT[currentPhase] || STATE_CONTEXT["CONFIRMED"];
    if (currentPhase === "CONFIRMED") {
      responseText = "Good to hear from you. We've got a solid picture of where you're coming from. Whenever you're ready, we can start looking at what you're actually good at — but there's no rush.";
    } else if (currentPhase === "EVALUATING") {
      responseText = "Good to talk. How are you finding things? We can chat about what you've discovered, or just have a normal conversation.";
    } else if (currentPhase === "READY_TO_ACT") {
      responseText = "Good to hear from you. How are you feeling about things? We can talk about what you're thinking of doing next, or just chat.";
    } else if (currentPhase === "IN_TRANSITION") {
      responseText = "Good to hear from you. How are things going? I'm here to chat about whatever's on your mind.";
    } else if (currentPhase === "SETTLED") {
      responseText = "Good to hear from you. How are things? I'm here if you need me — no agenda, just a conversation.";
    } else {
      responseText = "I hear you. Go on.";
    }
    responseIntent = "ACKNOWLEDGE";
    asksQuestion = true;
  }

  // 3. Post-generation identity validation
  let generationValidation = "PASSED";
  if (!generationFallback && responseText) {
    const validation = validateGeneration(responseText, false);
    if (!validation.valid && validation.violation === "identity") {
      generationValidation = "IDENTITY_VIOLATION_FAIL_CLOSED";
      responseText = "I got that wrong — I don't have military experience. I'm a companion, not a veteran. I shouldn't have said that.";
    }
  }

  // 4. ConversationState update
  let convStatePersisted = false;
  if (convStateId) {
    try {
      const now = new Date().toISOString();
      let sessionStartedDate = convState.session_started_date || now;
      // Session boundary detection (same as EXPLORING/CONFIRMING)
      if (convState.last_interaction_date) {
        const diffMin = (Date.now() - new Date(convState.last_interaction_date).getTime()) / 60000;
        if (diffMin > 30) sessionStartedDate = now;
      }

      await base44.asServiceRole.entities.ConversationState.update(convStateId, {
        last_smudge_response: truncateResponse(responseText),
        last_smudge_intent: responseIntent,
        last_interaction_date: now,
        session_started_date: sessionStartedDate
      });
      convStatePersisted = true;
    } catch {
      convStatePersisted = false;
    }
  }

  // 5. Return response
  return new Response(JSON.stringify({
    success: true,
    response_text: responseText,
    response_intent: responseIntent,
    asks_question: asksQuestion,
    tos_phase: (d1_state_changed || d2_state_changed || d3_state_changed) ? (d3_state_changed ? d3_new_phase : (d2_state_changed ? d2_new_phase : d1_new_phase)) : currentPhase,
    state_changed: d1_state_changed || d2_state_changed || d3_state_changed,
    candidate_discoveries_count: 0,
    accepted_discoveries_count: 0,
    companion_result: null,
    recoverable_error: d3_engine_error || d2_engine_error || d1_engine_error,
    orchestration_note: d3_engine_action !== "none" ? `D3_ENGINE_${d3_engine_action.toUpperCase()}` : (d2_engine_action !== "none" ? `D2_ENGINE_${d2_engine_action.toUpperCase()}` : (d1_engine_action !== "none" ? `D1_ENGINE_${d1_engine_action.toUpperCase()}` : "POST_CONFIRMING_CONVERSATIONAL")),
    companion_core_version: COMPANION_CORE_VERSION,
    _internal: {
      phase: (d1_state_changed || d2_state_changed || d3_state_changed) ? (d3_state_changed ? d3_new_phase : (d2_state_changed ? d2_new_phase : d1_new_phase)) : currentPhase,
      safety_check: safetyClass,
      d1_engine_action: d1_engine_action,
      d1_engine_error: d1_engine_error,
      d2_engine_action: d2_engine_action,
      d2_engine_error: d2_engine_error,
      d3_engine_action: d3_engine_action,
      d3_engine_error: d3_engine_error,
      generation: {
        intent: responseIntent,
        asks_question: asksQuestion,
        fallback: generationFallback,
        validation: generationValidation
      },
      conversation_state_persisted: convStatePersisted,
      lifecycle_neutral: true
    }
  }), { headers: cors });
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
    const recent_context = body.recent_context || null;  // R1: Frontend passes 3-4 recent exchanges
    const base44 = createClientFromRequest(req);
    const origin = new URL(req.url).origin;

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
    // 1c. SMUDGE CAPABILITY AWARENESS (D3 — cross-lifecycle)
    // Orientation check runs BEFORE state routing.
    // Lifecycle-neutral: no engine call, no state change.
    // Canonical statement is grounding for generation, not verbatim response.
    // If generation fails, canonical statement is returned directly.
    // ==================================================
    if (isOrientationQuestion(user_message)) {
      try {
        const orientationResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `You are Smudge, a companion for people leaving the military. The user has asked what you can do or what this is.

Here is your canonical capability statement — this is the AUTHORITATIVE BOUNDARY on what you may claim. Express it naturally in your own voice. Do NOT add capabilities, functionality or claims outside this boundary. Keep it conversational, warm, and honest.

CANONICAL CAPABILITY STATEMENT:
${SMUDGE_CAPABILITY_STATEMENT}

The user is currently in the ${currentPhase} phase. Do not reference lifecycle phases or internal states. Express the statement naturally in 2-4 sentences. Be warm and genuine.

User message: "${user_message}"

Return JSON: { "response_text": "<your natural expression>", "response_intent": "EXPLAIN", "asks_question": true }`,
          response_json_schema: {
            type: "object",
            properties: {
              response_text: { type: "string" },
              response_intent: { type: "string" },
              asks_question: { type: "boolean" }
            },
            required: ["response_text", "response_intent", "asks_question"]
          }
        });

        let orientText = orientationResult?.response_text || SMUDGE_CAPABILITY_STATEMENT;
        const orientValidation = validateGeneration(orientText, true);
        if (!orientValidation.valid && orientValidation.violation === "identity") {
          orientText = "I'm not a veteran. I'm a companion who helps people leaving the military see themselves more clearly. I can listen to your story, show you civilian pathways that match what you're good at, and walk with you while you figure out your next steps. What would you like to explore?";
        }

        return new Response(JSON.stringify({
          success: true,
          response_text: orientText,
          response_intent: "EXPLAIN",
          asks_question: orientationResult?.asks_question !== false,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "D3_CAPABILITY_AWARENESS",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: {
            phase: currentPhase,
            orientation: true,
            generation_fallback: !orientationResult?.response_text,
            lifecycle_neutral: true
          }
        }), { headers: cors });
      } catch {
        // Deterministic fallback: return canonical statement directly
        return new Response(JSON.stringify({
          success: true,
          response_text: SMUDGE_CAPABILITY_STATEMENT,
          response_intent: "EXPLAIN",
          asks_question: true,
          tos_phase: currentPhase, state_changed: false,
          candidate_discoveries_count: 0, accepted_discoveries_count: 0,
          companion_result: null, recoverable_error: null,
          orchestration_note: "D3_CAPABILITY_AWARENESS_FALLBACK",
          companion_core_version: COMPANION_CORE_VERSION,
          _internal: {
            phase: currentPhase,
            orientation: true,
            generation_fallback: true,
            lifecycle_neutral: true
          }
        }), { headers: cors });
      }
    }

    // ==================================================
    // 2. PHASE ROUTING — EXPLORING + CONFIRMING / POST-CONFIRMING
    // R1-C.1F PACKET 1: CONVERSATIONAL LIFELINE
    // No lifecycle state may disable the companion relationship.
    // Post-CONFIRMING states get state-aware conversational handling.
    // D1: EVALUATING now invokes engineDecisionReadiness. Other post-CONFIRMING states remain conversational.
    // ==================================================

    if (currentPhase !== "EXPLORING" && currentPhase !== "CONFIRMING") {
      const authHeader = req.headers.get("authorization");
      return await handlePostConfirmingState(
        base44, profile, profile_id, currentPhase,
        user_message, recent_context, convState, convStateId, cors, origin, authHeader
      );
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
      "\nSmudge's last conversational act: " + (convState?.last_smudge_intent || "none (first message or session reset)") + "\n" +
      'The user just said: "' + user_message + '"\n\n' +
      "CLASSIFY THE USER'S RESPONSE TYPE based on what Smudge just asked or did. The user's affirmation only has the authority of the question it answers. See the user_response_type schema description for binding rules.\n\n" +
      "Extract candidate discoveries from this message. Rules:\n" +
      "1. Only extract what the user DIRECTLY expressed or STRONGLY implied\n" +
      "2. Do NOT invent or fabricate information\n" +
      "3. Classify each discovery as:\n" +
      "   - direct_statement: user explicitly stated this\n" +
      "   - reasonable_interpretation: strong inference from what was said\n" +
      "   - uncertain: weak inference or guess\n" +
      "4. Include the user's actual words as source_text for each discovery\n" +
      "5. Map each discovery to a UserProfile field (e.g., professional_identity, service_branch, rank, service_history, personal_context, goals, operational_context, user_confidence)\n\n" +
      "R1-C.1E EXTRACTION DOCTRINE:\n" +
      "6. DECOMPOSITION: If the user's statement contains multiple pieces of information, decompose it into separate candidate discoveries. Each atomic fact gets its own entry with its own source_text (the user's actual words for that specific fact). Do not combine unrelated facts into a single discovery.\n" +
      "7. STRUCTURED VALUES: For service_history and operational_context, use structured_value (an object) instead of value (a string). Only include properties the user actually mentioned. Omit unmentioned properties entirely (do not include them as empty strings or null). Do not infer or enrich.\n" +
      "   - service_history structured_value: { role, responsibilities, achievements, leadership_scope } — only include properties the user stated\n" +
      "   - operational_context structured_value: { factor, description } — factor is the category, description is what they said\n" +
      "   FEW-SHOT EXAMPLES for structured_value and decomposition:\n" +
      "   User: 'I was a Metalsmith in REME for 6 years, mostly doing welding and fabrication'\n" +
      "     → { field: 'service_branch', value: 'REME', source_type: 'direct_statement', source_text: 'in REME', confidence: 'high' }\n" +
      "     → { field: 'years_served', value: '6', source_type: 'direct_statement', source_text: 'for 6 years', confidence: 'high' }\n" +
      "     → { field: 'service_history', structured_value: { role: 'Metalsmith', responsibilities: 'welding and fabrication' }, source_type: 'direct_statement', source_text: 'I was a Metalsmith in REME for 6 years, mostly doing welding and fabrication', confidence: 'high' }\n" +
      "   User: 'I did two tours in Iraq'\n" +
      "     → { field: 'operational_context', structured_value: { factor: 'operational deployments', description: 'two tours in Iraq' }, source_type: 'direct_statement', source_text: 'I did two tours in Iraq', confidence: 'high' }\n" +
      "   User: 'I had lads working under me'\n" +
      "     → { field: 'service_history', structured_value: { leadership_scope: 'had lads working under me' }, source_type: 'direct_statement', source_text: 'I had lads working under me', confidence: 'high' }\n" +
      "   User: 'My name is Tom'\n" +
      "     → { field: 'full_name', value: 'Tom', source_type: 'direct_statement', source_text: 'My name is Tom', confidence: 'high' }\n" +
      "8. PROVENANCE: Every structured atomic fact must be directly entailed by its source_text. Restructuring and faithful paraphrase are permitted. Introduction of new factual content is prohibited.\n" +
      "9. FIELD MAPPING:\n" +
      "   - full_name: The user's stated name. 'My name is Tom' → full_name: 'Tom'. 'I'm Dave' → full_name: 'Dave'.\n" +
      "   - professional_identity: The user's trade, role, or professional self-description. NOT what they lack or haven't done. 'I'm a welder' → professional_identity. 'I don't have civilian network experience' → NOT professional_identity.\n" +
      "   - service_branch: The user's stated service branch. 'I was in REME' → service_branch: 'REME'. 'I served in the Royal Engineers' → service_branch: 'Royal Engineers'. 'I was in the Army' → service_branch: 'Army'.\n" +
      "   - rank: The user's stated military rank. 'I'm a Craftsman' → rank: 'Craftsman'. 'I was a Lance Corporal' → rank: 'Lance Corporal'. 'I'm a Sergeant' → rank: 'Sergeant'. 'I made it to Captain' → rank: 'Captain'.\n" +
      "   - years_served: The user's stated duration of service as a string number. '6 years' → years_served: '6'. '8 years in the Army' → years_served: '8'.\n" +
      "   - user_confidence: Extract as a number ONLY if the user explicitly stated a number or directly equivalent numeric expression (e.g., 'I'd say 7 out of 10', 'maybe 8'). Do NOT convert qualitative language ('pretty confident', 'not sure') into a number. If qualitative, do not extract a user_confidence value.\n\n" +
      "10. CONTEXTUAL EXTRACTION: Interpret the user's words in the context of the conversational act they are answering.\n" +
      "If Smudge's last act was PROGRESSION_INVITATION and the user declines (e.g., 'No, I'd like to stay here', 'Not yet', 'I'd rather wait'), the declining language itself is NOT a discovery.\n" +
      "'Here' refers to remaining at the current lifecycle position, not a geographic or personal-context disclosure.\n" +
      "Only extract discoveries from independently expressed new information that the user provides alongside the decline.\n" +
      "Example: 'No, I'd like to stay here for now' - no discoveries (pure decline). 'No, I'd rather stay here - and I also just got my CSCS card' - extract the CSCS card as new evidence; do not extract 'stay here' as personal_context.\n\n" +
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
          structured_value: {
            type: "object",
            description: "Structured value for service_history or operational_context. Populate ONLY properties the user stated. Omit unmentioned properties entirely.",
            properties: {
              role: { type: "string", description: "The user's stated role/trade (e.g. 'Metalsmith')" },
              responsibilities: { type: "string", description: "What the user said they did (e.g. 'welding and fabrication')" },
              achievements: { type: "string", description: "Stated achievements" },
              leadership_scope: { type: "string", description: "Stated leadership responsibility" },
              factor: { type: "string", description: "Category for operational_context (e.g. 'operational deployments')" },
              description: { type: "string", description: "What the user said (e.g. 'two tours in Iraq')" }
            },
            additionalProperties: false
          },
          source_type: { type: "string", enum: ["direct_statement", "reasonable_interpretation", "uncertain"] },
          source_text: { type: "string", description: "The user's actual words that led to this extraction" },
          confidence: { type: "string", enum: ["high", "moderate", "low"] }
        }, required: ["field", "source_type", "source_text", "confidence"] } },
        intent: { type: "string", enum: ["answering", "correcting", "asking_question", "seeking_reassurance", "expressing_frustration", "sharing_milestone", "asking_orientation", "other"] },
        user_response_type: { type: "string", enum: ["answering", "correcting", "confirming", "rejecting", "progressing", "confirming_progressing", "declining", "none"], description: "Classify based on what Smudge just asked or did (see Smudge's last conversational act above) AND what the user explicitly expressed:\n- 'confirming': User explicitly affirms that Smudge's reflection/summary is accurate.\n- 'rejecting': User explicitly says Smudge's reflection is wrong.\n- 'progressing': User explicitly chooses to move forward to the next stage. May be in response to a Smudge progression invitation (PROGRESSION_INVITATION) OR independently and explicitly volunteered. Must be a clear, explicit statement of readiness to move on — not vague or conversational momentum.\n- 'confirming_progressing': User explicitly validates the reflection AND explicitly chooses to progress in the same utterance. Both intents must be independently identifiable — never infer one from the other.\n- 'declining': User explicitly declines a Smudge progression invitation. Only valid when Smudge's last act was PROGRESSION_INVITATION.\n- 'correcting': User corrects something Smudge said.\n- 'answering': None of the above.\n- 'none': No classification possible.\n\nKey rules: An affirmation only has the authority of the question it answers. Vague 'yeah', 'okay', 'sounds good' inherit ONLY the authority of the Smudge act they respond to. 'Let's go', 'carry on' are NOT explicit progression. 'I'm ready to move on', 'let's look at what I'm good at' ARE explicit progression. If declared last act does not match actual conversation text, classify based on actual text. Never infer progression from momentum." },
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
        // R1-C.1E F5 FIX: Accepted direct discoveries MUST persist even when
        // rejected non-direct discoveries exist. Set clarification text but
        // do NOT set g=true — companionCore runs and persists accepted evidence.
        m.clarification_needed = "Some of what you've said is clear, but I want to understand the rest better. Could you tell me more?";
      } else if (allDiscoveries.length === 0) {
        const { safe, down } = safeUserResponseType(R, currentPhase);
        R = safe;
        E = down;
        if (currentPhase === "CONFIRMING" && (R === "confirming" || R === "rejecting" || R === "progressing" || R === "confirming_progressing" || R === "declining")) {
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
        m.ready_to_reflect = false; // R1-C.1E Packet 3: driven by sufficiency gate, not checklist
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
    // 11b. SUFFICIENCY GATE (R1-C.1E PACKET 3)
    // Deterministic floor → LLM sufficiency judgment → reason-informed behaviour
    // ==================================================

    let sufficiencyResult: { sufficient: boolean; reason: string; missing: string[] } | null = null;
    let sufficiencyOrchestration = "SKIPPED";

    if (currentPhase === "EXPLORING" && T?.engineResult && !m.companion_error) {
      const areasWithSubstance = (T.engineResult.areas || []).filter((a: any) => a.has_substance).map((a: any) => a.area);
      const userObjective = derivedConvState?.user_objective || convState?.user_objective || "";

      const floorMet = checkSufficiencyFloor(T.engineResult.areas || [], userObjective);

      if (!floorMet) {
        sufficiencyOrchestration = "FLOOR_NOT_MET";
      } else {
        sufficiencyResult = await runSufficiencyGate(
          base44,
          T.mergedProfile || profile,
          T.engineResult,
          convState,
          recent_context
        );

        if (sufficiencyResult?.sufficient === true) {
          sufficiencyOrchestration = "SUFFICIENT";
          // Transition EXPLORING → CONFIRMING
          try {
            await base44.asServiceRole.entities.UserProfile.update(
              T.mergedProfile.id,
              { tos_phase: "CONFIRMING" }
            );
            m.tos_phase_after = "CONFIRMING";
            m.state_changed = true;
            m.lifecycle_transition = "EXPLORING → CONFIRMING";
            m.ready_to_confirm = true;
          } catch {
            sufficiencyOrchestration = "SUFFICIENT_PERSIST_FAILED";
          }
        } else if (sufficiencyResult && sufficiencyResult.missing[0] === "SUFFICIENCY_ANOMALOUS") {
          sufficiencyOrchestration = "SUFFICIENCY_ANOMALOUS";
          // No forced advancement. Log for diagnostic review.
        } else if (sufficiencyResult) {
          sufficiencyOrchestration = "NOT_SUFFICIENT";
          // Reason and missing passed to generation context
        } else {
          sufficiencyOrchestration = "LLM_FAILED";
        }
      }
    }

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
      // R1-C.1E PACKET 3: sufficiency reason-informed discovery
      sufficiency_reason: sufficiencyResult?.reason || null,
      sufficiency_missing: sufficiencyResult?.missing || [],
      sufficiency_orchestration: sufficiencyOrchestration,
      // R1-C.1D CONVERSATION AWARENESS [C1] [R4]
      conversation_awareness: conversationAwarenessStr,
      recent_context_for_gen: recentContextForGen,
      // Packet 2: progression state tracking
      progression_declined: R === "declining"
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
        // B02: Post-generation [Insert] detection — fail closed, no regeneration
        if (/\[Insert\s/i.test(responseText)) {
          responseText = "I don't have the ability to look up external services or support. If you need help finding something specific, I'd suggest speaking to your transition partner or looking into it directly.";
          generationFallback = true;
        }
        responseIntent = ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "PROGRESSION_INVITATION", "TRANSITION_ACKNOWLEDGEMENT"]
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
              responseIntent = ["ACKNOWLEDGE", "EXPLORE", "CLARIFY", "REFLECT", "CONFIRMATION_PROMPT", "PROGRESSION_INVITATION", "TRANSITION_ACKNOWLEDGEMENT"]
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

    // Packet 2 Addendum Layer 1: Intent fidelity check
    if (responseIntent === "PROGRESSION_INVITATION" && asksQuestion !== true) {
      responseIntent = "EXPLORE";
    }

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
        lifecycle_transition: m.lifecycle_transition
      } : null,
      recoverable_error: m.companion_error ? "COMPANION_CORE_ERROR" : null,
      orchestration_note: m.companion_error
        ? "COMPANION_CORE_FAILED"
        : g && m.clarification_needed
        ? "CLARIFICATION_PATH"
        : g && m.no_discoveries
        ? "NO_DISCOVERIES"
        : R === "confirming"
        ? "CONFIRMING_VALIDATED"
        : (R === "progressing" || R === "confirming_progressing") && m.state_changed
        ? "CONFIRMING_ADVANCED"
        : (R === "progressing" || R === "confirming_progressing") && !m.state_changed
        ? "CONFIRMING_NOT_VALIDATED"
        : R === "declining"
        ? (m.confirmed ? "CONFIRMING_DECLINED" : "CONFIRMING_ANSWERING")
        : R === "rejecting"
        ? "CONFIRMING_CORRECTED"
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
        sufficiency_gate: {
          orchestration: sufficiencyOrchestration,
          sufficient: sufficiencyResult?.sufficient ?? null,
          reason: sufficiencyResult?.reason ?? null,
          missing: sufficiencyResult?.missing ?? []
        },
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
