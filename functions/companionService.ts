import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { companionCore, deserializeProfile, COMPANION_CORE_VERSION } from '../shared/companionCore.ts';

// ============================================================
// companionService — Thin Wrapper (R1-C.1B-E1)
//
// Trust boundary only:
//   1. Authenticated request
//   2. Profile fetch (service-role, profile_id from request)
//   3. Domain processing delegated to companionCore (shared)
//   4. Persistence via narrow capability callback
//   5. Response construction
//
// All business logic lives in base44/shared/companionCore.ts
// External input/output contract UNCHANGED from v1.2.
// ============================================================

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
      user_response_type = 'answering',
    } = body;

    if (!profile_id) {
      return Response.json({ error: "Missing profile_id" }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    deserializeProfile(profile);

    // ─── Domain processing delegated to shared companionCore ───
    const result = await companionCore({
      profile,
      currentMode: current_mode,
      newDiscoveries: new_discoveries,
      userResponseType: user_response_type,
      persist: (id: string, payload: any) => base44.asServiceRole.entities.UserProfile.update(id, payload),
    });

    // ─── Response (contract unchanged) ───
    return new Response(JSON.stringify({
      session: result.session,
      flow_guidance: result.guidance,
      profile: result.mergedProfile,
      ...(result.engineResult ? { engine_result: result.engineResult } : {}),
      companion_core_version: result.companionCoreVersion,
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
