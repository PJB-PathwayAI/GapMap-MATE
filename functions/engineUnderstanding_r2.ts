import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Understanding Engine — Phase Two (Operation PROOF)
 * Design Intent v1.0 — 4 July 2026
 *
 * Packet 2C v1.0 — ASSESSMENT ONLY
 * Per Packet 2B v1.1 Canonical Lifecycle Contract:
 *   - engineUnderstanding does NOT persist tos_phase
 *   - engineUnderstanding does NOT persist operational_picture_confirmed
 *   - companionService owns EXPLORING → CONFIRMING transition
 *   - engineUnderstanding may return readiness information only
 *
 * Runtime Restoration (2C-R2):
 *   - Added parseJSON, deserializeProfile, serializeForPersistence
 *   - Same adapter pattern as companionService
 *   - No user_confidence coercion (on hold per R2 order)
 */

// ─── Serialization helpers (same pattern as companionService) ───

function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

function deserializeProfile(profile: any): any {
  const arrayFields = ['service_history', 'goals', 'operational_context', 'evidence_log', 'capability_map', 'confidence_scores', 'recommended_pathways', 'safety_flags', 'operational_picture_history', 'milestones'];
  const objectFields = ['assessment_confidence', 'decision_factors', 'soak_period', 'communication_preferences'];
  for (const f of arrayFields) { profile[f] = parseJSON(profile[f], []); }
  for (const f of objectFields) { profile[f] = parseJSON(profile[f]); }
  return profile;
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

// ─── Substance checks ───

const MIN_SUBSTANCE_LENGTH = 15;

function hasSubstance(value: string | null | undefined): boolean {
  return !!value && value.trim().length >= MIN_SUBSTANCE_LENGTH;
}

function hasArraySubstance(arr: any[] | null | undefined, minCount: number = 1): boolean {
  if (!arr || arr.length < minCount) return false;
  return arr.some(item => {
    if (typeof item === 'string') return hasSubstance(item);
    const vals = Object.values(item || {}).filter(v => typeof v === 'string');
    return vals.some(v => hasSubstance(v as string));
  });
}

// ─── Six Operational Area validators ───

interface AreaAssessment {
  area: string;
  has_substance: boolean;
  score: number;
  notes: string;
}

function assessWhoAreYou(profile: any): AreaAssessment {
  const hasBranchRank = !!profile.service_branch && !!profile.rank;
  const hasIdentity = hasSubstance(profile.professional_identity);
  const has_substance = hasBranchRank && hasIdentity;
  let score = 0; let notes = '';
  if (hasBranchRank) { score += 7; notes += 'Branch and rank on file. '; } else { notes += 'Missing branch/rank. '; }
  if (hasIdentity) { score += 8; notes += 'Professional identity captured. '; } else if (hasBranchRank) { notes += 'Identity narrative not yet explored — only categories captured. '; }
  return { area: 'Who are you?', has_substance, score, notes: notes.trim() };
}

function assessWhatHaveYouDone(profile: any): AreaAssessment {
  const history = profile.service_history || [];
  const has_substance = hasArraySubstance(history, 1) && history.some((h: any) => hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope));
  let score = 0; let notes = '';
  if (history.length > 0) {
    const rich = history.filter((h: any) => hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope));
    score = Math.min(15, 5 + (rich.length * 5));
    notes += `${history.length} role(s) recorded, ${rich.length} with substantive detail. `;
    if (rich.length < history.length) { notes += 'Some roles lack evidence detail. '; }
  } else { notes = 'No service history recorded yet. '; }
  return { area: 'What have you done?', has_substance, score, notes: notes.trim() };
}

function assessWhereAreYouNow(profile: any): AreaAssessment {
  const has_substance = hasSubstance(profile.personal_context);
  return { area: 'Where are you now?', has_substance, score: has_substance ? 15 : 0, notes: has_substance ? 'Current circumstances captured.' : 'Current situation not yet explored.' };
}

function assessWhereAreYouGoing(profile: any): AreaAssessment {
  const goals = profile.goals || [];
  const has_substance = hasArraySubstance(goals, 1);
  return { area: 'Where are you going?', has_substance, score: has_substance ? Math.min(15, 5 + goals.length * 5) : 0, notes: has_substance ? `${goals.length} goal(s) stated.` : 'No goals or ambitions recorded yet.' };
}

function assessWhatInfluencesYou(profile: any): AreaAssessment {
  const context = profile.operational_context || [];
  const has_substance = hasArraySubstance(context, 1);
  return { area: 'What influences your journey?', has_substance, score: has_substance ? Math.min(15, 5 + context.length * 3) : 0, notes: has_substance ? `${context.length} influencing factor(s) identified.` : 'Influencing factors not yet explored.' };
}

function assessUnderstanding(profile: any, areas: AreaAssessment[]): AreaAssessment {
  const hasUserConfidence = profile.user_confidence !== null && profile.user_confidence !== undefined;
  return { area: 'How well do we understand?', has_substance: hasUserConfidence, score: hasUserConfidence ? 10 : 0, notes: hasUserConfidence ? `User self-reported confidence: ${profile.user_confidence}/10.` : 'User confidence not yet assessed.' };
}

