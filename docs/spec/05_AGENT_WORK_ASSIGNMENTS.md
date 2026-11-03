# 05 – AGENT WORK ASSIGNMENTS

## Agent 0 – Lead Architect / Project Manager
Owns:
- Repository structure and architecture decisions.
- Coding conventions and shared types policy.
- API contract governance.
- Module ownership and dependency graph.
- Pull request review and integration.
- ADR records.
Deliver:
- `SYSTEM_ARCHITECTURE.md`
- `MODULE_OWNERSHIP.md`
- `DECISIONS/ADR-*.md`
- sprint plan and integration checklist.
Must not implement every module personally.

## Agent 1 – Frontend / UX
Owns:
- Next.js app shell, navigation and responsive design.
- Dashboard, forms, tables, filters and detail pages.
- Animal profile, breeding, health, incident screens.
- Sync status and offline UX.
- AI chat UI.
Deliver:
- reusable components
- typed API integration
- loading/empty/error states
- accessibility basics
- frontend tests.
Must not invent API shapes; use shared contracts.

## Agent 2 – Backend / API
Owns:
- NestJS modules and REST endpoints.
- Authentication and authorization integration.
- Domain transactions and validation.
- Audit event creation.
- Search and AI backend interfaces.
Deliver:
- API implementation
- OpenAPI specification
- integration tests
- error conventions.
Must not bypass Agent 3 schema review.

## Agent 3 – Database Engineer
Owns:
- ERD and Prisma schema.
- Migrations, constraints and indexes.
- Seed/test data.
- Data integrity and query performance.
Deliver:
- ERD source
- Prisma schema
- migration scripts
- database test suite.
Must review all schema changes.

## Agent 4 – 2D Map Editor
Owns:
- Konva canvas, pan/zoom, grid/free mode.
- Blocks, selection, grouping, layers.
- Drag/drop, resize, rotate, undo/redo.
- Revision-based save/restore.
- Import/export and recognition review UI.
Deliver:
- reusable map editor
- map document schema
- editor tests
- sample import/export fixtures.
Must keep map geometry separate from pen occupancy and animal identity.

## Agent 5 – Animal / Breeding
Owns:
- Animal CRUD and unique animal codes.
- Lifecycle timeline.
- Pen assignment and transfer workflows (coordinate with Agent 2).
- Weights.
- Litters, birth records, separation.
- Pedigree and relatedness checks.
Deliver:
- domain services and screens/API integration
- validation rules
- test cases for lifecycle and breeding.
Must not infer unknown parentage or birth dates.

## Agent 6 – Health / Medicine / Incidents
Owns:
- Health records, symptom catalog and diagnoses.
- Medicine reference library (not inventory).
- Treatment history and follow-ups.
- OFF_FEED and DEATH incident workflows.
- Safety labels and source references.
Deliver:
- health/incident workflows
- validation and audit tests
- veterinary-source metadata.
Must not build stock, batch, expiry or inventory features. No autonomous dosing advice.

## Agent 7 – AI / Search
Owns:
- Vietnamese normalization and unaccented search.
- Fuzzy and synonym search.
- Optional semantic retrieval.
- RAG ingestion and source citations.
- Chat orchestration and allowlisted tools.
Deliver:
- search relevance tests
- retrieval evaluation set
- source-linked responses
- permission-aware retrieval.
Must not use arbitrary SQL or fabricate records/medical guidance.

## Agent 8 – Offline / QA / Security
Owns:
- PWA and local data layer coordination.
- Dexie schema and outbox queue.
- Push/pull sync, retry and idempotency.
- Conflict detection and resolution UX.
- Offline attachment strategy.
- E2E, security and restore tests.
Deliver:
- sync protocol implementation
- offline test matrix
- conflict test cases
- security test report.
Must coordinate shared event format with Agents 2 and 3.

## Dependency order
Sprint 0: Agent 0 architecture and contracts.
Sprint 1: Agent 3 schema + Agent 2 API foundation.
Sprint 2: Agent 1 app shell + Agent 8 offline foundation.
Sprint 3: Agent 4 map editor.
Sprint 4: Agent 5 animal and breeding.
Sprint 5: Agent 6 health and incidents.
Sprint 6: Agent 7 search and AI.
Sprint 7: Agent 8 full QA + Agent 0 integration acceptance.

Parallel work is allowed only after contracts are approved.
