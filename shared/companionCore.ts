// ============================================================
// companionCore — Shared Companion Domain Logic
// R1-C.1E: Natural Evidence Capture + Conversational Sufficiency
// Packet 1 + Packet 2 changes applied
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

export const COMPANION_CORE_VERSION = "1.2.0";

// ─── Serialization Adapters ───

export function parseJSON(value: any, fallback: any = undefined): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback !== undefined ? fallback : value; }
}

const STRING_PERSIST_FIELDS = new Set(["user_confidence", "years_served"]);

export function serializeForPersistence(data: any): any {
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

// ─── R1-C.1E: Field-appropriate substance tests ───

function hasAnyValue(v: any): boolean {
  return v !== null && v !== undefined && typeof v === 'string' && v.trim().length >= 2;
}

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

// ─── R1-C.1E: Array merge helpers (enrichment, not replacement) ───

function mergeServiceHistory(existing: any[], newEntries: any[]): any[] {
  const merged = [...existing];
  for (const newEntry of newEntries) {
    const matchIdx = merged.findIndex(e =>
      e.role && newEntry.role &&
      (e.role.toLowerCase().includes(newEntry.role.toLowerCase()) ||
       newEntry.role.toLowerCase().includes(e.role.toLowerCase())));
    if (matchIdx >= 0) {
      for (const key of ['responsibilities', 'achievements', 'leadership_scope', 'role']) {
        if (!hasAnyValue(merged[matchIdx][key]) && hasAnyValue(newEntry[key])) {
          merged[matchIdx][key] = newEntry[key];
        } else if (!hasSubstance(merged[matchIdx][key]) && hasSubstance(newEntry[key])) {
          merged[matchIdx][key] = newEntry[key];
        }
      }
    } else {
      merged.push(newEntry);
    }
  }
  return merged;
}

function mergeOperationalContext(existing: any[], newEntries: any[]): any[] {
  const merged = [...existing];
  for (const newEntry of newEntries) {
    const matchIdx = merged.findIndex(e =>
      e.factor && newEntry.factor &&
      e.factor.toLowerCase() === newEntry.factor.toLowerCase());
    if (matchIdx >= 0) {
      if (hasSubstance(newEntry.description) &&
          !merged[matchIdx].description.includes(newEntry.description)) {
        merged[matchIdx].description += `; ${newEntry.description}`;
      }
    } else {
      merged.push(newEntry);
    }
  }
  return merged;
}

function mergeGoals(existing: any[], newEntries: any[]): any[] {
  const combined = [...existing, ...newEntries];
  return combined.filter((g, i, arr) =>
    arr.findIndex(x => x.toLowerCase() === g.toLowerCase()) === i);
}

function preserveIfSubstantive(existing: any, newVal: any, isCorrecting: boolean): any {
  if (isCorrecting) return newVal ?? existing;
  if (hasSubstance(existing)) return existing;
  return newVal ?? existing;
}

// ─── Area assessment ───

interface AreaAssessment { area: string; has_substance: boolean; score: number; notes: string; }

function assessAreas(p: any): AreaAssessment[] {
  return [
    {
      area: 'Who are you?',
      has_substance: hasAnyValue(p.service_branch) && hasAnyValue(p.rank) && hasSubstance(p.professional_identity),
      score: (hasAnyValue(p.service_branch) && hasAnyValue(p.rank) ? 7 : 0) + (hasSubstance(p.professional_identity) ? 8 : 0),
      notes: [hasAnyValue(p.service_branch) && hasAnyValue(p.rank) ? 'Branch and rank on file.' : 'Missing branch/rank.',
              hasSubstance(p.professional_identity) ? 'Professional identity captured.' : 'Identity narrative not yet explored.'].join(' ').trim()
    },
    {
      area: 'What have you done?',
      has_substance: hasArrSubstance(p.service_history) && (p.service_history || []).some((h: any) =>
        hasAnyValue(h.role) || hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)),
      score: (() => {
        if (!p.service_history?.length) return 0;
        const rich = p.service_history.filter((h: any) =>
          hasAnyValue(h.role) || hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope));
        return Math.min(15, 5 + rich.length * 5);
      })(),
      notes: p.service_history?.length
        ? `${p.service_history.length} role(s) recorded, ${p.service_history.filter((h: any) => hasAnyValue(h.role) || hasSubstance(h.responsibilities) || hasSubstance(h.achievements) || hasSubstance(h.leadership_scope)).length} with substantive detail.`
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
      has_substance: p.user_confidence !== null && p.user_confidence !== undefined && typeof p.user_confidence === 'number',
      score: (p.user_confidence !== null && p.user_confidence !== undefined && typeof p.user_confidence === 'number') ? 10 : 0,
      notes: (p.user_confidence !== null && p.user_confidence !== undefined && typeof p.user_confidence === 'number') ? `User self-reported confidence: ${p.user_confidence}/10.` : 'User confidence not yet assessed.'
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

// ─── Reflection content generator (R1-C.1E: gap sections added) ───

const AREA_LABELS: Record<string, string> = {
  'Who are you?': 'who you are',
  'What have you done?': 'what you\'ve done',
  'Where are you now?': 'where you are now',
  'Where are you going?': 'where you\'re heading',
  'What influences your journey?': 'what\'s influencing your decisions',
  'How well do we understand?': 'how confident you\'re feeling',
};

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
  if (get('How well do we understand?')?.has_substance && typeof profile.user_confidence === 'number')
    sections.push(`USER CONFIDENCE: ${profile.user_confidence}/10. Assessment confidence: ${profile.assessment_confidence?.overall_score || 'N/A'}/100 (${profile.assessment_confidence?.rating || 'N/A'}).`);

  // R1-C.1E: Missing evidence visibly missing in POP (Cipher #2)
  for (const area of areas) {
    if (!area.has_substance) {
      sections.push(`NOT YET DISCUSSED: We haven't talked much about ${AREA_LABELS[area.area] || area.area.toLowerCase()} yet. That's fine — we can come back to it if it becomes relevant.`);
    }
  }

  return sections.join('\n\n');
}

// ─── Flow guidance ───

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
  // R1-C.1E Packet 3: readyToReflect now driven by sufficiency gate, not area-count
  const readyToReflect = false;

  let reflectionContent: string | null = null;
  if (mode === 'REFLECTING' || (readyToReflect && mode !== 'CONFIRMED'))
    reflectionContent = generateReflectionContent(profile, areas);

  const notes: string[] = [];

  if (missing.length > 0 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push(`Still exploring — ${missing.length} area(s) need substance before reflecting.`);
    if (nextArea) {
      notes.push(`Suggested next area: "${nextArea}". This is a suggestion, not a script — if the user naturally covers another area, move with them.`);
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
    notes.push(`${withSubstance.length} of 6 areas have substance. The user may be ready to reflect on what they've shared, even if some areas haven't been explored. If they signal they want to wrap up or move on, respect that.`);
  }

  if (typeof profile.user_confidence === 'number' && profile.user_confidence < 4 && mode !== 'CONFIRMED') {
    notes.push('LOW CONFIDENCE FLAG: User self-reported confidence is below 4/10. Be extra careful not to push. Prioritise psychological safety over data collection.');
  }

  if (withSubstance.length >= 3 && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
    notes.push('If the user signals they want to wrap up or move on, respect that. You can reflect what you have and ask if they want to continue or pause.');
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
  profile: any;
  currentMode: string;
  newDiscoveries?: any;
  userResponseType: string;
  persist?: (profileId: string, payload: any) => Promise<any>;
  sufficiencyResult?: { sufficient: boolean; reason: string; missing: string[] } | null;
}

export interface CompanionCoreOutput {
  mergedProfile: any;
  engineResult: any;
  mode: string;
  guidance: any;
  session: any;
  companionCoreVersion: string;
}

export async function companionCore(input: CompanionCoreInput): Promise<CompanionCoreOutput> {
  const { profile, currentMode, newDiscoveries, userResponseType, persist, sufficiencyResult } = input;

  const previousAreas = newDiscoveries && Object.keys(newDiscoveries).length > 0
    ? assessAreas(profile)
    : null;

  let updatedProfile = profile;
  let engineResult: any = null;

  if (newDiscoveries && Object.keys(newDiscoveries).length > 0) {
    const isCorrecting = userResponseType === 'correcting';

    const merged = {
      full_name: newDiscoveries.full_name ?? profile.full_name,
      contact_email: newDiscoveries.contact_email ?? profile.contact_email,
      service_branch: newDiscoveries.service_branch ?? profile.service_branch,
      rank: newDiscoveries.rank ?? profile.rank,
      years_served: newDiscoveries.years_served ?? profile.years_served,
      professional_identity: preserveIfSubstantive(profile.professional_identity, newDiscoveries.professional_identity, isCorrecting),
      service_history: mergeServiceHistory(profile.service_history || [], newDiscoveries.service_history || []),
      personal_context: preserveIfSubstantive(profile.personal_context, newDiscoveries.personal_context, isCorrecting),
      goals: mergeGoals(profile.goals || [], newDiscoveries.goals || []),
      operational_context: mergeOperationalContext(profile.operational_context || [], newDiscoveries.operational_context || []),
      user_confidence: (newDiscoveries.user_confidence !== undefined && typeof newDiscoveries.user_confidence === 'number')
        ? newDiscoveries.user_confidence
        : profile.user_confidence,
      evidence_log: [...(profile.evidence_log || []), ...(newDiscoveries.evidence_log || [])],
      operational_picture_confirmed: userResponseType === 'rejecting'
        ? false
        : (userResponseType === 'confirming' && profile.tos_phase === 'CONFIRMING' ? true : (profile.operational_picture_confirmed ?? false)),
    };

    const areas = assessAreas(merged);
    // R1-C.1E Packet 3: allCoreSubstantive/understandingSubstantive removed (checklist gate)
    // R1-C.1E Packet 3: Sufficiency gate replaces checklist (minUnderstanding removed)
    // EXPLORING → CONFIRMING is now triggered by the LLM sufficiency judgment (passed from orchestrator)
    let newPhase = profile.tos_phase;
    if (sufficiencyResult?.sufficient === true && profile.tos_phase === 'EXPLORING') newPhase = 'CONFIRMING';

    const userConfirmed = merged.operational_picture_confirmed === true;

    // R1-C.1E: Confirmation gate — no area-count requirement (Cipher #2)
    if (userResponseType === 'confirming' && userConfirmed && profile.tos_phase === 'CONFIRMING') {
      newPhase = 'CONFIRMED';
    }

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
      can_proceed: userConfirmed && profile.tos_phase === 'CONFIRMING',
      assessment_confidence: confidence,
    };
  }

  let mode: ConversationMode = currentMode as ConversationMode;

  if (engineResult) {
    if (userResponseType === 'confirming' && engineResult.can_proceed && profile.tos_phase === 'CONFIRMING') {
      mode = 'CONFIRMED';
    } else if (userResponseType === 'rejecting' || userResponseType === 'correcting') {
      mode = 'RE_EXPLORING';
    } else if (sufficiencyResult?.sufficient === true && (mode === 'EXPLORING' || mode === 'RE_EXPLORING')) {
      mode = 'CONFIRMING';
    }
  }

  const currentAreas = engineResult?.areas || assessAreas(updatedProfile);
  const guidance = generateFlowGuidance(mode, currentAreas, updatedProfile, previousAreas);

  const sessionContext = {
    mode,
    areas_explored: currentAreas.filter((a: any) => a.has_substance).map((a: any) => a.area),
    areas_outstanding: currentAreas.filter((a: any) => !a.has_substance).map((a: any) => a.area),
    profile_phase: updatedProfile.tos_phase,
    assessment_confidence: updatedProfile.assessment_confidence?.rating || 'LOW',
    user_confidence: typeof updatedProfile.user_confidence === 'number' ? updatedProfile.user_confidence : null,
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
