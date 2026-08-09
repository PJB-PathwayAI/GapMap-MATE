import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Pilot Account Reset — Operation PILOT READINESS
 * 
 * Purpose: Reset a user's MATE data to initial state for pilot testing.
 * This is an operational tool, NOT part of the MVP Core.
 * 
 * What it does:
 *   1. Deletes all JourneyCheckpoint records for the user
 *   2. Deletes all TransitionJourney records for the user
 *   3. Resets UserProfile to initial state (EXPLORING, all fields cleared)
 *   4. Returns a confirmation summary
 * 
 * What it does NOT do:
 *   - Delete the user account itself (that's a platform-level operation)
 *   - Delete OCIPathway records (those are shared reference data)
 *   - Delete GapMapLead records (separate CRM entity)
 * 
 * Usage:
 *   POST /api/functions/pilotAccountReset
 *   Body: { "profile_id": "<UserProfile ID>" }
 *   
 *   Or with user_id to find profile:
 *   Body: { "user_id": "<Base44 User ID>" }
 */

export default async function(req: any) {
  const base44 = createClientFromRequest(req);
  const admin = base44.asServiceRole;
  
  const { profile_id, user_id } = req.body || {};
  
  if (!profile_id && !user_id) {
    return { status: 400, error: "Either profile_id or user_id is required" };
  }
  
  // Resolve profile_id from user_id if needed
  let resolvedProfileId = profile_id;
  let profile;
  
  try {
    if (resolvedProfileId) {
      profile = await admin.entities.UserProfile.list({
        filter: { id: resolvedProfileId }
      });
    } else {
      profile = await admin.entities.UserProfile.list({
        filter: { created_by: user_id }
      });
    }
    
    if (!profile || profile.length === 0) {
      return { status: 404, error: "No UserProfile found for the given identifier" };
    }
    
    resolvedProfileId = profile[0].id;
  } catch (err: any) {
    return { status: 500, error: `Failed to resolve profile: ${err.message}` };
  }
  
  const results = {
    profile_id: resolvedProfileId,
    checkpoints_deleted: 0,
    journeys_deleted: 0,
    profile_reset: false,
    errors: [] as string[]
  };
  
  // 1. Delete JourneyCheckpoint records
  try {
    const checkpoints = await admin.entities.JourneyCheckpoint.list({
      filter: { user_profile_id: resolvedProfileId }
    });
    
    for (const cp of checkpoints) {
      await admin.entities.JourneyCheckpoint.delete(cp.id);
      results.checkpoints_deleted++;
    }
  } catch (err: any) {
    results.errors.push(`JourneyCheckpoint cleanup: ${err.message}`);
  }
  
  // 2. Delete TransitionJourney records
  try {
    const journeys = await admin.entities.TransitionJourney.list({
      filter: { user_profile_id: resolvedProfileId }
    });
    
    for (const j of journeys) {
      await admin.entities.TransitionJourney.delete(j.id);
      results.journeys_deleted++;
    }
  } catch (err: any) {
    results.errors.push(`TransitionJourney cleanup: ${err.message}`);
  }
  
  // 3. Reset UserProfile to initial state
  try {
    await admin.entities.UserProfile.update(resolvedProfileId, {
      tos_phase: "EXPLORING",
      full_name: "",
      rank: "",
      service_branch: "",
      years_served: null,
      professional_identity: "",
      personal_context: "",
      goals: "[]",
      operational_context: "[]",
      service_history: "[]",
      evidence_log: "[]",
      capability_map: "[]",
      confidence_scores: "[]",
      assessment_confidence: null,
      user_confidence: null,
      operational_picture_confirmed: false,
      operational_picture_version: 0,
      operational_picture_history: "[]",
      recommended_pathways: "[]",
      decision_factors: "{}",
      soak_period: '{"state": "NOT_STARTED"}',
      milestones: "[]",
      safety_flags: "[]",
      action_plan: "",
      communication_preferences: "{}",
      last_contact_date: null,
      next_action: "",
      next_action_date: null
    });
    results.profile_reset = true;
  } catch (err: any) {
    results.errors.push(`UserProfile reset: ${err.message}`);
  }
  
  return {
    status: 200,
    message: "Account reset complete",
    ...results
  };
}
