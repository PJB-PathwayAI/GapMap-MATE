# OCI Pathway Provenance Standard — v1.0
# Operation PROOF, GapMap MATE
# Established: 13 July 2026 — Paul & Cipher
# Status: ACTIVE — baseline standard for all OCI Pathway records

## Purpose

Every OCI Pathway must have transparent, reviewable provenance consistent with
Operation PROOF and the explainability principles established in Phase Three.

This is not an academic citation system. It is a minimum standard for traceability
and review confidence.

## Required Fields (per provenance_reference entry)

| Field         | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| title         | Title of the source document or page                                        |
| organisation  | Publishing or owning organisation                                           |
| source_type   | e.g. Qualification framework, Occupational standard, Sector guidance,       |
|               | Workforce data, Regulatory framework, Recruitment guidance                  |
| url           | Reference URL where available                                               |
| retrieved_date| Date this source was accessed or reviewed (YYYY-MM-DD)                      |
| reviewer      | Who reviewed this source (e.g. "Ash / Operation PROOF")                     |
| review_status | current | needs_review | superseded                                       |

## Minimum Provenance per Pathway

- At least two provenance_reference entries per pathway.
- At least one entry must be a Qualification framework, Occupational standard,
  or Regulatory framework — not only workforce or sector data.
- All entries must have review_status set.

## Review Cadence

OCI Pathway records should be reviewed against their provenance sources annually,
or when sector conditions change materially (e.g. new qualification frameworks,
significant regulatory changes).

Set review_status = needs_review to flag a source requiring re-check.
Set review_status = superseded when a source has been replaced by a newer version.

## Seed Library Status (13 July 2026)

All 8 initial pathways have been updated to the v1.0 provenance standard.

| Pathway                                    | Sources | review_status |
|--------------------------------------------|---------|---------------|
| Physical Security & Close Protection        | 3       | current       |
| Operations & Logistics Supervision          | 3       | current       |
| Emergency Services — Police, Fire, Ambulance| 3       | current       |
| Facilities & Infrastructure Management      | 2       | current       |
| Youth Work, Mentoring & Community Support   | 2       | current       |
| Training, Instruction & Learning Delivery   | 2       | current       |
| Outdoor Education & Expedition Leadership   | 2       | current       |
| Construction Trades & Site Supervision      | 2       | current       |
