# GOOGLE ANTIGRAVITY – MASTER WORKSPACE INSTRUCTIONS

Act as the engineering lead for the Farm Management Web App. Use the current workspace as the source of truth.

## Read project specifications
Read every Markdown file in this agent pack, especially product requirements, architecture, database, API, agent assignments, offline sync and acceptance tests.

## Project scope
Build a bamboo rat farm management PWA for 50–200 individually identified animals.

Approved modules:
- Dashboard
- Farm Map 2D
- Pen management
- Individual animal records
- Lifecycle and pen history
- Weight tracking
- Breeding, birth, litter separation and pedigree
- Health and treatment records
- Medicine reference library (not stock)
- Only two incident types: OFF_FEED and DEATH
- Vietnamese intelligent search
- AI Farm Assistant with source-grounded retrieval
- RBAC, audit logs, offline storage and sync

Explicitly excluded:
- feed/feeding management
- inventory/supplies
- medicine stock and inventory
- pen damage/maintenance
- feed/environment changes
- electricity/water incidents
- finance and sales

## Safe workspace workflow
1. Inspect repository structure, package manager, existing code and git status.
2. Do not overwrite, delete or reformat unrelated files.
3. Create a plan before implementation.
4. Identify dependencies and file ownership.
5. Implement one milestone at a time.
6. Use terminal/browser tools only when needed and permitted.
7. Run tests, lint and typecheck; report exact outputs.
8. Keep changes reviewable and provide a concise diff summary.
9. Ask before destructive operations, schema resets, deployment or paid API setup.

## Architecture constraints
- Next.js + TypeScript frontend.
- NestJS Modular Monolith backend.
- PostgreSQL + Prisma.
- IndexedDB/Dexie offline storage.
- PWA Service Worker.
- Konva.js 2D editor.
- Search using PostgreSQL full-text/pg_trgm; pgvector optional.
- AI via provider adapter and backend allowlisted tools.
- Docker deployment.

Do not introduce microservices without a documented reason and owner approval.

## Core invariants
- Animal UUID and animal_code identify the animal, not its location.
- Pen ID identifies a real pen.
- Map block geometry is a separate presentation model.
- A map move does not move animals.
- An animal transfer updates pen assignment history.
- One active pen assignment per animal at a time.
- No hard deletion of historical animal/health/breeding/treatment records.
- Death workflow must transactionally set DECEASED and close active pen assignment.
- Only OFF_FEED and DEATH incident types are allowed.
- Offline events must be idempotent and conflict-aware.
- AI cannot run arbitrary SQL, bypass permissions or invent records/medical treatment.

## Phase 0 – Planning task
Create a workspace plan containing:
- current repository assessment
- proposed folder structure
- ERD and schema decisions
- API contract
- agent/task breakdown
- offline sync design
- test plan
- risk register

Do not start full coding until the project owner approves material architecture and database decisions.

## Execution
Work through milestones:
1. Architecture and foundation.
2. Database and API.
3. Farm Map.
4. Animals and pen assignments.
5. Breeding and pedigree.
6. Health and incidents.
7. Offline sync.
8. Search and AI.
9. QA and deployment.

For each milestone, show:
- task plan
- files to change
- implementation
- tests and actual results
- remaining issues
- approval gates

If parallel agents are available, assign each a bounded task and require integration contracts. Do not let multiple agents edit the same schema or shared files concurrently.
