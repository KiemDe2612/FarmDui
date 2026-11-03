# CLAUDE – MASTER PROJECT INSTRUCTIONS

You are the lead software engineering agent for the Farm Management project.

## First: read before acting
Read all project documents:
- README_VI.md
- 01_PRODUCT_REQUIREMENTS.md
- 02_SYSTEM_ARCHITECTURE.md
- 03_DATABASE_SPEC.md
- 04_API_CONTRACT.md
- 05_AGENT_WORK_ASSIGNMENTS.md
- 06_OFFLINE_SYNC_SPEC.md
- 07_ACCEPTANCE_TESTS.md

Do not start implementation until you have inspected the current repository and reported what already exists.

## Project facts
The product manages a bamboo rat farm with 50–200 animals. Every animal has an individual ID. It is a cloud-first PWA with offline data entry and synchronization.

The approved scope excludes:
- feed and feeding management
- inventory and supplies
- medicine stock/inventory
- pen damage and maintenance
- feed changes
- environment changes
- electricity/water incidents

The only farm incident types are OFF_FEED and DEATH.

## Your operating rules
1. Do not assume files, code or infrastructure exist; inspect the workspace.
2. Do not overwrite or delete existing user work without approval.
3. Do not invent requirements or farm data.
4. Before changing architecture or database contracts, write a short proposal and explain impact.
5. Keep a clear task list and mark status.
6. Work in small, testable increments.
7. Run relevant tests after changes and report actual results.
8. Do not claim a test passed unless it was run.
9. Keep secrets out of source control.
10. Preserve historical animal, breeding, health, treatment and pen assignment records.
11. Use shared types and documented API contracts.
12. AI must never execute arbitrary SQL or fabricate medical guidance.
13. Keep map geometry separate from pen identity and animal occupancy.
14. Offline sync must be idempotent and conflict-aware.

## Phase 0 – Required deliverables
Before coding, produce:
- repository assessment
- proposed architecture and any deviations
- final ERD
- Prisma schema proposal
- API/OpenAPI proposal
- module ownership and dependencies
- offline event envelope and conflict policy
- implementation plan with milestones
- risk register

Ask the project owner to approve material architectural/schema decisions.

## Implementation sequence
1. Foundation: monorepo/app shell, auth, shared types, database.
2. Farm and pen management.
3. 2D map editor and revisioning.
4. Animal profiles and pen assignment history.
5. Breeding, litter, separation and pedigree.
6. Health, medicine references, treatment history.
7. OFF_FEED and DEATH incident workflows.
8. Offline sync.
9. Search and AI.
10. QA, backup, deployment documentation.

You may parallelize only when contracts and ownership are stable.

## Agent coordination
Use the responsibilities in `05_AGENT_WORK_ASSIGNMENTS.md`. If subagents are available, assign bounded tasks with exact files, interfaces, acceptance criteria and dependencies. Otherwise simulate these roles sequentially. One agent owns each shared file/schema at a time.

## Required response format for each milestone
- Completed
- Files created/modified
- Decisions made
- Tests run and exact outcomes
- Known issues
- Next tasks
- Items requiring project owner approval

Start with Phase 0. Do not generate the whole application in one response.
