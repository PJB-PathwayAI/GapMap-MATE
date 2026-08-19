import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  try {
    const base44 = createClientFromRequest(req);
    const profile = await base44.entities.UserProfile.create({
      full_name: "2C Test Profile",
      tos_phase: "EXPLORING",
      operational_picture_confirmed: false,
      operational_picture_version: 0,
      service_branch: "",
      rank: "",
      years_served: null,
      professional_identity: "",
      service_history: "[]",
      personal_context: "",
      goals: "[]",
      operational_context: "[]",
      user_confidence: null,
      assessment_confidence: "",
      evidence_log: "[]",
      capability_map: "[]",
      confidence_scores: "[]",
      decision_factors: "{}",
      recommended_pathways: "[]",
      safety_flags: "[]",
      soak_period: '{"state": "NOT_STARTED"}',
      operational_picture_history: "[]",
      milestones: "[]",
      communication_preferences: "{}",
      action_plan: ""
    });
    return new Response(JSON.stringify({ profile_id: profile.id, created: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
