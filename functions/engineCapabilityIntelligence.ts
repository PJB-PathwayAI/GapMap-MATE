import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Capability Intelligence Engine — Phase Three (Operation PROOF)
 * Design Intent v1.0 — 5 July 2026
 *
 * Doctrine traceability:
 * - Phase Three Design Intent §1: "Translate confirmed Operational Picture into
 *   evidence-backed Capability Picture"
 * - Phase Three Design Intent §2: "Reveal capability. Never invent it."
 * - Phase Three Design Intent §6: "Every capability must be supported by evidence"
 * - Phase Three Design Intent §7: "Capability Confidence is separate from Assessment Confidence"
 * - Artefact 5 (Capability Interpretation Engine): capability translation doctrine
 * - Architecture v1.0 §5: Capability Intelligence Engine writes capability_map,
 *   confidence_scores, evidence_log onto UserProfile
 *
 * Engine responsibilities (deterministic, testable):
 *   1. Validate preconditions (Operational Picture confirmed, Assessment Confidence sufficient)
 *   2. Enforce the Evidence Rule — every capability MUST reference evidence_log entries
 *   3. Calculate Capability Confidence per capability (evidence-based, not optimism-based)
 *   4. Persist results to UserProfile (capability_map, confidence_scores)
 *   5. Generate structured Capability Picture for Smudge to present
 *   6. Gate phase advancement: Understand → Evaluate
 *
 * What this engine does NOT do:
 *   - Identify capabilities from free text (that's Smudge/the LLM layer)
 *   - Translate military roles to civilian terms (Smudge handles translation)
 *   - Recommend careers, learning, or pathways (Phase Four)
 *   - Generate conversational responses
 *   - Make assumptions about capability based on rank/branch
 *
 * Evidence Rule (hard gate):
 *   If a capability submission does not include at least one valid evidence_ref
 *   pointing to an entry in evidence_log, the capability is REJECTED.
 *   "If evidence cannot be identified: The capability cannot be created." (§6)
 */

// ─── Types ───

interface CapabilitySubmission {
  capability_name: string;
  civilian_translation: string;
  evidence_refs: string[];      // evidence_id values from evidence_log
  transferability_notes: string;
}

interface CapabilityResult {
  capability_name: string;
  civilian_translation: string;
  evidence_refs: string[];
  evidence_summary: string[];   // human-readable evidence descriptions
  confidence_score: number;     // 0-100
  confidence_rating: string;    // LOW / MODERATE / HIGH
  transferability_notes: string;
}

// ─── Confidence Calculation ───
// Capability Confidence asks: "How confident are we that this capability is evidenced?"
// This is INDEPENDENT of Assessment Confidence (§7).
// Score is driven by evidence quantity, diversity, and specificity — never by optimism.

function calculateCapabilityConfidence(
  evidenceRefs: string[],
  evidenceLog: any[]
): { score: number; rating: string } {
  // Find the actual evidence entries referenced
  const referenced = evidenceLog.filter(e =>
    evidenceRefs.includes(e.evidence_id)
  );

  if (referenced.length === 0) {
    return { score: 0, rating: 'LOW' };
  }

  let score = 40; // Base: one piece of evidence = 40 (above LOW threshold)

  // +15 for each additional evidence reference (max 3 additional = +45)
  const additional = Math.min(referenced.length - 1, 3);
  score += additional * 15;

  // +10 if evidence includes specific content (not just vague references)
  const hasSpecificContent = referenced.some(e =>
    e.content && e.content.length > 30
  );
  if (hasSpecificContent) score += 10;

  // +10 if evidence comes from multiple source types (diversity = stronger evidence)
  const sourceTypes = new Set(referenced.map(e => e.source_type));
  if (sourceTypes.size > 1) score += 10;

  score = Math.min(100, score);

  let rating: string;
  if (score < 41) rating = 'LOW';
  else if (score < 71) rating = 'MODERATE';
  else rating = 'HIGH';

  return { score, rating };
}

// ─── Evidence Auto-Seeding ───
// If evidence_log is empty, create entries from existing structured profile data.
// Service history IS evidence (§6). This ensures provenance exists even when
// the evidence_log wasn't explicitly populated during discovery.

function seedEvidenceFromProfile(profile: any): any[] {
  const entries: any[] = [];
  let counter = 1;

  const makeId = () => `EV-${String(counter++).padStart(3, '0')}`;
  const today = new Date().toISOString().split('T')[0];

  // Seed from service history
  if (profile.service_history && profile.service_history.length > 0) {
    for (const role of profile.service_history) {
      const parts: string[] = [];
      if (role.role) parts.push(`Role: ${role.role}`);
      if (role.responsibilities) parts.push(`Responsibilities: ${role.responsibilities}`);
      if (role.achievements) parts.push(`Achievements: ${role.achievements}`);
      if (role.leadership_scope) parts.push(`Leadership: ${role.leadership_scope}`);
      if (role.decision_making) parts.push(`Decision-making: ${role.decision_making}`);
      if (role.deployment) parts.push(`Deployment: ${role.deployment}`);

      if (parts.length > 0) {
        entries.push({
          evidence_id: makeId(),
          source_type: 'service_history',
          source_reference: `${role.role || 'Military role'} (${role.start_date || ''}-${role.end_date || 'present'})`,
          content: parts.join('. '),
          recorded_date: today
        });
      }
    }
  }

  // Seed from professional identity
  if (profile.professional_identity && profile.professional_identity.length > 15) {
    entries.push({
      evidence_id: makeId(),
      source_type: 'conversation',
      source_reference: 'Discovery conversation — professional identity',
      content: profile.professional_identity,
      recorded_date: today
    });
  }

  // Seed from personal context
  if (profile.personal_context && profile.personal_context.length > 15) {
    entries.push({
      evidence_id: makeId(),
      source_type: 'user_statement',
      source_reference: 'Discovery conversation — personal context',
      content: profile.personal_context,
      recorded_date: today
    });
  }

  // Seed from operational context
  if (profile.operational_context && profile.operational_context.length > 0) {
    for (const ctx of profile.operational_context) {
      if (ctx.description && ctx.description.length > 10) {
        entries.push({
          evidence_id: makeId(),
          source_type: 'user_statement',
          source_reference: `Discovery conversation — ${ctx.factor || 'operational context'}`,
          content: ctx.description,
          recorded_date: today
        });
      }
    }
  }

  // Seed from goals
  if (profile.goals && profile.goals.length > 0) {
    entries.push({
      evidence_id: makeId(),
      source_type: 'user_statement',
      source_reference: 'Discovery conversation — goals and aspirations',
      content: profile.goals.join('. '),
      recorded_date: today
    });
  }

  return entries;
}

// ─── Preconditions Validation ───
// "The engine may only operate once:
//  Operational Picture confirmed, Assessment Confidence sufficient,
//  UserProfile validated, Evidence Log available" (§4)

interface PreconditionResult {
  met: boolean;
  failures: string[];
  details: {
    operational_picture_confirmed: boolean;
    assessment_confidence_sufficient: boolean;
    profile_validated: boolean;
    evidence_log_available: boolean;
  };
}

function validatePreconditions(profile: any): PreconditionResult {
  const failures: string[] = [];

  const opConfirmed = profile.operational_picture_confirmed === true;
  if (!opConfirmed) failures.push('Operational Picture not confirmed');

  const assessmentRating = profile.assessment_confidence?.rating;
  const assessmentSufficient = assessmentRating === 'HIGH' || assessmentRating === 'MODERATE';
  if (!assessmentSufficient) failures.push(`Assessment Confidence insufficient (current: ${assessmentRating || 'none'})`);

  const profileValidated = !!profile.service_branch && !!profile.service_history?.length;
  if (!profileValidated) failures.push('UserProfile not validated (missing branch or service history)');

  const evidenceAvailable = (profile.evidence_log?.length ?? 0) > 0;
  if (!evidenceAvailable) failures.push('Evidence Log not available (empty or missing)');

  return {
    met: failures.length === 0,
    failures,
    details: {
      operational_picture_confirmed: opConfirmed,
      assessment_confidence_sufficient: assessmentSufficient,
      profile_validated: profileValidated,
      evidence_log_available: evidenceAvailable
    }
  };
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
      action,
      profile_id,
      capabilities,        // CapabilitySubmission[] for submit_capabilities
      advance_phase         // boolean: transition tos_phase to "Evaluate"
    } = body;

    if (!profile_id) {
      return Response.json({ error: "Missing profile_id" }, { status: 400 });
    }

    if (!action) {
      return Response.json({ error: "Missing action. Valid actions: validate_preconditions, seed_evidence, submit_capabilities, get_capability_picture, advance_phase" }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.UserProfile.get(profile_id);
    if (!existing) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    // ─── ACTION: validate_preconditions ───
    if (action === 'validate_preconditions') {
      const preconditions = validatePreconditions(existing);
      return Response.json({
        preconditions,
        profile_phase: existing.tos_phase,
        message: preconditions.met
          ? 'All preconditions met. Capability evaluation may proceed.'
          : `Preconditions not met: ${preconditions.failures.join('; ')}`
      });
    }

    // ─── ACTION: seed_evidence ───
    // Auto-create evidence_log entries from existing profile data
    if (action === 'seed_evidence') {
      const currentLog = existing.evidence_log || [];
      if (currentLog.length > 0) {
        return Response.json({
          message: 'Evidence log already populated. Seeding skipped.',
          evidence_log: currentLog,
          evidence_count: currentLog.length
        });
      }

      const seeded = seedEvidenceFromProfile(existing);
      if (seeded.length === 0) {
        return Response.json({
          message: 'No evidence could be seeded from profile data. Profile may lack substantive content.',
          evidence_log: [],
          evidence_count: 0
        });
      }

      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        evidence_log: seeded
      });

      return Response.json({
        message: `Evidence log seeded with ${seeded.length} entries from profile data.`,
        evidence_log: seeded,
        evidence_count: seeded.length
      });
    }

    // ─── For all remaining actions, preconditions must be met ───
    const preconditions = validatePreconditions(existing);
    if (!preconditions.met) {
      return Response.json({
        error: 'Preconditions not met. Capability evaluation cannot proceed.',
        preconditions,
        message: `Resolve: ${preconditions.failures.join('; ')}`
      }, { status: 403 });
    }

    const evidenceLog = existing.evidence_log || [];

    // ─── ACTION: submit_capabilities ───
    // Smudge submits identified capabilities with evidence references.
    // Engine validates evidence rule, calculates confidence, persists.
    if (action === 'submit_capabilities') {
      if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
        return Response.json({ error: "Missing or empty capabilities array" }, { status: 400 });
      }

      const accepted: CapabilityResult[] = [];
      const rejected: { capability_name: string; reason: string }[] = [];

      for (const cap of capabilities as CapabilitySubmission[]) {
        // Validate required fields
        if (!cap.capability_name || !cap.civilian_translation) {
          rejected.push({
            capability_name: cap.capability_name || '(unnamed)',
            reason: 'Missing capability_name or civilian_translation'
          });
          continue;
        }

        // ─── THE EVIDENCE RULE (hard gate) ───
        // "If evidence cannot be identified: The capability cannot be created." (§6)
        if (!cap.evidence_refs || cap.evidence_refs.length === 0) {
          rejected.push({
            capability_name: cap.capability_name,
            reason: 'No evidence references provided. Capabilities without evidence are rejected.'
          });
          continue;
        }

        // Validate that evidence_refs point to real entries
        const validRefs = cap.evidence_refs.filter(refId =>
          evidenceLog.some(e => e.evidence_id === refId)
        );

        if (validRefs.length === 0) {
          rejected.push({
            capability_name: cap.capability_name,
            reason: `Evidence references not found in evidence_log: ${cap.evidence_refs.join(', ')}`
          });
          continue;
        }

        // Calculate capability confidence
        const { score, rating } = calculateCapabilityConfidence(validRefs, evidenceLog);

        // Build evidence summary (human-readable)
        const evidenceSummary = validRefs.map(refId => {
          const entry = evidenceLog.find(e => e.evidence_id === refId);
          return entry
            ? `[${entry.source_type}] ${entry.source_reference}: ${entry.content}`
            : `Unknown evidence ref: ${refId}`;
        });

        accepted.push({
          capability_name: cap.capability_name,
          civilian_translation: cap.civilian_translation,
          evidence_refs: validRefs,
          evidence_summary: evidenceSummary,
          confidence_score: score,
          confidence_rating: rating,
          transferability_notes: cap.transferability_notes || ''
        });
      }

      if (accepted.length === 0) {
        return Response.json({
          error: 'All capabilities rejected. No capabilities persisted.',
          rejected,
          accepted: []
        }, { status: 422 });
      }

      // Persist to UserProfile
      const capabilityMap = accepted.map(c => ({
        skill: c.capability_name,
        civilian_equivalent: c.civilian_translation,
        evidence: c.evidence_summary.join(' | '),
        evidence_ref: c.evidence_refs.join(','),
        score: c.confidence_score
      }));

      const confidenceScores = accepted.map(c => ({
        skill: c.capability_name,
        confidence: c.confidence_score,
        evidence_refs: c.evidence_refs.join(','),
        evidence_ref: c.evidence_refs[0] // primary evidence
      }));

      // Merge with any existing capabilities (allow incremental submissions)
      const existingCapMap = existing.capability_map || [];
      const existingConfidence = existing.confidence_scores || [];

      // Remove duplicates (same capability_name) — replace with new version
      const mergedCapMap = [
        ...existingCapMap.filter(c => !accepted.some(a => a.capability_name === c.skill)),
        ...capabilityMap
      ];

      const mergedConfidence = [
        ...existingConfidence.filter(c => !accepted.some(a => a.capability_name === c.skill)),
        ...confidenceScores
      ];

      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        capability_map: mergedCapMap,
        confidence_scores: mergedConfidence,
        tos_phase: 'Evaluate'
      });

      return Response.json({
        message: `${accepted.length} capability(ies) accepted and persisted. ${rejected.length} rejected.`,
        accepted,
        rejected,
        capability_picture: buildCapabilityPicture(accepted, existing),
        profile_phase: 'Evaluate'
      });
    }

    // ─── ACTION: get_capability_picture ───
    if (action === 'get_capability_picture') {
      const capMap = existing.capability_map || [];
      const confScores = existing.confidence_scores || [];

      if (capMap.length === 0) {
        return Response.json({
          capability_picture: null,
          message: 'No capabilities have been evaluated yet.'
        });
      }

      // Reconstruct Capability Picture from stored data
      const capabilities: CapabilityResult[] = capMap.map((cap: any) => {
        const refs = cap.evidence_ref ? cap.evidence_ref.split(',') : [];
        const conf = confScores.find((c: any) => c.skill === cap.skill);
        const score = conf?.confidence || cap.score || 0;
        const rating = score < 41 ? 'LOW' : score < 71 ? 'MODERATE' : 'HIGH';

        const evidenceSummary = refs.map((refId: string) => {
          const entry = evidenceLog.find(e => e.evidence_id === refId);
          return entry
            ? `[${entry.source_type}] ${entry.source_reference}: ${entry.content}`
            : `Evidence ref: ${refId}`;
        });

        return {
          capability_name: cap.skill,
          civilian_translation: cap.civilian_equivalent,
          evidence_refs: refs,
          evidence_summary: evidenceSummary,
          confidence_score: score,
          confidence_rating: rating,
          transferability_notes: cap.evidence || ''
        };
      });

      return Response.json({
        capability_picture: buildCapabilityPicture(capabilities, existing),
        profile_phase: existing.tos_phase
      });
    }

    // ─── ACTION: advance_phase ───
    if (action === 'advance_phase') {
      const capMap = existing.capability_map || [];
      if (capMap.length === 0) {
        return Response.json({
          error: 'Cannot advance to Evaluate — no capabilities have been evaluated yet.'
        }, { status: 422 });
      }

      if (existing.tos_phase === 'Evaluate') {
        return Response.json({
          message: 'Already in Evaluate phase.',
          profile_phase: 'Evaluate'
        });
      }

      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        tos_phase: 'Evaluate'
      });

      return Response.json({
        message: 'Phase advanced to Evaluate.',
        profile_phase: 'Evaluate',
        capability_count: capMap.length
      });
    }

    return Response.json({
      error: `Unknown action: ${action}. Valid actions: validate_preconditions, seed_evidence, submit_capabilities, get_capability_picture, advance_phase`
    }, { status: 400 });

  } catch (error) {
    console.error('Capability Intelligence Engine error:', error);
    return Response.json({
      error: 'Engine error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
});

// ─── Capability Picture Builder ───
// Generates the structured Capability Picture for Smudge to present.
// "The Capability Picture should feel like discovery." (§9)

function buildCapabilityPicture(capabilities: CapabilityResult[], profile: any) {
  const high = capabilities.filter(c => c.confidence_rating === 'HIGH').length;
  const moderate = capabilities.filter(c => c.confidence_rating === 'MODERATE').length;
  const low = capabilities.filter(c => c.confidence_rating === 'LOW').length;

  // Sort by confidence (highest first) — strongest evidence leads
  const sorted = [...capabilities].sort((a, b) => b.confidence_score - a.confidence_score);

  return {
    generated: true,
    profile_name: profile.full_name || 'Unknown',
    total_capabilities: capabilities.length,
    confidence_summary: {
      high,
      moderate,
      low
    },
    capabilities: sorted,
    ready_for_phase_four: capabilities.length > 0 && low === 0,
    // Behavioural guidance for Smudge (from Design Intent §10)
    presentation_guidance: {
      tone: 'observation not judgement',
      approach: 'invite recognition, never impose identity',
      example_phrasing: '"From everything we\'ve explored together, one capability keeps appearing."',
      avoid: '["You are definitely a leader", "You should consider...", "This means you could..."]',
      success_indicator: 'User responds with something similar to "I\'d never thought about it like that."'
    },
    // Explainability requirement (§11)
    explainability: 'Every capability includes evidence_summary showing exactly how it was identified. Present this evidence when the user asks "why do you think that?"'
  };
}