function calculateAssessmentConfidence(areas: AreaAssessment[], userConfirmed: boolean) {
  const areaScores = areas.filter(a => a.area !== 'How well do we understand?');
  const rawScore = areaScores.reduce((sum, a) => sum + a.score, 0);
  const understandingScore = areas.find(a => a.area === 'How well do we understand?')?.score || 0;
  let overall = rawScore + understandingScore;
  if (userConfirmed) overall += 15;
  overall = Math.min(100, overall);
  let rating: string;
  if (overall < 40) rating = 'LOW'; else if (overall < 70) rating = 'MODERATE'; else rating = 'HIGH';
  return { overall_score: overall, rating, areas };
}

// ─── Engine ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { profile_id, full_name, contact_email, service_branch, rank, years_served, professional_identity, service_history, personal_context, goals, operational_context, user_confidence } = body;

    if (!profile_id) return Response.json({ error: "Missing profile_id" }, { status: 400 });

    // Ownership validation: user-scoped read (RLS-enforced) — S-004
    const existing = await base44.entities.UserProfile.get(profile_id);
    if (!existing) return Response.json({ error: "Profile not found" }, { status: 404 });

    // Runtime restoration: deserialize JSON strings to native values (same as companionService)
    deserializeProfile(existing);

    // Merge discovery input onto existing profile (never overwrite with blank/null)
    // NOTE: operational_picture_confirmed is NOT in merged — companionService owns this field.
    const merged = {
      full_name: full_name ?? existing.full_name,
      contact_email: contact_email ?? existing.contact_email,
      service_branch: service_branch ?? existing.service_branch,
      rank: rank ?? existing.rank,
      years_served: years_served ?? existing.years_served,
      professional_identity: professional_identity ?? existing.professional_identity,
      service_history: service_history?.length ? service_history : existing.service_history || [],
      personal_context: personal_context ?? existing.personal_context,
      goals: goals?.length ? goals : existing.goals || [],
      operational_context: operational_context?.length ? operational_context : existing.operational_context || [],
      user_confidence: user_confidence ?? existing.user_confidence,
    };

    // Assess all six operational areas
    const areas: AreaAssessment[] = [
      assessWhoAreYou(merged),
      assessWhatHaveYouDone(merged),
      assessWhereAreYouNow(merged),
      assessWhereAreYouGoing(merged),
      assessWhatInfluencesYou(merged),
    ];
    areas.push(assessUnderstanding(merged, areas));

    // Calculate assessment confidence
    const existingConfirmed = existing.operational_picture_confirmed === true;
    const assessment = calculateAssessmentConfidence(areas, existingConfirmed);

    // Readiness information (does NOT persist lifecycle state)
    const coreAreas = areas.filter(a => a.area !== 'How well do we understand?');
    const allCoreAreasSubstantive = coreAreas.every(a => a.has_substance);
    const understandingArea = areas.find(a => a.area === 'How well do we understand?')!;
    const readyForConfirmation = allCoreAreasSubstantive && understandingArea.has_substance;

    // Persist Understanding data only — NO tos_phase, NO operational_picture_confirmed
    // serializeForPersistence converts native arrays/objects to JSON strings (same as companionService)
    const updated = await base44.asServiceRole.entities.UserProfile.update(profile_id, serializeForPersistence({
      full_name: merged.full_name,
      contact_email: merged.contact_email,
      service_branch: merged.service_branch,
      rank: merged.rank,
      years_served: merged.years_served,
      professional_identity: merged.professional_identity,
      service_history: merged.service_history,
      personal_context: merged.personal_context,
      goals: merged.goals,
      operational_context: merged.operational_context,
      user_confidence: merged.user_confidence,
      assessment_confidence: {
        overall_score: assessment.overall_score,
        rating: assessment.rating,
        areas: assessment.areas.map(a => ({ area: a.area, score: a.score, notes: a.notes }))
      },
      // tos_phase: intentionally omitted — companionService owns lifecycle transitions
      // operational_picture_confirmed: intentionally omitted — companionService owns confirmation
    }));

    // Deserialize the updated profile for response (same as companionService)
    deserializeProfile(updated);

    return new Response(JSON.stringify({
      profile: updated,
      operational_picture: {
        areas: assessment.areas.map(a => ({ area: a.area, has_substance: a.has_substance, score: a.score, notes: a.notes })),
        assessment_confidence: { overall_score: assessment.overall_score, rating: assessment.rating },
        user_confidence: merged.user_confidence,
        user_confirmed: existingConfirmed,
        ready_for_confirmation: readyForConfirmation,
      },
      missing_areas: areas.filter(a => !a.has_substance).map(a => a.area),
      phase: existing.tos_phase,
      phase_advanced: false,
      can_proceed_to_phase_three: existingConfirmed && readyForConfirmation,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
