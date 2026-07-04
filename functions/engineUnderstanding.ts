import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Understanding Engine — Phase Two (Operation PROOF)
 * Design Intent v1.0 — 4 July 2026
 *
 * Doctrine traceability:
 * - Artefact 6 / Op Order Phase 2: "understanding before guidance"
 * - Artefact 3: "feel understood, not processed"
 * - Artefact 4: "never diagnose, never assume"
 * - Artefact 8 (TOS): Discover → Understand lifecycle transition
 * - Architecture v1.0 §4a: Operational Memory (Stable/Evolving/Session)
 * - Architecture v1.0 §5: Understanding Engine writes service_history, goals,
 *   personal_context, professional_identity, operational_context onto UserProfile
 *
 * Design Intent acceptance test:
 *   "Phase Two is complete when the system can consistently produce an Operational
 *    Picture that both Smudge and the user agree accurately reflects reality.
 *    Success is measured by shared understanding, not completed fields."
 *
 * Engine responsibilities (deterministic, testable):
 *   1. Validate that discovery input has SUBSTANCE across the six operational areas
 *   2. Calculate Assessment Confidence (evidence quality, NOT honesty judgement)
 *   3. Track whether the user has confirmed the Operational Picture
 *   4. Gate phase advancement: all core areas substantive + user confirmed
 *
 * What this engine does NOT do:
 *   - Interpret free text (that's Smudge/companion layer reasoning)
 *   - Assess honesty or integrity
 *   - Generate conversational responses
 *   - Make recommendations
 *
 * The six operational areas:
 *   Q1. Who are you?           → service_branch + rank + professional_identity
 *   Q2. What have you done?    → service_history (with substance, not just job titles)
 *   Q3. Where are you now?     → personal_context
 *   Q4. Where are you going?   → goals
 *   Q5. What influences you?   → operational_context
 *   Q6. How well do we understand? → user_confidence + assessment_confidence (calculated)
 */

// ─── Substance checks ───
// "Success is not measured by completed fields" — we check for meaningful content,
// not just non-empty values. A one-word answer is a field completed but not substance.

const MIN_SUBSTANCE_LENGTH = 15; // characters — below this, we don't count it as real evidence

function hasSubstance(value: string | null | undefined): boolean {
  return !!value && value.trim().length >= MIN_SUBSTANCE_LENGTH;
}

function hasArraySubstance(arr: any[] | null | undefined, minCount: number = 1): boolean {
  if (!arr || arr.length < minCount) return false;
  return arr.some(item => {
    if (typeof item === 'string') return hasSubstance(item);
    // For objects, check if at least one meaningful field has substance
    const vals = Object.values(item || {}).filter(v => typeof v === 'string');
    return vals.some(v => hasSubstance(v as string));
  });
}

// ─── Six Operational Area validators ───

interface AreaAssessment {
  area: string;
  has_substance: boolean;
  score: number;       // 0-15 per area
  notes: string;
}

function assessWhoAreYou(profile: any): AreaAssessment {
  const hasBranchRank = !!profile.service_branch && !!profile.rank;
  const hasIdentity = hasSubstance(profile.professional_identity);
  const has_substance = hasBranchRank && hasIdentity;

  let score = 0;
  let notes = '';

  if (hasBranchRank) {
    score += 7;
    notes += 'Branch and rank on file. ';
  } else {
    notes += 'Missing branch/rank. ';
  }

  if (hasIdentity) {
    score += 8;
    notes += 'Professional identity captured. ';
  } else if (hasBranchRank) {
    notes += 'Identity narrative not yet explored — only categories captured. ';
  }

  return { area: 'Who are you?', has_substance, score, notes: notes.trim() };
}

function assessWhatHaveYouDone(profile: any): AreaAssessment {
  const history = profile.service_history || [];
  const has_substance = hasArraySubstance(history, 1) && history.some((h: any) =>
    hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)
  );

  let score = 0;
  let notes = '';

  if (history.length > 0) {
    const rich = history.filter((h: any) =>
      hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)
    );
    score = Math.min(15, 5 + (rich.length * 5));
    notes += `${history.length} role(s) recorded, ${rich.length} with substantive detail. `;
    if (rich.length < history.length) {
      notes += 'Some roles lack evidence detail (achievements, leadership, responsibilities). ';
    }
  } else {
    notes = 'No service history recorded yet. ';
  }

  return { area: 'What have you done?', has_substance, score, notes: notes.trim() };
}

function assessWhereAreYouNow(profile: any): AreaAssessment {
  const has_substance = hasSubstance(profile.personal_context);
  const score = has_substance ? 15 : 0;
  const notes = has_substance
    ? 'Current circumstances captured.'
    : 'Current situation not yet explored.';
  return { area: 'Where are you now?', has_substance, score, notes };
}

function assessWhereAreYouGoing(profile: any): AreaAssessment {
  const goals = profile.goals || [];
  const has_substance = hasArraySubstance(goals, 1);
  const score = has_substance ? Math.min(15, 5 + goals.length * 5) : 0;
  const notes = has_substance
    ? `${goals.length} goal(s) stated. `
    : 'No goals or ambitions recorded yet. ';
  return { area: 'Where are you going?', has_substance, score, notes: notes.trim() };
}

function assessWhatInfluencesYou(profile: any): AreaAssessment {
  const context = profile.operational_context || [];
  const has_substance = hasArraySubstance(context, 1);
  const score = has_substance ? Math.min(15, 5 + context.length * 3) : 0;
  const notes = has_substance
    ? `${context.length} influencing factor(s) identified. `
    : 'Influencing factors not yet explored. ';
  return { area: 'What influences your journey?', has_substance, score, notes: notes.trim() };
}

