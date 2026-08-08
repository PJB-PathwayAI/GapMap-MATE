import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Serialization Adapter (MATE Engine Interface Contract) ───
function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

function serializeForPersistence(data: any): any {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (value !== null && value !== undefined && typeof value === 'object') {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

function deserializeProfile(profile: any): any {
  const arrayFields = ['service_history', 'goals', 'operational_context', 'evidence_log', 'capability_map', 'confidence_scores', 'recommended_pathways', 'safety_flags', 'operational_picture_history', 'milestones'];
  const objectFields = ['assessment_confidence', 'decision_factors', 'soak_period', 'communication_preferences'];
  for (const f of arrayFields) { profile[f] = parseJSON(profile[f], []); }
  for (const f of objectFields) { profile[f] = parseJSON(profile[f]); }
  return profile;
}


/**
 * OCI Companion Service — Phase Two (Operation PROOF)
 * Smudge's companion orchestration layer
 * v1.2 — Companion Behaviour Refinement (Exercise LENS AAR)
 *
 * Doctrine traceability:
 * - Architecture v1.0 §4: OCI Companion Service (orchestration + Operational Memory + safety gate)
 * - Phase Two Design Intent v1.0: "The user should feel understood, not processed"
 * - Artefact 3: "Ask naturally, listen carefully, reflect understanding, confirm accuracy, build trust"
 * - Artefact 4: "Never rush, never assume, never diagnose, never recommend before understanding"
 * - Companion Behaviour Refinement v1.0: Six refinements from Exercise LENS AAR
 *
 * v1.2 changes (Companion Behaviour Refinement):
 *   - Enriched behavioural_notes with checkpoint signals (area reached substance)
 *   - Milestone reflection signals (2+ areas thematically connected)
 *   - Engagement awareness notes (low confidence + many areas explored)
 *   - Topic completion guidance (don't re-explore areas that already have substance)
 *   - Natural discovery principle: next_area is a suggestion, not a script
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

// ─── Area priority for exploration (suggestion, not script) ───
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

// ─── Flow guidance (v1.2 — enriched with companion behaviour signals) ───

function generateFlowGuidance(
  mode: ConversationMode,
  areas: AreaAssessment[],
  profile: any,
  previousAreas: AreaAssessment[] | null  // v1.2: compare to detect newly-substantive areas
): {
  next_area_to_explore: string | null;
  areas_with_substance: string[];
  areas_missing: string[];
  ready_to_reflect: boolean;
  ready_to_confirm: boolean;
  reflection_content: string | null;
  behavioural_notes: string[];
} {
  const withSubstance = areas.filter(a => a.has_substance).map(a => a.area);
  const missing = areas.filter(a => !a.has_substance).map(a => a.area);
  const nextArea = AREA_PRIORITY.find(name => missing.includes(name)) || null;
  const allSix = missing.length === 0;
  const readyToReflect = allSix && (mode === 'EXPLORING' || mode === 'RE_EXPLORING');

  let reflectionContent: string | null = null;
  if (mode === 'REFLECTING' || (readyToReflect && mode !== 'CONFIRMED'))
    reflectionContent = generateReflectionContent(profile, areas);

  // ─── Behavioural notes (v1.2 — enriched) ───
  const notes: string[] = [];

  // 1. Exploration guidance
  if (missing.length > 0 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Still exploring — ${missing.length} area(s) need substance before reflecting.`);
    if (nextArea) {
      notes.push(`Suggested next area: "${nextArea}". This is a suggestion, not a script — if the user naturally covers another area, follow them.`);
    }
  }

  // 2. Topic completion checkpoints (v1.2)
  // If an area just gained substance in this exchange, signal that it's time to checkpoint
  if (previousAreas && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    for (const area of areas) {
      const wasMissing = previousAreas.find(a => a.area === area.area)?.has_substance === false;
      const nowHas = area.has_substance;
      if (wasMissing && nowHas) {
        notes.push(`CHECKPOINT: "${area.area}" just reached substance. Consider a topic completion checkpoint: "I think I've got a good picture of that now. Anything else before we move on?" Don't keep probing this area.`);
      }
    }
  }

  // 3. Don't re-explore areas that already have substance (v1.2)
  if (withSubstance.length > 0 && withSubstance.length < 6 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Areas already with substance: ${withSubstance.join(', ')}. Don't re-explore these unless the user voluntarily expands. Move to missing areas: ${missing.join(', ')}.`);
  }

  // 4. Milestone reflection signals (v1.2)
  // When 2+ areas have substance and are thematically connected, flag a milestone reflection opportunity
  if (withSubstance.length >= 2 && withSubstance.length < 6 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`MILESTONE: ${withSubstance.length} areas now have substance. If a natural moment arises (user links two themes, or pauses), a brief milestone reflection is appropriate — but keep it short. Don't reflect after every answer.`);
  }

  // 5. Reflection readiness
  if (readyToReflect) {
    notes.push("All six areas have substance. Time to reflect the picture back — in the user's own language, not a data dump.");
    notes.push("Reflect what you genuinely understand, not just what's stored. If something feels thin even though it has 'substance', say so honestly.");
    notes.push("Use everyday military language in the reflection. Civilian translation comes later at the Capability Picture stage.");
  }

  // 6. Confirmation guidance
  if (mode === 'CONFIRMING') {
    notes.push('Inviting confirmation — frame it as "does this sound like you?" not "please confirm your data."');
    notes.push("If the user corrects something, that's good — they're engaged. Go back and explore the gap, don't treat it as a failure.");
  }

  // 7. Post-confirmation
  if (mode === 'CONFIRMED') {
    notes.push('Picture confirmed. The user has agreed this is them. Phase Three (Evaluate) can begin when ready.');
  }

  // 8. Low confidence awareness (v1.2 — refined)
  if (profile.user_confidence !== null && profile.user_confidence < 4 && mode !== 'CONFIRMED') {
    notes.push(`User confidence is low (${profile.user_confidence}/10). Be steady — don't rush toward solutions. The picture matters more than the pace.`);
    notes.push("If the user signals boredom or frustration ('where's this going'), don't push through. Either close the current topic with a checkpoint, or bring the reflection forward if enough areas have substance.");
  }

  // 9. Conversational momentum reminder (v1.2)
  if (withSubstance.length >= 3 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push("MOMENTUM: Good progress — 3+ areas covered. Vary the conversation rhythm. Don't let every exchange become Q→Reflect→Q→Reflect. Use mini acknowledgements ('got you', 'makes sense') between questions. Reserve full reflections for milestones.");
  }

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
      user_response_type = 'answering',  // answering | correcting | confirming | rejecting
    } = body;

    if (!profile_id) {
      return Response.json({ error: "Missing profile_id" }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    deserializeProfile(profile);

    // ─── Assess areas BEFORE processing (v1.2: for checkpoint detection) ───
    const previousAreas = new_discoveries && Object.keys(new_discoveries).length > 0
      ? assessAreas(profile)
      : null;

    // ─── Step 1: If new discoveries provided, process and persist ───
    let updatedProfile = profile;
    let engineResult: any = null;

    if (new_discoveries && Object.keys(new_discoveries).length > 0) {
      const merged = {
        full_name: new_discoveries.full_name ?? profile.full_name,
        contact_email: new_discoveries.contact_email ?? profile.contact_email,
        service_branch: new_discoveries.service_branch ?? profile.service_branch,
        rank: new_discoveries.rank ?? profile.rank,
        years_served: new_discoveries.years_served ?? profile.years_served,
        professional_identity: new_discoveries.professional_identity ?? profile.professional_identity,
        service_history: new_discoveries.service_history?.length ? new_discoveries.service_history : profile.service_history || [],
        personal_context: new_discoveries.personal_context ?? profile.personal_context,
        goals: new_discoveries.goals?.length ? new_discoveries.goals : profile.goals || [],
        operational_context: new_discoveries.operational_context?.length ? new_discoveries.operational_context : profile.operational_context || [],
        user_confidence: new_discoveries.user_confidence !== undefined ? new_discoveries.user_confidence : profile.user_confidence,
        operational_picture_confirmed: user_response_type === 'rejecting'
          ? false
          : (user_response_type === 'confirming' ? true : (profile.operational_picture_confirmed ?? false)),
      };

      const areas = assessAreas(merged);
      const allCoreSubstantive = areas.slice(0, 5).every(a => a.has_substance);
      const understandingSubstantive = areas[5].has_substance;
      const minUnderstanding = ['Who are you?', 'What have you done?', 'Where are you now?', 'Where are you going?']
        .every(name => areas.find(a => a.area === name)!.has_substance);

      let newPhase = profile.tos_phase;
      if (minUnderstanding && profile.tos_phase === 'Discover') newPhase = 'Understand';

      const userConfirmed = merged.operational_picture_confirmed === true;
      const readyForConfirmation = allCoreSubstantive && understandingSubstantive;

      const confidence = calcConfidence(areas, userConfirmed);

      updatedProfile = await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
        ...merged,
        assessment_confidence: { overall_score: confidence.overall_score, rating: confidence.rating, areas: areas.map(a => ({ area: a.area, score: a.score, notes: a.notes })) },
        tos_phase: newPhase,
      }));
      deserializeProfile(updatedProfile);

      engineResult = {
        areas,
        missing_areas: areas.filter(a => !a.has_substance).map(a => a.area),
        ready_for_confirmation: readyForConfirmation,
        can_proceed: userConfirmed && readyForConfirmation,
        assessment_confidence: confidence,
      };
    }

    // ─── Step 2: Determine conversation mode ───
    let mode: ConversationMode = current_mode as ConversationMode;

    if (engineResult) {
      if (user_response_type === 'confirming' && engineResult.can_proceed) {
        mode = 'CONFIRMED';
      } else if (user_response_type === 'rejecting' || user_response_type === 'correcting') {
        mode = 'RE_EXPLORING';
      } else if (engineResult.ready_for_confirmation && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
        mode = 'REFLECTING';
      } else if (mode === 'RE_EXPLORING' && engineResult.missing_areas.length === 0) {
        mode = 'REFLECTING';
      }
    }

    // ─── Step 3: Generate flow guidance (v1.2 — with previous areas for checkpoint detection) ───
    const currentAreas = engineResult?.areas || assessAreas(updatedProfile);
    const guidance = generateFlowGuidance(mode, currentAreas, updatedProfile, previousAreas);

    // ─── Step 4: Build session context ───
    const sessionContext = {
      mode,
      areas_explored: currentAreas.filter((a: any) => a.has_substance).map((a: any) => a.area),
      areas_outstanding: currentAreas.filter((a: any) => !a.has_substance).map((a: any) => a.area),
      profile_phase: updatedProfile.tos_phase,
      assessment_confidence: updatedProfile.assessment_confidence?.rating || 'LOW',
      user_confidence: updatedProfile.user_confidence,
      confirmed: updatedProfile.operational_picture_confirmed === true,
    };

    return new Response(JSON.stringify({
      session: sessionContext,
      flow_guidance: guidance,
      profile: updatedProfile,
      ...(engineResult ? { engine_result: engineResult } : {}),
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
