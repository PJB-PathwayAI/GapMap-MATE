import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Profile Bootstrap — Operation PILOT READINESS (Packet 1: S-001)
 *
 * Purpose: Ensure every authenticated MATE user has exactly one correctly owned UserProfile.
 *
 * Called by: Dashboard on authenticated entry
 * Returns:  { profile_id, created: boolean }
 *
 * Behaviour:
 *   1. User-scoped list (RLS-enforced) — finds existing profile if present
 *   2. If profile exists: returns profile_id (idempotent — safe to call repeatedly)
 *   3. If no profile: creates one with default EXPLORING state
 *
 * Security:
 *   Uses user-scoped client throughout. No service-role operations.
 *   RLS ensures the user can only see and create their own profile.
 *   One profile per user is enforced by the list-then-create pattern.
 *
 * Doctrine traceability:
 *   - S-001: UserProfile Bootstrap
 *   - S-004: Profile Ownership (this function establishes ownership; engines validate it)
 */

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

    // Step 1: Check for existing profile (user-scoped, RLS-enforced)
    // Using positional args: list(sort, limit) — matches Dashboard's calling convention
    const existing = await base44.entities.UserProfile.list("-created_date", 1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        profile_id: existing[0].id,
        created: false,
        message: "Existing profile found"
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Step 2: No profile exists — create one with default EXPLORING state
    // Default values match pilotAccountReset reset state for consistency
    const newProfile = await base44.entities.UserProfile.create({
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
      tos_phase: "EXPLORING"
    });

    return new Response(JSON.stringify({
      profile_id: newProfile.id,
      created: true,
      message: "New profile created"
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
