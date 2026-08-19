// ============================================================
// companionCore — Shared Companion Domain Logic
// R1-C.1B-E1: Extracted from companionService v1.2
//
// ONE deterministic Understanding implementation.
// TWO authenticated entry points (companionService + smudgeOrchestrator).
// ONE ownership model.
//
// Contract: receives an ALREADY-AUTHORISED, DESERIALISED profile.
// Does NOT accept arbitrary profile_id as authority.
// Does NOT establish ownership via service-role lookup.
// Persistence is performed via a narrow capability callback supplied by the wrapper.
// ============================================================

export const COMPANION_CORE_VERSION = "1.0.0";

// ─── Serialization Adapters ───

export function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

export function serializeForPersistence(data: any): any {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (value !== null && value !== undefined && typeof value === 'object') {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

export function deserializeProfile(profile: any): any {
  const arrayFields = ['service_history', 'goals', 'operational_context', 'evidence_log', 'capability_map', 'confidence_scores', 'recommended_pathways', 'safety_flags', 'operational_picture_history', 'milestones'];
  const objectFields = ['assessment_confidence', 'decision_factors', 'soak_period', 'communication_preferences'];
  for (const f of arrayFields) { profile[f] = parseJSON(profile[f], []); }
  for (const f of objectFields) { profile[f] = parseJSON(profile[f]); }
  return profile;
}

// ─── Constants ───

const AREA_PRIORITY = [
  'Who are you?',
  'What have you done?',
  'Where are you now?',
  'Where are you going?',
  'What influences your journey?',
  'How well do we understand?'
];

const MIN_SUBSTANCE = 15;

// ─── Substance helpers ───

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

type ConversationMode = 'EXPLORING' | 'REFLECTING' | 'CONFIRMING' | 'CONFIRMED' | 'RE_EXPLORING';

function generateFlowGuidance(
  mode: ConversationMode,
  areas: AreaAssessment[],
  profile: any,
  previousAreas: AreaAssessment[] | null
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

  const notes: string[] = [];

  if (missing.length > 0 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Still exploring — ${missing.length} area(s) need substance before reflecting.`);
    if (nextArea) {
      notes.push(`Suggested next area: "${nextArea}". This is a suggestion, not a script — if the user naturally covers another area, follow them.`);
    }
  }

  if (previousAreas && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    for (const area of areas) {
      const wasMissing = previousAreas.find(a => a.area === area.area)?.has_substance === false;
      const nowHas = area.has_substance;
      if (wasMissing && nowHas) {
        notes.push(`CHECKPOINT: "${area.area}" just reached substance. Consider a topic completion checkpoint: "I think I've got a good picture of that now. Anything else before we move on?" Don't keep probing this area.`);
      }
    }
  }

  if (withSubstance.length > 0 && withSubstance.length < 6 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Areas already with substance: ${withSubstance.join(', ')}. Don't re-explore these unless the user voluntarily expands. Move to missing areas: ${missing.join(', ')}.`);
  }

  if (withSubstance.length >= 2 && withSubstance.length < 6 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`MILESTONE: ${withSubstance.length} areas now have substance. If a natural moment arises (user links two themes, or pauses), a brief milestone reflection is appropriate — but keep it short. Don't reflect after every answer.`);
  }

  if (readyToReflect) {
    notes.push("All six areas have substance. Time to reflect the picture back — in the user's own language, not a data dump.");
    notes.push("Reflect what you genuinely understand, not just what's stored. If something feels thin even though it has 'substance', say so honestly.");
    notes.push("Use everyday military language in the reflection. Civilian translation comes later at the Capability Picture stage.");
  }

  if (mode === 'CONFIRMING') {
    notes.push('Inviting confirmation — frame it as "does this sound like you?" not "please confirm your data."');
    notes.push("If the user corrects something, that's good — they're engaged. Go back and explore the gap, don't treat it as a failure.");
  }

  if (mode === 'CONFIRMED') {
    notes.push('Picture confirmed. The user has agreed this is them. Phase Three (Evaluate) can begin when ready.');
  }

  if (profile.user_confidence !== null && profile.user_confidence < 4 && mode !== 'CONFIRMED') {
    notes.push(`User confidence is low (${profile.user_confidence}/10). Be steady — don't rush toward solutions. The picture matters more than the pace.`);
    notes.push("If the user signals boredom or frustration ('where's this going'), don't push through. Either close the current topic with a checkpoint, or bring the reflection forward if enough areas have substance.");
  }

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

