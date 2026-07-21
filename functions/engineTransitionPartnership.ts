import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * engineTransitionPartnership.ts
 * Phase Five — Transition Partnership Engine
 * Operation PROOF, GapMap MATE
 *
 * Operational Principles (mandatory — do not relax without an Operational Decision):
 *   1. Partnership before Prescription
 *   2. Progress before Perfection
 *   3. Accountability without Pressure
 *   4. Adaptation before Rigidity
 *   5. Presence before Intervention
 *
 * Foundational Doctrinal Principle:
 *   "Operational memory exists to preserve continuity, not accountability.
 *    The objective is to help the individual see their progress, not to measure their performance."
 *
 * Architecture Boundary:
 *   Engine: Knows what has changed and what the current operational state is.
 *   Smudge: Decides how to discuss it.
 *   This separation is preserved from all previous phases.
 *
 * Hard Rules:
 *   - No journey created until Phase Four is complete (tos_phase === READY_TO_ACT, soak resolved).
 *   - Partnership state machine transitions are validated. Invalid transitions blocked.
 *   - INDEPENDENT is terminal. A new journey begins if the user returns.
 *   - Checkpoints created automatically on material change, not on every action.
 *   - Commitments are user-owned. No failure terminology. No evidence_ref (continuity, not accountability).
 *   - Wellbeing is awareness state only. No diagnosis, no scoring, no clinical interpretation.
 *   - Confidence is behavioural bands, not numeric scores.
 *   - Referrals are recorded by the engine; the decision to refer is Smudge's judgement.
 *   - Every engine action must pass the doctrinal test:
 *     "Does this help the individual see their progress, not measure their performance?"
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ─── Parse request body safely ────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { profile_id, action } = body;

  if (!profile_id || typeof profile_id !== 'string' || profile_id.trim().length === 0) {
    return Response.json({ error: 'profile_id is required and must be a non-empty string' }, { status: 400 });
  }
  if (!action || typeof action !== 'string') {
    return Response.json({ error: 'action is required' }, { status: 400 });
  }

  // ─── Load profile — wrapped to handle SDK exceptions on malformed IDs ────
  let profile: any;
  try {
    profile = await base44.asServiceRole.entities.UserProfile.get(profile_id.trim());
  } catch (err: any) {
    return Response.json({
      error: 'Profile lookup failed',
      detail: err?.message || 'Unknown error during profile fetch. Check profile_id format.'
    }, { status: 400 });
  }

  if (!profile) {
    return Response.json({ error: `Profile not found: ${profile_id}` }, { status: 404 });
  }

  // ─── Partnership Lifecycle State Machine ──────────────────────────────────
  const VALID_TRANSITIONS: Record<string, string[]> = {
    'ACTIVE':           ['MONITORING', 'SUPPORT_REQUIRED', 'REFERRAL', 'INDEPENDENT'],
    'MONITORING':       ['ACTIVE', 'SUPPORT_REQUIRED', 'REFERRAL', 'INDEPENDENT'],
    'SUPPORT_REQUIRED': ['ACTIVE', 'REFERRAL', 'INDEPENDENT'],
    'REFERRAL':         ['ACTIVE', 'MONITORING', 'INDEPENDENT'],
    'INDEPENDENT':      []  // terminal
  };

  function isValidTransition(from: string, to: string): boolean {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
  }

  // ─── Checkpoint Trigger Detection ─────────────────────────────────────────
  // Returns a change summary string if material change detected, null otherwise.
  function detectMaterialChange(
    oldJourney: any,
    newFields: any
  ): string | null {
    const changes: string[] = [];

    // Partnership state transition
    if (newFields.partnership_state && oldJourney.partnership_state !== newFields.partnership_state) {
      changes.push(`Partnership state: ${oldJourney.partnership_state || 'none'} → ${newFields.partnership_state}`);
    }

    // Confidence band shift
    if (newFields.confidence_band && oldJourney.confidence_band !== newFields.confidence_band) {
      changes.push(`Confidence: ${oldJourney.confidence_band || 'none'} → ${newFields.confidence_band}`);
    }

    // Blocker change (added or removed)
    const oldBlockers = Array.isArray(oldJourney.current_blockers) ? oldJourney.current_blockers : [];
    const newBlockers = Array.isArray(newFields.current_blockers) ? newFields.current_blockers : null;
    if (newBlockers !== null) {
      const added = newBlockers.filter((b: string) => !oldBlockers.includes(b));
      const removed = oldBlockers.filter((b: string) => !newBlockers.includes(b));
      if (added.length > 0) changes.push(`New blocker: ${added.join(', ')}`);
      if (removed.length > 0) changes.push(`Blocker resolved: ${removed.join(', ')}`);
    }

    // Commitment status change (completed or no longer relevant)
    if (newFields.active_commitments && Array.isArray(newFields.active_commitments)) {
      const oldCommitments = Array.isArray(oldJourney.active_commitments) ? oldJourney.active_commitments : [];
      const oldStatusMap = new Map(oldCommitments.map((c: any) => [c.id, c.status]));
      for (const newCommitment of newFields.active_commitments) {
        const oldStatus = oldStatusMap.get(newCommitment.id);
        if (oldStatus && oldStatus !== newCommitment.status) {
          if (newCommitment.status === 'COMPLETED') {
            changes.push(`Commitment completed: ${newCommitment.description}`);
          } else if (newCommitment.status === 'NO_LONGER_RELEVANT') {
            changes.push(`Commitment no longer relevant: ${newCommitment.description}`);
          } else if (newCommitment.status === 'PAUSED') {
            changes.push(`Commitment paused: ${newCommitment.description}`);
          } else if (newCommitment.status === 'REVISED') {
            changes.push(`Commitment revised: ${newCommitment.description}`);
          }
        }
      }
    }

    // Direction change
    if (newFields.current_direction !== undefined && oldJourney.current_direction !== newFields.current_direction) {
      changes.push(`Direction changed: ${oldJourney.current_direction || 'none'} → ${newFields.current_direction}`);
    }

    // Wellbeing awareness surfaced
    if (newFields.wellbeing_awareness?.awareness === 'NOTED' &&
        (!oldJourney.wellbeing_awareness || oldJourney.wellbeing_awareness.awareness !== 'NOTED')) {
      changes.push('Wellbeing concern voluntarily shared');
    }

    // Referral recorded
    if (newFields._newReferral) {
      changes.push(`Referral to ${newFields._newReferral}`);
    }

    return changes.length > 0 ? changes.join('; ') : null;
  }

  // ─── Create Checkpoint ────────────────────────────────────────────────────
  async function createCheckpoint(journey: any, changeSummary: string): Promise<void> {
    const checkpoint = {
      journey_id: journey.id,
      user_profile_id: journey.user_profile_id,
      checkpoint_date: new Date().toISOString().split('T')[0],
      partnership_state: journey.partnership_state,
      transition_status_snapshot: {
        employment: journey.transition_status?.employment || '',
        training: journey.transition_status?.training || ''
      },
      confidence_band: journey.confidence_band,
      active_commitments_snapshot: Array.isArray(journey.active_commitments)
        ? journey.active_commitments.map((c: any) => ({ description: c.description, status: c.status }))
        : [],
      current_blockers_snapshot: Array.isArray(journey.current_blockers) ? journey.current_blockers : [],
      wellbeing_awareness_snapshot: journey.wellbeing_awareness || { awareness: 'NONE' },
      operational_readiness: journey.operational_readiness,
      change_summary: changeSummary
    };

    await base44.asServiceRole.entities.JourneyCheckpoint.create(checkpoint);
  }

  // ─── Find Active Journey for Profile ──────────────────────────────────────
  async function findActiveJourney(profileId: string): Promise<any | null> {
    let journeys: any[];
    try {
      journeys = await base44.asServiceRole.entities.TransitionJourney.list();
    } catch {
      return null;
    }

    // Find journey where partnership_state is not INDEPENDENT and user_profile_id matches
    const active = journeys.find((j: any) =>
      j.user_profile_id === profileId &&
      j.partnership_state !== 'INDEPENDENT'
    );

    return active || null;
  }

  // ─── Update Journey + Auto-Checkpoint ─────────────────────────────────────
  async function updateJourneyWithCheckpoint(
    journey: any,
    updateFields: any,
    newReferralOrg?: string
  ): Promise<any> {
    // Detect material change BEFORE applying update
    const fieldsForDetection = { ...updateFields };
    if (newReferralOrg) {
      fieldsForDetection._newReferral = newReferralOrg;
    }
    const changeSummary = detectMaterialChange(journey, fieldsForDetection);

    // If material change detected, create checkpoint of CURRENT state (before update)
    if (changeSummary) {
      await createCheckpoint(journey, changeSummary);
    }

    // Apply the update
    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(
      journey.id,
      { ...updateFields, last_interaction_date: new Date().toISOString().split('T')[0] }
    );

    return updatedJourney;
  }

  // ─── Generate Commitment ID ───────────────────────────────────────────────
  function generateCommitmentId(): string {
    return 'cmt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACTION ROUTING
  // ═════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: start_journey
  // Initialise a TransitionJourney when Phase Five begins.
  // Preconditions: tos_phase === READY_TO_ACT, soak_period.state === COMPLETED or BYPASSED.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'start_journey') {
    if (profile.tos_phase !== 'READY_TO_ACT') {
      return Response.json({
        error: `Precondition failed: Transition Partnership requires tos_phase READY_TO_ACT. Current phase: ${profile.tos_phase}`,
        current_phase: profile.tos_phase
      }, { status: 400 });
    }

    const soakState = profile.soak_period?.state;
    if (soakState !== 'COMPLETED' && soakState !== 'BYPASSED') {
      return Response.json({
        error: `Precondition failed: Soak Period must be COMPLETED or BYPASSED. Current soak state: ${soakState || 'NOT_STARTED'}`,
        soak_state: soakState || 'NOT_STARTED'
      }, { status: 400 });
    }

    if (!Array.isArray(profile.capability_map) || profile.capability_map.length === 0) {
      return Response.json({
        error: 'Precondition failed: capability_map is empty. Phase Three must be completed before Transition Partnership can begin.'
      }, { status: 400 });
    }

    // Check for existing active journey
    const existing = await findActiveJourney(profile_id);
    if (existing) {
      return Response.json({
        success: true,
        action: 'start_journey',
        journey_id: existing.id,
        message: 'Active journey already exists. Returning existing journey.',
        partnership_state: existing.partnership_state
      });
    }

    // Carry forward direction from Phase Four recommended pathways
    const direction = Array.isArray(profile.recommended_pathways) && profile.recommended_pathways.length > 0
      ? profile.recommended_pathways[0].pathway_name || ''
      : '';

    const today = new Date().toISOString().split('T')[0];

    // Create the journey
    const journey = await base44.asServiceRole.entities.TransitionJourney.create({
      user_profile_id: profile_id,
      partnership_state: 'ACTIVE',
      transition_status: {
        employment: '',
        training: '',
        applications: [],
        interviews: []
      },
      current_direction: direction,
      active_commitments: [],
      current_blockers: [],
      confidence_band: 'BUILDING',
      confidence_trend: 'STABLE',
      wellbeing_awareness: { awareness: 'NONE' },
      significant_milestones: [],
      referral_history: [],
      operational_readiness: 'ON_COURSE',
      last_interaction_date: today,
      journey_started_date: today,
      journey_concluded_date: '',
      conclusion_summary: ''
    });

    // Update tos_phase to IN_TRANSITION
    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      tos_phase: 'IN_TRANSITION'
    });

    return Response.json({
      success: true,
      action: 'start_journey',
      journey_id: journey.id,
      partnership_state: 'ACTIVE',
      confidence_band: 'BUILDING',
      operational_readiness: 'ON_COURSE',
      current_direction: direction,
      message: 'Transition Partnership journey started. The individual is now in active partnership.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: get_journey_status
  // Returns the current operational position + recent checkpoints for delta.
  // This is what Smudge reads to resume a conversation seamlessly.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'get_journey_status') {
    const journey = await findActiveJourney(profile_id);

    if (!journey) {
      // Check if there's a concluded journey
      let allJourneys: any[] = [];
      try {
        allJourneys = await base44.asServiceRole.entities.TransitionJourney.list();
      } catch {}

      const concluded = allJourneys.find((j: any) =>
        j.user_profile_id === profile_id && j.partnership_state === 'INDEPENDENT'
      );

      if (concluded) {
        return Response.json({
          success: true,
          action: 'get_journey_status',
          journey_active: false,
          message: 'Previous journey concluded. The individual reached independence.',
          previous_journey_id: concluded.id,
          conclusion_summary: concluded.conclusion_summary
        });
      }

      return Response.json({
        success: true,
        action: 'get_journey_status',
        journey_active: false,
        message: 'No active Transition Partnership journey. Call start_journey to begin Phase Five.',
        tos_phase: profile.tos_phase
      });
    }

    // Fetch recent checkpoints (latest 5) for delta/trend
    let checkpoints: any[] = [];
    try {
      checkpoints = await base44.asServiceRole.entities.JourneyCheckpoint.list();
    } catch {}

    const journeyCheckpoints = checkpoints
      .filter((c: any) => c.journey_id === journey.id)
      .sort((a: any, b: any) => (b.checkpoint_date || '').localeCompare(a.checkpoint_date || ''))
      .slice(0, 5);

    // Build delta summary from latest checkpoint
    let delta: any = null;
    if (journeyCheckpoints.length > 0) {
      const latestCheckpoint = journeyCheckpoints[0];
      delta = {
        last_checkpoint_date: latestCheckpoint.checkpoint_date,
        last_change: latestCheckpoint.change_summary,
        confidence_at_checkpoint: latestCheckpoint.confidence_band,
        confidence_now: journey.confidence_band,
        confidence_movement: journey.confidence_band !== latestCheckpoint.confidence_band
          ? `${latestCheckpoint.confidence_band} → ${journey.confidence_band}`
          : 'no change',
        state_at_checkpoint: latestCheckpoint.partnership_state,
        state_now: journey.partnership_state
      };
    }

    // Active commitments summary (for Smudge to review)
    const activeCommitments = Array.isArray(journey.active_commitments)
      ? journey.active_commitments.filter((c: any) => c.status === 'ACTIVE')
      : [];
    const completedCommitments = Array.isArray(journey.active_commitments)
      ? journey.active_commitments.filter((c: any) => c.status === 'COMPLETED')
      : [];

    return Response.json({
      success: true,
      action: 'get_journey_status',
      journey_active: true,
      journey_id: journey.id,
      partnership_state: journey.partnership_state,
      transition_status: journey.transition_status,
      current_direction: journey.current_direction,
      current_blockers: journey.current_blockers || [],
      confidence_band: journey.confidence_band,
      confidence_trend: journey.confidence_trend,
      operational_readiness: journey.operational_readiness,
      wellbeing_awareness: journey.wellbeing_awareness || { awareness: 'NONE' },
      active_commitments: activeCommitments,
      completed_commitments_count: completedCommitments.length,
      significant_milestones: journey.significant_milestones || [],
      referral_history: journey.referral_history || [],
      last_interaction_date: journey.last_interaction_date,
      next_check_in_date: journey.next_check_in_date || null,
      journey_started_date: journey.journey_started_date,
      checkpoint_count: journeyCheckpoints.length,
      recent_checkpoints: journeyCheckpoints.map((c: any) => ({
        date: c.checkpoint_date,
        change: c.change_summary,
        confidence: c.confidence_band,
        state: c.partnership_state
      })),
      delta: delta,
      message: 'Journey status retrieved. Smudge can resume from this position.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: record_commitment
  // Records a new commitment chosen by the individual.
  // Commitments are user-owned. Not promises to Smudge.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'record_commitment') {
    const { description, target_date } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return Response.json({ error: 'description is required for a commitment' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found. Call start_journey first.' }, { status: 400 });
    }

    const newCommitment = {
      id: generateCommitmentId(),
      description: description.trim(),
      status: 'ACTIVE',
      created_date: new Date().toISOString().split('T')[0],
      target_date: target_date || '',
      completed_date: '',
      revised_from: ''
    };

    const commitments = Array.isArray(journey.active_commitments) ? [...journey.active_commitments] : [];
    commitments.push(newCommitment);

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      active_commitments: commitments,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'record_commitment',
      commitment_id: newCommitment.id,
      description: newCommitment.description,
      status: 'ACTIVE',
      message: 'Commitment recorded. This is the individual\'s commitment to themselves — Smudge will help them remember and review it.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_commitment
  // Updates a commitment's status. No failure terminology.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_commitment') {
    const { commitment_id, new_status, revised_description } = body;

    if (!commitment_id || typeof commitment_id !== 'string') {
      return Response.json({ error: 'commitment_id is required' }, { status: 400 });
    }

    const validStatuses = ['ACTIVE', 'COMPLETED', 'PAUSED', 'REVISED', 'NO_LONGER_RELEVANT'];
    if (!validStatuses.includes(new_status)) {
      return Response.json({
        error: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
        received: new_status
      }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const commitments = Array.isArray(journey.active_commitments) ? [...journey.active_commitments] : [];
    const commitment = commitments.find((c: any) => c.id === commitment_id);

    if (!commitment) {
      return Response.json({ error: `Commitment not found: ${commitment_id}` }, { status: 404 });
    }

    const oldStatus = commitment.status;

    // If revising, preserve the original description
    if (new_status === 'REVISED' && revised_description) {
      commitment.revised_from = commitment.description;
      commitment.description = revised_description;
    }

    commitment.status = new_status;

    if (new_status === 'COMPLETED') {
      commitment.completed_date = new Date().toISOString().split('T')[0];
    }

    // Auto-checkpoint if material change (COMPLETED, NO_LONGER_RELEVANT, PAUSED, REVISED)
    const materialStatuses = ['COMPLETED', 'NO_LONGER_RELEVANT', 'PAUSED', 'REVISED'];
    if (materialStatuses.includes(new_status) && oldStatus !== new_status) {
      const changeSummary = `Commitment ${new_status.toLowerCase()}: ${commitment.description}`;
      // Create checkpoint of state BEFORE update
      await createCheckpoint(journey, changeSummary);
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      active_commitments: commitments,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_commitment',
      commitment_id: commitment_id,
      previous_status: oldStatus,
      new_status: new_status,
      message: new_status === 'COMPLETED'
        ? 'Commitment completed. The individual achieved what they set out to do.'
        : new_status === 'PAUSED'
        ? 'Commitment paused. Circumstances changed — this is adaptation, not failure.'
        : new_status === 'REVISED'
        ? 'Commitment revised. The individual updated their intention based on new reality.'
        : new_status === 'NO_LONGER_RELEVANT'
        ? 'Commitment no longer relevant. Direction shifted — this is learning, not failure.'
        : 'Commitment status updated.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_transition_status
  // Updates the current operational position (employment, training, applications, interviews).
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_transition_status') {
    const { transition_status_update } = body;

    if (!transition_status_update || typeof transition_status_update !== 'object') {
      return Response.json({ error: 'transition_status_update is required and must be an object' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const currentStatus = journey.transition_status || {};
    const updatedStatus = { ...currentStatus, ...transition_status_update };

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      transition_status: updatedStatus,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_transition_status',
      transition_status: updatedStatus,
      message: 'Operational position updated. The individual\'s current situation has been refreshed.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: record_blocker
  // Records a current obstacle. Positional — what's in the way right now.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'record_blocker') {
    const { blocker } = body;

    if (!blocker || typeof blocker !== 'string' || blocker.trim().length === 0) {
      return Response.json({ error: 'blocker description is required' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const blockers = Array.isArray(journey.current_blockers) ? [...journey.current_blockers] : [];
    if (!blockers.includes(blocker.trim())) {
      blockers.push(blocker.trim());
    }

    // Material change — new blocker
    const changeSummary = `New blocker: ${blocker.trim()}`;
    await createCheckpoint(journey, changeSummary);

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      current_blockers: blockers,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'record_blocker',
      blocker: blocker.trim(),
      current_blockers: blockers,
      message: 'Blocker recorded. This is what\'s in the way right now — not a permanent obstacle.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: resolve_blocker
  // Removes a blocker that has been resolved. Triggers a checkpoint.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'resolve_blocker') {
    const { blocker } = body;

    if (!blocker || typeof blocker !== 'string') {
      return Response.json({ error: 'blocker is required' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const blockers = Array.isArray(journey.current_blockers) ? [...journey.current_blockers] : [];
    const updatedBlockers = blockers.filter((b: string) => b !== blocker.trim());

    if (updatedBlockers.length === blockers.length) {
      return Response.json({
        success: true,
        action: 'resolve_blocker',
        message: 'Blocker not found in current list — it may already be resolved.'
      });
    }

    // Material change — blocker resolved
    const changeSummary = `Blocker resolved: ${blocker.trim()}`;
    await createCheckpoint(journey, changeSummary);

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      current_blockers: updatedBlockers,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'resolve_blocker',
      resolved_blocker: blocker.trim(),
      remaining_blockers: updatedBlockers,
      message: 'Blocker resolved. The path forward is clearer.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: record_milestone
  // Records a significant achievement — for showing progress, not measuring performance.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'record_milestone') {
    const { milestone_text } = body;

    if (!milestone_text || typeof milestone_text !== 'string' || milestone_text.trim().length === 0) {
      return Response.json({ error: 'milestone_text is required' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const milestones = Array.isArray(journey.significant_milestones) ? [...journey.significant_milestones] : [];
    milestones.push({
      text: milestone_text.trim(),
      date: new Date().toISOString().split('T')[0]
    });

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      significant_milestones: milestones,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'record_milestone',
      milestone: milestone_text.trim(),
      total_milestones: milestones.length,
      message: 'Milestone recorded. This is something the individual can look back on.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: record_referral
  // Records a handover to an external organisation.
  // Smudge decides when to refer. Engine records.
  // The partnership continues after referral — referral is not abandonment.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'record_referral') {
    const { organisation, reason } = body;

    if (!organisation || typeof organisation !== 'string' || organisation.trim().length === 0) {
      return Response.json({ error: 'organisation is required for a referral' }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return Response.json({ error: 'reason is required for a referral' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const referral = {
      organisation: organisation.trim(),
      reason: reason.trim(),
      date: new Date().toISOString().split('T')[0],
      status: 'PENDING'
    };

    const referrals = Array.isArray(journey.referral_history) ? [...journey.referral_history] : [];
    referrals.push(referral);

    // Material change — referral recorded
    const changeSummary = `Referral to ${organisation.trim()}`;
    await createCheckpoint(journey, changeSummary);

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      referral_history: referrals,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'record_referral',
      referral: referral,
      message: 'Referral recorded. The partnership continues — referral is not abandonment.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_confidence
  // Records a confidence band identified from conversation.
  // Behavioural, not numeric. Smudge identifies movement, not a score.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_confidence') {
    const { confidence_band, confidence_trend } = body;

    const validBands = ['LOW', 'BUILDING', 'STEADY', 'STRONG'];
    const validTrends = ['RISING', 'STABLE', 'FALLING', 'VOLATILE'];

    if (!validBands.includes(confidence_band)) {
      return Response.json({
        error: `Invalid confidence_band. Valid values: ${validBands.join(', ')}`,
        received: confidence_band
      }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const oldBand = journey.confidence_band;
    const updateFields: any = { confidence_band };

    if (confidence_trend && validTrends.includes(confidence_trend)) {
      updateFields.confidence_trend = confidence_trend;
    }

    // Material change if confidence band shifted
    if (oldBand !== confidence_band) {
      const changeSummary = `Confidence shift: ${oldBand || 'none'} → ${confidence_band}`;
      await createCheckpoint(journey, changeSummary);
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      ...updateFields,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_confidence',
      previous_band: oldBand,
      new_band: confidence_band,
      trend: updateFields.confidence_trend || journey.confidence_trend,
      message: 'Confidence band updated. This reflects what the individual expressed, not a calculated score.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_wellbeing
  // Records a wellbeing observation voluntarily shared by the individual.
  // Awareness state only. No diagnosis, no scoring, no clinical interpretation.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_wellbeing') {
    const { observation } = body;

    if (!observation || typeof observation !== 'string' || observation.trim().length === 0) {
      return Response.json({ error: 'observation is required' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const oldAwareness = journey.wellbeing_awareness?.awareness || 'NONE';

    const wellbeingUpdate = {
      observation: observation.trim(),
      date: new Date().toISOString().split('T')[0],
      awareness: 'NOTED'
    };

    // Material change if this is a new wellbeing concern
    if (oldAwareness !== 'NOTED') {
      const changeSummary = 'Wellbeing concern voluntarily shared';
      await createCheckpoint(journey, changeSummary);
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      wellbeing_awareness: wellbeingUpdate,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_wellbeing',
      awareness: 'NOTED',
      message: 'Wellbeing observation recorded. Smudge should be aware of this in conversation. No clinical interpretation has been made.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_partnership_state
  // Transitions the partnership lifecycle state machine.
  // Validates transitions. Invalid transitions are blocked.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_partnership_state') {
    const { new_state, reason } = body;

    const validStates = ['ACTIVE', 'MONITORING', 'SUPPORT_REQUIRED', 'REFERRAL', 'INDEPENDENT'];
    if (!validStates.includes(new_state)) {
      return Response.json({
        error: `Invalid partnership state. Valid values: ${validStates.join(', ')}`,
        received: new_state
      }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const currentState = journey.partnership_state;

    if (currentState === new_state) {
      return Response.json({
        success: true,
        action: 'update_partnership_state',
        message: `Partnership state is already ${currentState}. No transition needed.`
      });
    }

    if (!isValidTransition(currentState, new_state)) {
      return Response.json({
        error: `Invalid state transition: ${currentState} → ${new_state}. This transition is not allowed by the partnership lifecycle state machine.`,
        current_state: currentState,
        attempted_new_state: new_state,
        valid_transitions_from_current: VALID_TRANSITIONS[currentState]
      }, { status: 400 });
    }

    // Material change — state transition
    const changeSummary = `Partnership state transition: ${currentState} → ${new_state}`;
    await createCheckpoint(journey, changeSummary);

    const updateFields: any = {
      partnership_state: new_state,
      last_interaction_date: new Date().toISOString().split('T')[0]
    };

    // If moving to INDEPENDENT, this is the terminal state
    if (new_state === 'INDEPENDENT') {
      updateFields.journey_concluded_date = new Date().toISOString().split('T')[0];
      updateFields.conclusion_summary = reason || 'The individual has demonstrated sustained confidence, stability and self-direction.';

      // Update tos_phase to SETTLED
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        tos_phase: 'SETTLED'
      });
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, updateFields);

    return Response.json({
      success: true,
      action: 'update_partnership_state',
      previous_state: currentState,
      new_state: new_state,
      message: new_state === 'INDEPENDENT'
        ? 'Partnership concluded. The individual has reached independence. This is the success condition.'
        : new_state === 'MONITORING'
        ? 'Partnership moved to monitoring. Progress is stable — engagement frequency naturally reducing.'
        : new_state === 'SUPPORT_REQUIRED'
        ? 'Partnership moved to support required. Progress has stalled — additional guidance or referral may be appropriate.'
        : new_state === 'REFERRAL'
        ? 'Partnership moved to referral. Another organisation is better placed to assist. Smudge remains a continuity partner.'
        : 'Partnership state updated to ACTIVE.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_operational_readiness
  // Updates the engine's assessment of the current operational position.
  // Partnership language, not judgement.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_operational_readiness') {
    const { operational_readiness } = body;

    const validStates = ['ON_COURSE', 'ADAPTING', 'STALLED', 'NEEDS_SUPPORT'];
    if (!validStates.includes(operational_readiness)) {
      return Response.json({
        error: `Invalid operational_readiness. Valid values: ${validStates.join(', ')}`,
        received: operational_readiness
      }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      operational_readiness,
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_operational_readiness',
      operational_readiness,
      message: 'Operational readiness updated. This describes the current position, not a judgement of the individual.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: conclude_journey
  // Transitions the partnership to INDEPENDENT. Terminal state.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'conclude_journey') {
    const { summary } = body;

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    // Validate that current state allows transition to INDEPENDENT
    if (!isValidTransition(journey.partnership_state, 'INDEPENDENT')) {
      return Response.json({
        error: `Cannot conclude journey from state ${journey.partnership_state}. The individual must be in ACTIVE, MONITORING, SUPPORT_REQUIRED, or REFERRAL to conclude.`,
        current_state: journey.partnership_state
      }, { status: 400 });
    }

    // Material change — terminal transition
    const changeSummary = `Partnership concluded: ${journey.partnership_state} → INDEPENDENT`;
    await createCheckpoint(journey, changeSummary);

    const today = new Date().toISOString().split('T')[0];

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      partnership_state: 'INDEPENDENT',
      journey_concluded_date: today,
      conclusion_summary: summary || 'The individual has demonstrated sustained confidence, stability and self-direction. The partnership has succeeded.',
      last_interaction_date: today
    });

    // Update tos_phase to SETTLED
    await base44.asServiceRole.entities.UserProfile.update(profile_id, {
      tos_phase: 'SETTLED'
    });

    return Response.json({
      success: true,
      action: 'conclude_journey',
      journey_id: journey.id,
      partnership_state: 'INDEPENDENT',
      concluded_date: today,
      message: 'Partnership concluded. The individual no longer needs MATE. This is the success condition — the goal was independence, not dependence.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION: update_direction
  // Records a change in the individual's chosen direction.
  // Changing direction is evidence of learning, not failure.
  // ─────────────────────────────────────────────────────────────────────────
  if (action === 'update_direction') {
    const { new_direction } = body;

    if (!new_direction || typeof new_direction !== 'string' || new_direction.trim().length === 0) {
      return Response.json({ error: 'new_direction is required' }, { status: 400 });
    }

    const journey = await findActiveJourney(profile_id);
    if (!journey) {
      return Response.json({ error: 'No active journey found.' }, { status: 400 });
    }

    const oldDirection = journey.current_direction || '';

    // Material change — direction shift
    if (oldDirection !== new_direction.trim()) {
      const changeSummary = `Direction changed: ${oldDirection || 'none'} → ${new_direction.trim()}`;
      await createCheckpoint(journey, changeSummary);
    }

    const updatedJourney = await base44.asServiceRole.entities.TransitionJourney.update(journey.id, {
      current_direction: new_direction.trim(),
      last_interaction_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      action: 'update_direction',
      previous_direction: oldDirection,
      new_direction: new_direction.trim(),
      message: 'Direction updated. Changing direction is evidence of learning, not failure.'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UNKNOWN ACTION
  // ─────────────────────────────────────────────────────────────────────────
  return Response.json({
    error: `Unknown action: ${action}`,
    valid_actions: [
      'start_journey',
      'get_journey_status',
      'record_commitment',
      'update_commitment',
      'update_transition_status',
      'record_blocker',
      'resolve_blocker',
      'record_milestone',
      'record_referral',
      'update_confidence',
      'update_wellbeing',
      'update_partnership_state',
      'update_operational_readiness',
      'update_direction',
      'conclude_journey'
    ]
  }, { status: 400 });
});
