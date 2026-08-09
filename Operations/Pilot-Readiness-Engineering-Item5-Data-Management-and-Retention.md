# Pilot Readiness — Engineering Item 5: Data Management & Retention

**Operation:** PILOT READINESS  
**Item:** 5 — Data Management & Retention  
**Author:** Ash (Chief Engineer)  
**Date:** 9 August 2026  
**Status:** ✅ COMPLETE  

---

## Purpose

Define what data the GapMap MATE pilot stores, how long it is kept, how it can be accessed, exported, and deleted. Ensure the pilot is GDPR-compliant and that participants understand their data rights.

---

## Data Inventory

### User-Scoped Entities (RLS-Protected)

| Entity | What It Holds | Created When | Sensitive? |
|--------|--------------|--------------|------------|
| UserProfile | Service history, personal context, goals, confidence, capabilities, decision factors, action plan, safety flags | First MATE interaction | Yes — personal data |
| TransitionJourney | Current operational position, commitments, blockers, confidence, wellbeing awareness, milestones, referrals | Phase Five entry | Yes — personal circumstances |
| JourneyCheckpoint | Positional snapshots of journey state | On material change | Yes — journey history |

### Shared Reference Entities (Not User-Scoped)

| Entity | What It Holds | Created When | Sensitive? |
|--------|--------------|--------------|------------|
| OCIPathway | Curated civilian career pathways with provenance | Seeded during BUILD | No — reference data |

### Operational Entities (Not Part of MATE)

| Entity | What It Holds | Sensitive? |
|--------|--------------|------------|
| GapMapLead | CRM lead tracker | Yes — business data, separate from MATE |

---

## Data Lifecycle

### Stage 1: Creation

Data is created through engine writes during MATE interactions. No data is collected outside of the conversational MATE journey. Specifically:

- **UserProfile**: Created on first `get_state` call from the Understanding Engine. Populated progressively through conversation. Never pre-filled from external sources.
- **TransitionJourney**: Created when the Transition Partnership Engine receives `start_journey`. Not created for users who don't reach Phase Five.
- **JourneyCheckpoint**: Created only when the operational position materially changes. Not created on every interaction.

### Stage 2: Active Use

During the pilot, data is:
- **Read** by engines to assess state and make decisions
- **Written** by engines to persist conversational outcomes
- **Visible** to the participant through Smudge's conversational reflections (e.g., Operational Picture)
- **Never shared** with third parties
- **Never used** for analytics or metrics

### Stage 3: Retention

| Data Type | Retention Period | Rationale |
|-----------|-----------------|-----------|
| UserProfile (active pilot) | Duration of pilot + 30 days | Allows participant to return after a pause |
| TransitionJourney | Duration of pilot + 30 days | Same |
| JourneyCheckpoint | Duration of pilot + 30 days | Same |
| UserProfile (participant exits) | 30 days post-exit, then deleted | Gives participant time to request export |
| Data requested for export | Exported immediately on request | GDPR right to data portability |
| OCIPathway | Retained (shared reference, not personal data) | Not user-scoped |

### Stage 4: Deletion

Data is deleted using the `pilotAccountReset` function (Item 3). This clears:
- All JourneyCheckpoint records
- All TransitionJourney records
- UserProfile reset to initial state (all fields cleared, tos_phase = EXPLORING)

For full deletion (GDPR right to erasure), the UserProfile record itself must also be deleted. This requires admin-level entity deletion, which can be performed via the `delete_entities` tool.

---

## GDPR Compliance

### Right to be Informed

Participants will be informed about data collection through the Pilot Participant Pack (Paul's deliverable). The pack will include:
- What data MATE collects
- Why it collects it
- How long it is retained
- Who has access to it

### Right of Access

Participants can request a full export of their MATE data at any time. This includes:
- Full UserProfile record
- All TransitionJourney records
- All JourneyCheckpoint records

Export is performed by admin (Ash) using `read_entities` with the participant's profile_id. Data is provided in JSON format.

### Right to Rectification

Participants can correct their data through conversation with Smudge. The Operational Picture confirmation flow is the primary correction mechanism — if the picture is wrong, the user says so and Smudge revisits the relevant area.

For direct corrections (e.g., misspelled name), admin can update the UserProfile directly.

### Right to Erasure

Participants can request full deletion of their MATE data at any time. This is performed using:
1. `pilotAccountReset` to clear all MATE entity data
2. `delete_entities` to remove the UserProfile record itself

Once deleted, the data cannot be recovered. The participant's Base44 user account remains (platform-level, not managed by MATE).

### Right to Data Portability

Participants can request their data in a structured, machine-readable format (JSON). This is the same export as the Right of Access.

### Right to Object

Participants can object to continued data processing by exiting the pilot. On exit, their data enters the 30-day retention window before deletion.

---

## Data Access Control

### Who Can Access Participant Data

| Role | Access Level | What They Can See |
|------|-------------|-------------------|
| Participant | Own data only (RLS) | Full visibility of their own MATE journey |
| Admin (Ash) | All data (service role) | All profiles for support and maintenance |
| Paul (Product Owner) | All data (admin) | All profiles for oversight |
| Cipher (Doctrine) | No direct access | Reviews doctrine, not user data |
| Third parties | No access | Data is never shared externally |

### Logging of Admin Access

Admin access to participant data is not currently logged. For the pilot, this is acceptable — the pilot cohort is small and access is limited to Ash and Paul. For post-pilot production, admin access logging should be implemented.

---

## Data Export Procedure

To export a participant's data:

1. Identify the participant's profile_id
2. Read the full UserProfile record: `read_entities(entity_name="UserProfile", query={"id": profile_id})`
3. Read all TransitionJourney records: `read_entities(entity_name="TransitionJourney", query={"user_profile_id": profile_id})`
4. Read all JourneyCheckpoint records: `read_entities(entity_name="JourneyCheckpoint", query={"user_profile_id": profile_id})`
5. Compile into a single JSON document
6. Provide to the participant

---

## Data Deletion Procedure

To delete a participant's data (full erasure):

1. Call `pilotAccountReset` with the participant's profile_id — this clears all MATE entity data and resets the profile
2. Delete the UserProfile record: `delete_entities(entity_name="UserProfile", query={"id": profile_id})`
3. Confirm deletion by verifying no records remain for that profile_id

---

## Sign-off

This document defines the data management and retention strategy for the GapMap MATE pilot. The approach is GDPR-compliant, participant-centric, and lightweight. Data is collected only through MATE conversations, retained for the pilot duration plus 30 days, and fully deletable on request.

**Item 5 Status: ✅ COMPLETE**