function assessUnderstanding(profile: any, areas: AreaAssessment[]): AreaAssessment {
  const hasUserConfidence = profile.user_confidence !== null && profile.user_confidence !== undefined;
  const has_substance = hasUserConfidence;
  const score = hasUserConfidence ? 10 : 0;
  const notes = hasUserConfidence
    ? `User self-reported confidence: ${profile.user_confidence}/10. `
    : 'User confidence not yet assessed. ';
  return { area: 'How well do we understand?', has_substance, score, notes: notes.trim() };
}

// ─── Assessment Confidence calculation ───
// This measures EVIDENCE QUALITY — whether we have enough to support recommendations.
// It NEVER measures honesty or integrity (per Design Intent).

function calculateAssessmentConfidence(areas: AreaAssessment[], userConfirmed: boolean) {
  const areaScores = areas.filter(a => a.area !== 'How well do we understand?');
  const rawScore = areaScores.reduce((sum, a) => sum + a.score, 0); // max 75 from 5 areas
  const understandingScore = areas.find(a => a.area === 'How well do we understand?')?.score || 0; // max 10

  // Base: evidence areas (75 max) + understanding (10 max) = 85
  // Confirmation bonus: 15 (shared agreement is itself evidence of understanding)
  let overall = rawScore + understandingScore;
  if (userConfirmed) overall += 15;
  overall = Math.min(100, overall);

  let rating: string;
  if (overall < 40) rating = 'LOW';
  else if (overall < 70) rating = 'MODERATE';
  else rating = 'HIGH';

  return { overall_score: overall, rating, areas };
}

// ─── Engine ───

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
      // Stable memory (Q1, Q2)
      full_name, contact_email, service_branch, rank, years_served,
      professional_identity, service_history,
      // Evolving memory (Q3, Q4, Q5)
      personal_context, goals, operational_context,
      // Confidence (Q6)
      user_confidence,
      // Confirmation gate
      confirm_operational_picture
    } = body;

    if (!profile_id) {
      return Response.json({ error: "Missing profile_id" }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    if (!existing) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    // Merge discovery input onto existing profile (never overwrite with blank/null)
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
      // Confirmation is sticky — once true, stays true unless explicitly revoked
      operational_picture_confirmed: confirm_operational_picture === false
        ? false
        : (confirm_operational_picture ?? existing.operational_picture_confirmed ?? false),
    };

    // ─── Assess all six operational areas ───
    const areas: AreaAssessment[] = [
      assessWhoAreYou(merged),
      assessWhatHaveYouDone(merged),
      assessWhereAreYouNow(merged),
      assessWhereAreYouGoing(merged),
      assessWhatInfluencesYou(merged),
    ];
    // Q6 assessed after we know the other areas
    areas.push(assessUnderstanding(merged, areas));

    const assessment = calculateAssessmentConfidence(areas, merged.operational_picture_confirmed);

    // ─── Phase gate logic ───
    // Core areas that MUST have substance before confirmation can be requested
    const coreAreas = areas.filter(a => a.area !== 'How well do we understand?');
    const allCoreAreasSubstantive = coreAreas.every(a => a.has_substance);
    const understandingArea = areas.find(a => a.area === 'How well do we understand?')!;
    const readyForConfirmation = allCoreAreasSubstantive && understandingArea.has_substance;
    const userConfirmed = merged.operational_picture_confirmed === true;

    // Phase advancement:
    // Discover → Understand: when at least Q1+Q2+Q3+Q4 have substance (core picture forming)
    // Understand → (next phase): when ALL six areas substantive AND user confirmed
    const minimumUnderstanding = ['Who are you?', 'What have you done?', 'Where are you now?', 'Where are you going?']
      .every(areaName => areas.find(a => a.area === areaName)!.has_substance);

    let newPhase = existing.tos_phase;
    if (minimumUnderstanding && existing.tos_phase === 'Discover') {
      newPhase = 'Understand';
    }
    // Only advance beyond Understand when confirmed + all areas substantive
    if (userConfirmed && readyForConfirmation && existing.tos_phase === 'Understand') {
      // Stay in Understand — Phase Three (Evaluate) is a separate operation phase
      // The confirmation unlocks readiness; the operation order governs phase transition
      // For now, confirmed status is the gate; tos_phase stays at Understand until
      // the Capability Intelligence Engine (Phase 3) is ready to receive
      newPhase = 'Understand'; // stays — but operational_picture_confirmed = true signals readiness
    }

    const updated = await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      ...merged,
      assessment_confidence: {
        overall_score: assessment.overall_score,
        rating: assessment.rating,
        areas: assessment.areas.map(a => ({
          area: a.area,
          score: a.score,
          notes: a.notes
        }))
      },
      tos_phase: newPhase,
    });

    return new Response(JSON.stringify({
      profile: updated,
      operational_picture: {
        areas: assessment.areas.map(a => ({
          area: a.area,
          has_substance: a.has_substance,
          score: a.score,
          notes: a.notes
        })),
        assessment_confidence: {
          overall_score: assessment.overall_score,
          rating: assessment.rating
        },
        user_confidence: merged.user_confidence,
        user_confirmed: merged.operational_picture_confirmed,
        ready_for_confirmation: readyForConfirmation,
      },
      missing_areas: areas.filter(a => !a.has_substance).map(a => a.area),
      phase: newPhase,
      phase_advanced: newPhase !== existing.tos_phase,
      can_proceed_to_phase_three: userConfirmed && readyForConfirmation,
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
