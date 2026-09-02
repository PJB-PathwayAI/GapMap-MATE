// Skills Inbox — MVP Text-Paste Document Injection
// Accepts pasted CV/skills-sheet/service-history text.
// Extracts factual information → populates UserProfile fields + creates evidence_log entries.
// Document claims are evidence, not automatically confirmed capability or user judgement.
// No lifecycle movement. No pathway evaluation. No soak activity. No engine changes.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── Inline helpers (self-contained — no cross-function imports) ───

const ARRAY_FIELDS = ['service_history', 'goals', 'operational_context', 'evidence_log', 'capability_map', 'confidence_scores', 'recommended_pathways', 'safety_flags', 'operational_picture_history', 'milestones'];
const OBJECT_FIELDS = ['assessment_confidence', 'decision_factors', 'soak_period', 'communication_preferences'];
const STRING_PERSIST_FIELDS = new Set(["user_confidence", "years_served"]);

function isSubstantive(value: any): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.trim().length >= 5;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function parseJSON(val: any, fallback: any = null): any {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function deserializeProfile(profile: any): any {
  for (const f of ARRAY_FIELDS) { profile[f] = parseJSON(profile[f], []); }
  for (const f of OBJECT_FIELDS) { profile[f] = parseJSON(profile[f]); }
  return profile;
}

function serializeForPersistence(data: any): any {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (value !== null && value !== undefined && typeof value === "object") {
      result[key] = JSON.stringify(value);
    } else if (STRING_PERSIST_FIELDS.has(key) && typeof value === "number") {
      result[key] = String(value);
    }
  }
  return result;
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
    const { text, profile_id, description } = body;

    // Validate inputs
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Text must be at least 10 characters of meaningful content." }), { status: 400, headers: cors });
    }
    if (!profile_id || typeof profile_id !== "string") {
      return new Response(JSON.stringify({ error: "profile_id is required." }), { status: 400, headers: cors });
    }

    const base44 = createClientFromRequest(req);

    // Get current profile
    let profile: any;
    try {
      profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    } catch {
      return new Response(JSON.stringify({ error: "Profile not found." }), { status: 404, headers: cors });
    }
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found." }), { status: 404, headers: cors });
    }

    profile = deserializeProfile(profile);

    // Capture current state for no-movement verification
    const phaseBefore = profile.tos_phase;
    const soakBefore = profile.soak_period ? JSON.stringify(profile.soak_period) : null;
    const pathwaysBefore = Array.isArray(profile.recommended_pathways) ? profile.recommended_pathways.length : 0;
    const opConfirmedBefore = profile.operational_picture_confirmed;

    // LLM extraction — document-specific prompt
    const sourceLabel = (description && typeof description === "string" && description.trim().length > 0)
      ? description.trim().slice(0, 100)
      : "Pasted document";

    const extractPrompt =
      "You are extracting factual information from a document provided by a military service leaver.\n\n" +
      "Document content:\n" + text + "\n\n" +
      "Extract factual capability and experience information. Rules:\n" +
      "1. Only extract what is DIRECTLY STATED in the document. Do NOT infer, interpret, or fabricate.\n" +
      "2. For each extracted fact, include the exact source text from the document as source_text.\n" +
      "3. Classify each discovery as:\n" +
      "   - direct_statement: explicitly stated in the document\n" +
      "   - uncertain: weak inference (should be rare — only use when the document implies something without stating it)\n" +
      "4. Assign confidence: \"high\" if directly stated, \"medium\" if inferred.\n" +
      "5. Map each fact to a UserProfile field:\n" +
      "   - full_name: The person's stated name (e.g., 'John Smith' from 'John Smith CV')\n" +
      "   - service_branch: Stated service branch (e.g., REME, Royal Engineers, Army, Navy, RAF)\n" +
      "   - rank: Stated rank (e.g., Lance Corporal, Sergeant, Captain)\n" +
      "   - years_served: Stated duration of service as a string number (e.g., '8' from '8 years')\n" +
      "   - professional_identity: Stated trade, role, or professional self-description (e.g., 'Metalsmith', 'Welder')\n" +
      "   - service_history: Use structured_value with { role, responsibilities, achievements, leadership_scope } — only include properties stated in the document\n" +
      "   - operational_context: Use structured_value with { factor, description } — factor is the category (e.g., 'operational deployments'), description is what was stated\n" +
      "   - personal_context: Current location, circumstances, or personal situation (if stated)\n" +
      "   - goals: Career goals or aspirations stated in the document\n" +
      "6. Do NOT extract:\n" +
      "   - Soft skills or personality traits (e.g., 'team player', 'hardworking') unless stated as a formal qualification\n" +
      "   - Marketing language, CV prose, or objective statements that aren't factual claims\n" +
      "   - Opinions, subjective self-assessments, or aspirational language\n" +
      "   - Contact information (address, phone, email)\n" +
      "7. DECOMPOSITION: If the document contains multiple pieces of information in one section, decompose into separate discoveries.\n8. NO N/A VALUES: For structured_value objects, only include properties that are directly stated in the document. Do NOT include 'N/A', 'not specified', or any placeholder for missing properties — just omit them.\n\n" +
      "Return a JSON object with a 'discoveries' array. Each discovery must have: field, value (for simple fields) or structured_value (for service_history/operational_context), source_type, source_text, confidence.";

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: extractPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          discoveries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "UserProfile field name" },
                value: { type: "string", description: "Extracted value for simple fields" },
                structured_value: {
                  type: "object",
                  description: "Structured value for service_history or operational_context. Only include properties stated in the document.",
                  properties: {
                    role: { type: "string" },
                    responsibilities: { type: "string" },
                    achievements: { type: "string" },
                    leadership_scope: { type: "string" },
                    factor: { type: "string" },
                    description: { type: "string" }
                  }
                },
                source_type: { type: "string", enum: ["direct_statement", "uncertain"] },
                source_text: { type: "string", description: "Exact text from the document supporting this extraction" },
                confidence: { type: "string", enum: ["high", "medium"] }
              },
              required: ["field", "source_type", "source_text", "confidence"]
            }
          }
        },
        required: ["discoveries"]
      }
    });

    const discoveries = Array.isArray(result?.discoveries) ? result.discoveries : [];
    const today = new Date().toISOString().split('T')[0];

    // Process discoveries — create evidence_log entries and update profile fields
    const existingEvidenceLog = Array.isArray(profile.evidence_log) ? [...profile.evidence_log] : [];
    const newEvidenceLog: any[] = [];
    const updates: any = {};
    const serviceHistory = Array.isArray(profile.service_history) ? [...profile.service_history] : [];
    const operationalContext = Array.isArray(profile.operational_context) ? [...profile.operational_context] : [];
    const goalsList = Array.isArray(profile.goals) ? [...profile.goals] : [];

    const accepted: any[] = [];
    const rejected: any[] = [];
    const ACCEPTABLE_FIELDS = new Set([
      "full_name", "service_branch", "rank", "years_served",
      "professional_identity", "service_history", "operational_context",
      "personal_context", "goals"
    ]);

    for (const d of discoveries) {
      const field = d.field;

      // Validate field
      if (!ACCEPTABLE_FIELDS.has(field)) {
        rejected.push({ field: field || "(unknown)", reason: "Unknown field" });
        continue;
      }
      // Only accept high-confidence direct statements
      if (d.confidence !== "high" || d.source_type !== "direct_statement") {
        rejected.push({ field, reason: `Not high-confidence direct statement (got: ${d.confidence}/${d.source_type})` });
        continue;
      }
      // Must have a value or structured_value
      if (!d.value && !d.structured_value) {
        rejected.push({ field, reason: "No value provided" });
        continue;
      }

      const evidence_id = crypto.randomUUID();

      if (field === "service_history" && d.structured_value && typeof d.structured_value === "object") {
        serviceHistory.push(d.structured_value);
        newEvidenceLog.push({
          evidence_id,
          source_type: "document",
          source_reference: sourceLabel + " — service_history",
          content: JSON.stringify(d.structured_value),
          source_text: d.source_text || "",
          recorded_date: today
        });
        accepted.push({ field, value: d.structured_value, evidence_id });
      } else if (field === "operational_context" && d.structured_value && typeof d.structured_value === "object") {
        operationalContext.push(d.structured_value);
        newEvidenceLog.push({
          evidence_id,
          source_type: "document",
          source_reference: sourceLabel + " — operational_context",
          content: JSON.stringify(d.structured_value),
          source_text: d.source_text || "",
          recorded_date: today
        });
        accepted.push({ field, value: d.structured_value, evidence_id });
      } else if (field === "goals" && d.value) {
        if (!goalsList.includes(d.value)) {
          goalsList.push(d.value);
        }
        newEvidenceLog.push({
          evidence_id,
          source_type: "document",
          source_reference: sourceLabel + " — goals",
          content: d.value,
          source_text: d.source_text || "",
          recorded_date: today
        });
        accepted.push({ field, value: d.value, evidence_id });
      } else if (d.value && ["full_name", "service_branch", "rank", "years_served", "professional_identity", "personal_context"].includes(field)) {
        // Scalar fields — don't overwrite existing substantive conversation-derived values
        // Exception: full_name can be set if not already set
        if (isSubstantive(profile[field]) && field !== "full_name") {
          // Document evidence supplements; existing conversation evidence preserved
          newEvidenceLog.push({
            evidence_id,
            source_type: "document",
            source_reference: sourceLabel + " — " + field,
            content: d.value,
            source_text: d.source_text || "",
            recorded_date: today
          });
          accepted.push({ field, value: d.value, evidence_id, note: "Evidence logged; existing profile value preserved" });
        } else {
          updates[field] = field === "years_served" ? (parseInt(String(d.value), 10) || d.value) : d.value;
          newEvidenceLog.push({
            evidence_id,
            source_type: "document",
            source_reference: sourceLabel + " — " + field,
            content: d.value,
            source_text: d.source_text || "",
            recorded_date: today
          });
          accepted.push({ field, value: d.value, evidence_id });
        }
      } else {
        rejected.push({ field, reason: "No applicable value or structured_value" });
      }
    }

    // Prepare persistence — only update fields that changed
    const allEvidenceLog = [...existingEvidenceLog, ...newEvidenceLog];
    updates.evidence_log = allEvidenceLog;
    if (serviceHistory.length > (Array.isArray(profile.service_history) ? profile.service_history.length : 0)) {
      updates.service_history = serviceHistory;
    }
    if (operationalContext.length > (Array.isArray(profile.operational_context) ? profile.operational_context.length : 0)) {
      updates.operational_context = operationalContext;
    }
    if (goalsList.length > (Array.isArray(profile.goals) ? profile.goals.length : 0)) {
      updates.goals = goalsList;
    }

    // Persist
    await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence(updates));

    // Verify no lifecycle/state movement occurred
    const updatedProfile = deserializeProfile(await base44.asServiceRole.entities.UserProfile.get(profile_id));
    const phaseAfter = updatedProfile.tos_phase;
    const soakAfter = updatedProfile.soak_period ? JSON.stringify(updatedProfile.soak_period) : null;
    const pathwaysAfter = Array.isArray(updatedProfile.recommended_pathways) ? updatedProfile.recommended_pathways.length : 0;
    const opConfirmedAfter = updatedProfile.operational_picture_confirmed;

    const noMovement =
      phaseBefore === phaseAfter &&
      soakBefore === soakAfter &&
      pathwaysBefore === pathwaysAfter &&
      opConfirmedBefore === opConfirmedAfter;

    return new Response(JSON.stringify({
      success: true,
      accepted: accepted,
      rejected: rejected,
      evidence_entries_created: newEvidenceLog.length,
      total_evidence_log: allEvidenceLog.length,
      fields_updated: Object.keys(updates).filter((k: string) => !["evidence_log", "service_history", "operational_context", "goals"].includes(k)),
      arrays_extended: [
        ...(serviceHistory.length > (Array.isArray(profile.service_history) ? profile.service_history.length : 0) ? ["service_history"] : []),
        ...(operationalContext.length > (Array.isArray(profile.operational_context) ? profile.operational_context.length : 0) ? ["operational_context"] : []),
        ...(goalsList.length > (Array.isArray(profile.goals) ? profile.goals.length : 0) ? ["goals"] : [])
      ],
      no_lifecycle_movement: noMovement,
      state_verification: {
        tos_phase_before: phaseBefore,
        tos_phase_after: phaseAfter,
        soak_unchanged: soakBefore === soakAfter,
        pathways_unchanged: pathwaysBefore === pathwaysAfter,
        op_confirmed_unchanged: opConfirmedBefore === opConfirmedAfter
      }
    }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "Internal error",
      detail: String(err?.message || err)
    }), { status: 500, headers: cors });
  }
});
