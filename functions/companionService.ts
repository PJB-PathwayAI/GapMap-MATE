import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * OCI Companion Service — Phase Two (Operation PROOF)
 * Smudge's companion orchestration layer
 *
 * Doctrine traceability:
 * - Architecture v1.0 §4: OCI Companion Service (orchestration + Operational Memory + safety gate)
 * - Architecture v1.0 §4a: Smudge = companion interface, no reasoning/memory — this service orchestrates
 * - Phase Two Design Intent v1.0: "The user should feel understood, not processed"
 * - Artefact 3: "Ask naturally, listen carefully, reflect understanding, confirm accuracy, build trust"
 * - Artefact 4: "Never rush, never assume, never diagnose, never recommend before understanding"
 *
 * What this service does (deterministic, testable):
 *   1. Manages conversation flow state (EXPLORING → REFLECTING → CONFIRMING → CONFIRMED)
 *   2. Routes discovery data to the Understanding Engine for validation/persistence
 *   3. Generates structured reflection content for Smudge to verbalize
 *   4. Provides flow guidance: which area to explore next, what's already known
 *   5. Enforces behavioural principles structurally (can't rush to confirmation)
 *
 * What this service does NOT do:
 *   - Generate natural language questions or reflections (that's Smudge/the LLM layer)
 *   - Interpret free text (that's Smudge)
 *   - Make recommendations
 *   - Assess emotional state
 *
 * Conversation modes:
 *   EXPLORING    — Smudge is discovering the six operational areas through conversation
 *   REFLECTING   — Smudge presents the Operational Picture back for the user to review
 *   CONFIRMING   — Smudge invites the "Yes, that's me" confirmation
 *   CONFIRMED    — Picture confirmed, ready for Phase Three
 *   RE_EXPLORING — User corrected something during reflection, going back to explore
 *
 * Flow:
 *   EXPLORING → (all six areas substantive) → REFLECTING
 *   REFLECTING → (reflection presented) → CONFIRMING
 *   CONFIRMING → (user confirms) → CONFIRMED
 *   CONFIRMING → (user corrects) → RE_EXPLORING → (gap filled) → REFLECTING
 */

// ─── Conversation modes ───
type ConversationMode = 'EXPLORING' | 'REFLECTING' | 'CONFIRMING' | 'CONFIRMED' | 'RE_EXPLORING';

// ─── Area priority for exploration ───
const AREA_PRIORITY = [
  'Who are you?',
  'What have you done?',
  'Where are you now?',
  'Where are you going?',
  'What influences your journey?',
  'How well do we understand?'
];

// ─── Substance helpers ───
const MIN_SUBSTANCE = 15;
function hasSubstance(v: string | null | undefined): boolean {
  return !!v && v.trim().length >= MIN_SUBSTANCE;
}
function hasArrSubstance(arr: any[] | null | undefined): boolean {
  if (!arr || arr.length === 0) return false;
  return arr.some(item => {
    if (typeof item === 'string') return hasSubstance(item);
    return Object.values(item || {}).some(v => typeof v === 'string' && hasSubstance(v as string));
  });
}

// ─── Area assessment ───
interface AreaAssessment { area: string; has_substance: boolean; score: number; notes: string; }

function assessAreas(p: any): AreaAssessment[] {
  return [
    {
      area: 'Who are you?',
      has_substance: !!p.service_branch && !!p.rank && hasSubstance(p.professional_identity),
      score: (!!p.service_branch && !!p.rank ? 7 : 0) + (hasSubstance(p.professional_identity) ? 8 : 0),
      notes: [p.service_branch && p.rank ? 'Branch and rank on file.' : 'Missing branch/rank.',
              hasSubstance(p.professional_identity) ? 'Professional identity captured.' : 'Identity narrative not yet explored.'].join(' ').trim()
    },
    {
      area: 'What have you done?',
      has_substance: hasArrSubstance(p.service_history) && (p.service_history || []).some((h: any) =>
        hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)),
      score: (() => {
        if (!p.service_history?.length) return 0;
        const rich = p.service_history.filter((h: any) => hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope));
        return Math.min(15, 5 + rich.length * 5);
      })(),
      notes: p.service_history?.length
        ? `${p.service_history.length} role(s) recorded, ${p.service_history.filter((h: any) => hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)).length} with substantive detail.`
        : 'No service history recorded yet.'
    },
    {
      area: 'Where are you now?',
      has_substance: hasSubstance(p.personal_context),
      score: hasSubstance(p.personal_context) ? 15 : 0,
      notes: hasSubstance(p.personal_context) ? 'Current circumstances captured.' : 'Current situation not yet explored.'
    },
    {
      area: 'Where are you going?',
      has_substance: hasArrSubstance(p.goals),
      score: hasArrSubstance(p.goals) ? Math.min(15, 5 + p.goals.length * 5) : 0,
      notes: hasArrSubstance(p.goals) ? `${p.goals.length} goal(s) stated.` : 'No goals or ambitions recorded yet.'
    },
    {
      area: 'What influences your journey?',
      has_substance: hasArrSubstance(p.operational_context),
      score: hasArrSubstance(p.operational_context) ? Math.min(15, 5 + p.operational_context.length * 3) : 0,
      notes: hasArrSubstance(p.operational_context) ? `${p.operational_context.length} influencing factor(s) identified.` : 'Influencing factors not yet explored.'
    },
    {
      area: 'How well do we understand?',
      has_substance: p.user_confidence !== null && p.user_confidence !== undefined,
      score: (p.user_confidence !== null && p.user_confidence !== undefined) ? 10 : 0,
      notes: (p.user_confidence !== null && p.user_confidence !== undefined) ? `User self-reported confidence: ${p.user_confidence}/10.` : 'User confidence not yet assessed.'
    },
  ];
}

// ─── Assessment confidence ───
function calcConfidence(areas: AreaAssessment[], confirmed: boolean) {
  const evidenceScore = areas.slice(0, 5).reduce((s, a) => s + a.score, 0);
  const understandingScore = areas[5].score;
  let overall = Math.min(100, evidenceScore + understandingScore + (confirmed ? 15 : 0));
  const rating = overall < 40 ? 'LOW' : overall < 70 ? 'MODERATE' : 'HIGH';
  return { overall_score: overall, rating };
}

// ─── Reflection content generator ───
function generateReflectionContent(profile: any, areas: AreaAssessment[]): string {
  const sections: string[] = [];
  const get = (name: string) => areas.find(a => a.area === name);

  if (get('Who are you?')?.has_substance)
    sections.push(`WHO THEY ARE: ${profile.professional_identity}. ${profile.years_served ? `${profile.years_served} years of service.` : ''}`);
  if (get('What have you done?')?.has_substance && profile.service_history?.length)
    sections.push(`WHAT THEY'VE DONE: ${profile.service_history.map((h: any) =>
      [h.role, h.responsibilities, h.achievements && `Achievement: ${h.achievements}`, h.leadership_scope && `Leadership: ${h.leadership_scope}`]
        .filter(Boolean).join(' — ')).join('. ')}`);
  if (get('Where are you now?')?.has_substance)
    sections.push(`WHERE THEY ARE NOW: ${profile.personal_context}`);
  if (get('Where are you going?')?.has_substance && profile.goals?.length)
    sections.push(`WHERE THEY'RE GOING: ${profile.goals.join('; ')}`);
  if (get('What influences your journey?')?.has_substance && profile.operational_context?.length)
    sections.push(`INFLUENCING FACTORS: ${profile.operational_context.map((f: any) => `${f.factor}: ${f.description}`).join('; ')}`);
  if (get('How well do we understand?')?.has_substance)
    sections.push(`USER CONFIDENCE: ${profile.user_confidence}/10. Assessment confidence: ${profile.assessment_confidence?.overall_score || 'N/A'}/100 (${profile.assessment_confidence?.rating || 'N/A'}).`);

  return sections.join('\n\n');
}

// ─── Flow guidance ───
function generateFlowGuidance(mode: ConversationMode, areas: AreaAssessment[], profile: any) {
  const withSubstance = areas.filter(a => a.has_substance).map(a => a.area);
  const missing = areas.filter(a => !a.has_substance).map(a => a.area);
  const nextArea = AREA_PRIORITY.find(name => missing.includes(name)) || null;
  const allSix = missing.length === 0;
  const readyToReflect = allSix && (mode === 'EXPLORING' || mode === 'RE_EXPLORING');

  let reflectionContent: string | null = null;
  if (mode === 'REFLECTING' || (readyToReflect && mode !== 'CONFIRMED'))
    reflectionContent = generateReflectionContent(profile, areas);

  const notes: string[] = [];
  if (missing.length > 0 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Still exploring — ${missing.length} area(s) need substance before reflecting.`);
    if (nextArea) notes.push(`Natural next area: "${nextArea}". But let the conversation flow — don't force the order if the user naturally covers another area.`);
  }
  if (readyToReflect) {
    notes.push("All six areas have substance. Time to reflect the picture back — in the user's own language, not a data dump.");
    notes.push("Reflect what you genuinely understand, not just what's stored. If something feels thin, say so honestly.");
  }
  if (mode === 'CONFIRMING') {
    notes.push('Inviting confirmation — frame it as "does this sound like you?" not "please confirm your data."');
    notes.push("If the user corrects something, that's good — they're engaged. Go back and explore the gap.");
  }
  if (mode === 'CONFIRMED') {
    notes.push('Picture confirmed. The user has agreed this is them. Phase Three (Evaluate) can begin when ready.');
  }
  if (profile.user_confidence !== null && profile.user_confidence < 4 && mode !== 'CONFIRMED')
    notes.push(`User confidence is low (${profile.user_confidence}/10). Be steady — don't rush toward solutions.`);

  return {
    next_area_to_explore: nextArea,
    areas_with_substance: withSubstance,
    areas_missing: missing,
    ready_to_reflect: readyToReflect,
    ready_to_confirm: mode === 'CONFIRMING',
    reflection_content: reflectionContent,
    behavioural_notes: notes,
  };
}

// ─── Main service ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      profile_id,
      current_mode = 'EXPLORING',
      new_discoveries,
      user_response_type = 'answering',
    } = body;

    if (!profile_id) return Response.json({ error: "Missing profile_id" }, { status: 400 });

    const profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

    // ─── Step 1: Merge new discoveries + handle confirmation/rejection ───
    const hasNewData = new_discoveries && Object.keys(new_discoveries).length > 0;
    const isConfirming = user_response_type === 'confirming';
    const isRejecting = user_response_type === 'rejecting';

    const merged = {
      full_name: new_discoveries?.full_name ?? profile.full_name,
      contact_email: new_discoveries?.contact_email ?? profile.contact_email,
      service_branch: new_discoveries?.service_branch ?? profile.service_branch,
      rank: new_discoveries?.rank ?? profile.rank,
      years_served: new_discoveries?.years_served ?? profile.years_served,
      professional_identity: new_discoveries?.professional_identity ?? profile.professional_identity,
      service_history: new_discoveries?.service_history?.length ? new_discoveries.service_history : profile.service_history || [],
      personal_context: new_discoveries?.personal_context ?? profile.personal_context,
      goals: new_discoveries?.goals?.length ? new_discoveries.goals : profile.goals || [],
      operational_context: new_discoveries?.operational_context?.length ? new_discoveries.operational_context : profile.operational_context || [],
      user_confidence: new_discoveries?.user_confidence ?? profile.user_confidence,
      operational_picture_confirmed: isConfirming ? true : (isRejecting || user_response_type === 'correcting') ? false : (profile.operational_picture_confirmed ?? false),
    };

    // ─── Step 2: Assess all six areas ───
    const areas = assessAreas(merged);
    const allSixSubstantive = areas.every(a => a.has_substance);
    const minUnderstanding = ['Who are you?', 'What have you done?', 'Where are you now?', 'Where are you going?']
      .every(name => areas.find(a => a.area === name)!.has_substance);

    // ─── Step 3: Calculate confidence ───
    const confidence = calcConfidence(areas, merged.operational_picture_confirmed);

    // ─── Step 4: Phase gate ───
    let newPhase = profile.tos_phase;
    if (minUnderstanding && profile.tos_phase === 'Discover') newPhase = 'Understand';

    // ─── Step 5: Persist if anything changed ───
    const needsUpdate = hasNewData || isConfirming || isRejecting || user_response_type === 'correcting';
    let updatedProfile = profile;
    if (needsUpdate) {
      updatedProfile = await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        ...merged,
        assessment_confidence: {
          overall_score: confidence.overall_score,
          rating: confidence.rating,
          areas: areas.map(a => ({ area: a.area, score: a.score, notes: a.notes }))
        },
        tos_phase: newPhase,
      });
    }

    // ─── Step 6: Determine conversation mode ───
    let mode: ConversationMode = current_mode as ConversationMode;

    if (isConfirming && allSixSubstantive && merged.operational_picture_confirmed) {
      mode = 'CONFIRMED';
    } else if (isRejecting || user_response_type === 'correcting') {
      mode = 'RE_EXPLORING';
    } else if (allSixSubstantive && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
      mode = 'REFLECTING';
    } else if (mode === 'RE_EXPLORING' && allSixSubstantive) {
      mode = 'REFLECTING';
    }

    // ─── Step 7: Generate flow guidance ───
    const guidance = generateFlowGuidance(mode, areas, updatedProfile);

    // ─── Step 8: Build response ───
    const sessionContext = {
      mode,
      areas_explored: areas.filter(a => a.has_substance).map(a => a.area),
      areas_outstanding: areas.filter(a => !a.has_substance).map(a => a.area),
      profile_phase: updatedProfile.tos_phase,
      assessment_confidence: confidence.rating,
      assessment_score: confidence.overall_score,
      user_confidence: updatedProfile.user_confidence,
      confirmed: updatedProfile.operational_picture_confirmed === true,
      can_proceed_to_phase_three: merged.operational_picture_confirmed === true && allSixSubstantive,
    };

    return new Response(JSON.stringify({
      session: sessionContext,
      flow_guidance: guidance,
      profile: updatedProfile,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
