import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * engineDecisionReadiness.ts
 * Phase Four — Decision Readiness Engine
 * Operation PROOF, GapMap MATE
 *
 * Operational Principles (mandatory — do not relax without an Operational Decision):
 *   1. Understand before advising.
 *   2. Evidence before inference.
 *   3. Reveal capability. Never invent it.
 *   4. Capability before recommendation.
 *   5. Readiness before action.
 *
 * Hard Rules:
 *   - No capability matched without traceable evidence_ref in the profile's evidence_log.
 *   - No Decision Factor recorded without user expression (evidence_ref required).
 *   - Pathway matches are only (re)generated on explicit evaluate_pathways action.
 *   - Soak Period state machine: NOT_STARTED → SOAKING → COMPLETED | BYPASSED.
 *     BYPASSED is auditable and explicit — bypass_reason is required.
 *   - tos_phase progression: EVALUATING → SOAKING → READY_TO_ACT (all uppercase).
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { profile_id, action, decision_factors_update, soak_bypass_reason, reflection_notes } = body;

  if (!profile_id) {
    return Response.json({ error: 'profile_id is required' }, { status: 400 });
  }
  if (!action) {
    return Response.json({ error: 'action is required' }, { status: 400 });
  }

  // ─── Load profile ────────────────────────────────────────────────────────
  const profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
  if (!profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  // ─── Precondition gate: Phase Three must be complete ─────────────────────
  const validEntryPhases = ['EVALUATING', 'SOAKING', 'READY_TO_ACT'];
  if (!validEntryPhases.includes(profile.tos_phase)) {
    return Response.json({
      error: `Precondition failed: Decision Readiness Engine requires tos_phase EVALUATING or later. Current phase: ${profile.tos_phase}`,
      current_phase: profile.tos_phase
    }, { status: 400 });
  }

  // ─── Precondition gate: Capability Map must be populated ─────────────────
  if (!profile.capability_map || profile.capability_map.length === 0) {
    return Response.json({
      error: 'Precondition failed: capability_map is empty. Phase Three must be completed before Decision Readiness can proceed.',
    }, { status: 400 });
  }

  // ─── Evidence log index (for reference validation) ────────────────────────
  const evidenceIndex = new Set(
    (profile.evidence_log || []).map((e: any) => e.id)
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: record_decision_factor
  // Records a single decision factor inferred from conversation.
  // Hard rule: evidence_ref must resolve to a genuine evidence_log entry.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'record_decision_factor') {
    if (!decision_factors_update) {
      return Response.json({ error: 'decision_factors_update is required for record_decision_factor' }, { status: 400 });
    }

    // Validate every expressed factor has a resolvable evidence_ref
    const currentFactors = profile.decision_factors || {};
    const violations: string[] = [];

    for (const [factorKey, factorValue] of Object.entries(decision_factors_update as Record<string, any>)) {
      if (factorValue.expressed === true) {
        if (!factorValue.evidence_ref) {
          violations.push(`Factor '${factorKey}': expressed=true but no evidence_ref provided.`);
        } else if (!evidenceIndex.has(factorValue.evidence_ref)) {
          violations.push(`Factor '${factorKey}': evidence_ref '${factorValue.evidence_ref}' does not resolve to any record in this profile's evidence_log.`);
        }
      }
    }

    if (violations.length > 0) {
      return Response.json({
        error: 'Hard Rule Violation: No Decision Factor without user expression.',
        violations
      }, { status: 400 });
    }

    // Merge — use freshly-loaded profile values, not stale caller values
    const updatedFactors = { ...currentFactors };
    for (const [key, value] of Object.entries(decision_factors_update as Record<string, any>)) {
      updatedFactors[key] = { ...(currentFactors[key] || {}), ...value };
    }

    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      decision_factors: updatedFactors
    });

    return Response.json({
      success: true,
      action: 'record_decision_factor',
      updated_factors: Object.keys(decision_factors_update as object),
      message: 'Decision Factor(s) recorded against verified evidence.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: evaluate_pathways
  // Matches the Capability Picture against OCIPathways through Decision Factors.
  // Only called explicitly — not triggered by soak actions or factor updates.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'evaluate_pathways') {
    const allPathways = await base44.asServiceRole.entities.OCIPathway.list();

    // Re-read decision factors from the freshly-loaded profile (not from caller)
    const currentFactors = profile.decision_factors || {};
    const capabilityMap = profile.capability_map || [];

    // Build a normalised capability set from the profile
    const profileCapabilities = capabilityMap.map((cap: any) => ({
      name: (cap.capability || '').toLowerCase().trim(),
      confidence: cap.confidence || 0,
      evidence_refs: cap.evidence_refs || (cap.evidence_ref ? [cap.evidence_ref] : []),
      category: cap.category || ''
    }));

    // Validate all capability evidence refs before matching
    const unresolvedCapabilities: string[] = [];
    for (const cap of profileCapabilities) {
      for (const ref of cap.evidence_refs) {
        if (ref && !evidenceIndex.has(ref)) {
          unresolvedCapabilities.push(`Capability '${cap.name}' references evidence '${ref}' which does not exist in evidence_log.`);
        }
      }
    }

    if (unresolvedCapabilities.length > 0) {
      return Response.json({
        error: 'Evidence integrity failure: capability_map contains unresolvable evidence references.',
        unresolved: unresolvedCapabilities
      }, { status: 400 });
    }

    const matches = [];
    const now = new Date().toISOString();

    for (const pathway of allPathways) {
      if (pathway.review_status === 'retired') continue;

      const pathwayCapabilities = (pathway.capability_profile || []).map((c: string) =>
        c.toLowerCase().trim()
      );

      if (pathwayCapabilities.length === 0) continue;

      // Score: how many pathway capabilities align with profile capabilities?
      const alignedCapabilities: string[] = [];
      for (const required of pathwayCapabilities) {
        const match = profileCapabilities.find((pc: any) =>
          pc.name.includes(required) ||
          required.includes(pc.name) ||
          tokenOverlap(pc.name, required) >= 0.5
        );
        if (match) {
          alignedCapabilities.push(match.name);
        }
      }

      const alignmentRatio = alignedCapabilities.length / pathwayCapabilities.length;

      let confidenceLevel: string;
      if (alignmentRatio >= 0.7) {
        confidenceLevel = 'MATCHED_DIRECTION';
      } else if (alignmentRatio >= 0.4) {
        confidenceLevel = 'POSSIBLE_DIRECTION';
      } else if (alignmentRatio > 0) {
        confidenceLevel = 'WORTH_EXPLORING';
      } else {
        continue; // No meaningful alignment — do not include
      }

      // Build capability explanation
      const capabilityExplanation = alignedCapabilities.length > 0
        ? `Your demonstrated ${alignedCapabilities.slice(0, 3).join(', ')} align${alignedCapabilities.length === 1 ? 's' : ''} with the core requirements of this direction.`
        : 'Partial alignment identified through related capability areas.';

      // Build decision factor alignment note (using freshly-loaded factors)
      const factorNotes: string[] = [];
      const lifestyle = pathway.lifestyle_considerations || {};

      if (currentFactors.family?.expressed) {
        if (lifestyle.shift_patterns && lifestyle.shift_patterns.toLowerCase().includes('night')) {
          factorNotes.push(`You've mentioned family is important — note this direction involves night shifts, which may affect that.`);
        } else {
          factorNotes.push(`You've mentioned family is a priority — this direction's hours are generally compatible with family life.`);
        }
      }

      if (currentFactors.location?.expressed && currentFactors.location?.notes) {
        if (lifestyle.travel && lifestyle.travel.toLowerCase().includes('significant')) {
          factorNotes.push(`You've mentioned location matters to you — this direction involves significant regional travel.`);
        } else {
          factorNotes.push(`You've mentioned staying local matters — this direction is generally site-based.`);
        }
      }

      if (currentFactors.purpose?.expressed && currentFactors.purpose?.notes) {
        factorNotes.push(`This direction aligns with what you've said about wanting meaningful work.`);
      }

      if (currentFactors.lifestyle?.expressed) {
        if (lifestyle.shift_patterns && (lifestyle.shift_patterns.toLowerCase().includes('rotating') || lifestyle.shift_patterns.toLowerCase().includes('night'))) {
          factorNotes.push(`You've mentioned lifestyle matters — rotating shifts in this direction may need consideration.`);
        }
      }

      // Identify gaps
      const unresolved_gaps = pathway.common_transition_gaps || [];

      matches.push({
        pathway_id: pathway.id,
        pathway_name: pathway.name,
        confidence_level: confidenceLevel,
        matching_capabilities: alignedCapabilities,
        capability_explanation: capabilityExplanation,
        decision_factor_alignment: factorNotes.length > 0
          ? factorNotes.join(' ')
          : 'No specific personal priorities expressed yet that affect this direction.',
        lifestyle_fit_notes: lifestyle.notes || '',
        unresolved_gaps,
        generated_at: now
      });
    }

    // Sort: MATCHED_DIRECTION first, then POSSIBLE_DIRECTION, then WORTH_EXPLORING
    const order: Record<string, number> = { MATCHED_DIRECTION: 0, POSSIBLE_DIRECTION: 1, WORTH_EXPLORING: 2 };
    matches.sort((a, b) => (order[a.confidence_level] ?? 3) - (order[b.confidence_level] ?? 3));

    // Persist matches — only on this explicit evaluate action
    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      recommended_pathways: matches
    });

    return Response.json({
      success: true,
      action: 'evaluate_pathways',
      pathway_count: matches.length,
      matched: matches.filter(m => m.confidence_level === 'MATCHED_DIRECTION').length,
      possible: matches.filter(m => m.confidence_level === 'POSSIBLE_DIRECTION').length,
      worth_exploring: matches.filter(m => m.confidence_level === 'WORTH_EXPLORING').length,
      pathways: matches,
      message: matches.length === 0
        ? 'No pathway alignment found at this time. The companion can explore directions conversationally.'
        : `${matches.length} direction(s) identified and persisted to profile.`
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: initiate_soak
  // Transitions Soak Period from NOT_STARTED → SOAKING.
  // Does NOT regenerate pathway matches.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'initiate_soak') {
    const currentSoak = profile.soak_period || {};
    const currentSoakState = currentSoak.state || 'NOT_STARTED';

    // Valid transition: NOT_STARTED → SOAKING only
    if (currentSoakState !== 'NOT_STARTED') {
      return Response.json({
        error: `Invalid Soak Period transition: cannot initiate from state '${currentSoakState}'. Only NOT_STARTED → SOAKING is valid.`,
        current_soak_state: currentSoakState
      }, { status: 400 });
    }

    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      soak_period: {
        state: 'SOAKING',
        initiated_date: new Date().toISOString(),
        completed_date: null,
        bypassed_date: null,
        bypass_reason: null,
        reflection_notes: ''
      },
      tos_phase: 'SOAKING'
    });

    return Response.json({
      success: true,
      action: 'initiate_soak',
      soak_state: 'SOAKING',
      message: 'Soak Period initiated. Individual is encouraged to reflect before proceeding.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: complete_soak
  // Transitions Soak Period SOAKING → COMPLETED and advances tos_phase to READY_TO_ACT.
  // Does NOT regenerate pathway matches.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'complete_soak') {
    const currentSoak = profile.soak_period || {};
    const currentSoakState = currentSoak.state || 'NOT_STARTED';

    if (currentSoakState !== 'SOAKING') {
      return Response.json({
        error: `Invalid Soak Period transition: cannot complete from state '${currentSoakState}'. Only SOAKING → COMPLETED is valid.`,
        current_soak_state: currentSoakState
      }, { status: 400 });
    }

    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      soak_period: {
        ...currentSoak,
        state: 'COMPLETED',
        completed_date: new Date().toISOString(),
        reflection_notes: reflection_notes || currentSoak.reflection_notes || ''
      },
      tos_phase: 'READY_TO_ACT'
    });

    return Response.json({
      success: true,
      action: 'complete_soak',
      soak_state: 'COMPLETED',
      tos_phase: 'READY_TO_ACT',
      message: 'Soak Period completed. Individual has reached Decision Readiness — tos_phase advanced to READY_TO_ACT.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: bypass_soak
  // Explicit, auditable bypass of the Soak Period.
  // SOAKING or NOT_STARTED → BYPASSED. bypass_reason is required.
  // The individual owns the decision — this gate is soft, not hard.
  // Does NOT regenerate pathway matches.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'bypass_soak') {
    if (!soak_bypass_reason || soak_bypass_reason.trim().length < 10) {
      return Response.json({
        error: 'bypass_reason is required and must be descriptive (min 10 chars). The bypass must be explicit and auditable.',
      }, { status: 400 });
    }

    const currentSoak = profile.soak_period || {};
    const currentSoakState = currentSoak.state || 'NOT_STARTED';

    // Can bypass from NOT_STARTED or SOAKING — not from COMPLETED or already BYPASSED
    const validBypassStates = ['NOT_STARTED', 'SOAKING'];
    if (!validBypassStates.includes(currentSoakState)) {
      return Response.json({
        error: `Invalid Soak Period transition: cannot bypass from state '${currentSoakState}'.`,
        current_soak_state: currentSoakState
      }, { status: 400 });
    }

    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      soak_period: {
        ...currentSoak,
        state: 'BYPASSED',
        bypassed_date: new Date().toISOString(),
        bypass_reason: soak_bypass_reason.trim()
      },
      tos_phase: 'READY_TO_ACT'
    });

    return Response.json({
      success: true,
      action: 'bypass_soak',
      soak_state: 'BYPASSED',
      tos_phase: 'READY_TO_ACT',
      bypass_reason: soak_bypass_reason.trim(),
      message: 'Soak Period bypassed. Individual has chosen to proceed. Bypass is recorded and auditable. tos_phase advanced to READY_TO_ACT.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: get_status
  // Returns current Decision Readiness state without modifying anything.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'get_status') {
    const expressedFactors = Object.entries(profile.decision_factors || {})
      .filter(([, v]: [string, any]) => v?.expressed === true)
      .map(([k]) => k);

    return Response.json({
      success: true,
      action: 'get_status',
      tos_phase: profile.tos_phase,
      soak_period: profile.soak_period || { state: 'NOT_STARTED' },
      pathway_count: (profile.recommended_pathways || []).length,
      expressed_decision_factors: expressedFactors,
      capability_count: (profile.capability_map || []).length
    });
  }

  // Unknown action
  return Response.json({
    error: `Unknown action: '${action}'. Valid actions: record_decision_factor, evaluate_pathways, initiate_soak, complete_soak, bypass_soak, get_status.`
  }, { status: 400 });
});

// ─── Utility: token overlap scoring ───────────────────────────────────────
// Simple word-level Jaccard similarity for fuzzy capability matching.
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}