// ─── Companion Core ───

export interface CompanionCoreInput {
  profile: any;              // Already-authorised, DESERIALISED profile
  currentMode: string;       // EXPLORING | REFLECTING | CONFIRMING | CONFIRMED | RE_EXPLORING
  newDiscoveries?: any;     // Optional discoveries to merge
  userResponseType: string;  // answering | correcting | confirming | rejecting
  persist?: (profileId: string, payload: any) => Promise<any>;  // Narrow persistence capability
}

export interface CompanionCoreOutput {
  mergedProfile: any;       // Profile after processing (native structures)
  engineResult: any;         // Assessment areas, missing, ready_for_confirmation, confidence
  mode: string;              // Updated conversation mode
  guidance: any;             // Flow guidance + behavioural notes
  session: any;              // Session context
  companionCoreVersion: string;
}

export async function companionCore(input: CompanionCoreInput): Promise<CompanionCoreOutput> {
  const { profile, currentMode, newDiscoveries, userResponseType, persist } = input;

  // ─── Assess areas BEFORE processing (for checkpoint detection) ───
  const previousAreas = newDiscoveries && Object.keys(newDiscoveries).length > 0
    ? assessAreas(profile)
    : null;

  // ─── Step 1: If new discoveries provided, process and persist ───
  let updatedProfile = profile;
  let engineResult: any = null;

  if (newDiscoveries && Object.keys(newDiscoveries).length > 0) {
    const merged = {
      full_name: newDiscoveries.full_name ?? profile.full_name,
      contact_email: newDiscoveries.contact_email ?? profile.contact_email,
      service_branch: newDiscoveries.service_branch ?? profile.service_branch,
      rank: newDiscoveries.rank ?? profile.rank,
      years_served: newDiscoveries.years_served ?? profile.years_served,
      professional_identity: newDiscoveries.professional_identity ?? profile.professional_identity,
      service_history: newDiscoveries.service_history?.length ? newDiscoveries.service_history : profile.service_history || [],
      personal_context: newDiscoveries.personal_context ?? profile.personal_context,
      goals: newDiscoveries.goals?.length ? newDiscoveries.goals : profile.goals || [],
      operational_context: newDiscoveries.operational_context?.length ? newDiscoveries.operational_context : profile.operational_context || [],
      user_confidence: newDiscoveries.user_confidence !== undefined ? newDiscoveries.user_confidence : profile.user_confidence,
      operational_picture_confirmed: userResponseType === 'rejecting'
        ? false
        : (userResponseType === 'confirming' ? true : (profile.operational_picture_confirmed ?? false)),
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

    const persistencePayload = serializeForPersistence({
      ...merged,
      assessment_confidence: { overall_score: confidence.overall_score, rating: confidence.rating, areas: areas.map(a => ({ area: a.area, score: a.score, notes: a.notes })) },
      tos_phase: newPhase,
    });

    if (persist) {
      updatedProfile = await persist(profile.id, persistencePayload);
      updatedProfile = deserializeProfile(updatedProfile);
    } else {
      // No persistence capability — use merged data in native form
      updatedProfile = {
        ...merged,
        id: profile.id,
        tos_phase: newPhase,
        assessment_confidence: { overall_score: confidence.overall_score, rating: confidence.rating, areas: areas.map(a => ({ area: a.area, score: a.score, notes: a.notes })) },
      };
    }

    engineResult = {
      areas,
      missing_areas: areas.filter(a => !a.has_substance).map(a => a.area),
      ready_for_confirmation: readyForConfirmation,
      can_proceed: userConfirmed && readyForConfirmation,
      assessment_confidence: confidence,
    };
  }

  // ─── Step 2: Determine conversation mode ───
  let mode: ConversationMode = currentMode as ConversationMode;

  if (engineResult) {
    if (userResponseType === 'confirming' && engineResult.can_proceed) {
      mode = 'CONFIRMED';
    } else if (userResponseType === 'rejecting' || userResponseType === 'correcting') {
      mode = 'RE_EXPLORING';
    } else if (engineResult.ready_for_confirmation && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
      mode = 'REFLECTING';
    } else if (mode === 'RE_EXPLORING' && engineResult.missing_areas.length === 0) {
      mode = 'REFLECTING';
    }
  }

  // ─── Step 3: Generate flow guidance ───
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

  return {
    mergedProfile: updatedProfile,
    engineResult,
    mode,
    guidance,
    session: sessionContext,
    companionCoreVersion: COMPANION_CORE_VERSION,
  };
}
