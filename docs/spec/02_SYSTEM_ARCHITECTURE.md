# 02 – SYSTEM ARCHITECTURE

## 1. Architecture decision
Use a Cloud-first PWA with offline data entry and a NestJS Modular Monolith. Initial scale is 50–200 animals; avoid microservices.

## 2. Suggested stack
- Frontend: Next.js + TypeScript.
- UI: Tailwind CSS + shadcn/ui.
- Backend: NestJS REST API.
- ORM: Prisma.
- Primary DB: PostgreSQL.
- Search: PostgreSQL full-text + pg_trgm; optional pgvector for semantic retrieval.
- Offline: PWA Service Worker + IndexedDB via Dexie.js.
- 2D editor: Konva.js (or React-Konva).
- File storage: S3-compatible object storage.
- Deployment: Docker.
- Tests: unit, integration, end-to-end.

Do not lock to a paid vendor until project owner approves. Keep AI provider and object storage behind adapters.

## 3. Logical architecture
Browser/PWA:
- UI and route modules.
- Local repository (Dexie/IndexedDB).
- Outbox queue.
- Sync coordinator.
- Cached map and essential records.
- Online-only AI and import recognition where remote inference is required.

Backend:
- Auth and RBAC.
- Farm and map module.
- Pens.
- Animals and lifecycle.
- Breeding and pedigree.
- Health and incidents.
- Search.
- AI orchestration/RAG.
- Sync.
- Audit and notifications.

PostgreSQL is the authoritative shared source of truth. IndexedDB is a local working copy and queue, not the canonical database.

## 4. Suggested repository structure
/apps
  /web                 Next.js PWA
  /api                 NestJS
/packages
  /shared-types        Shared DTOs, enums, schemas
  /api-client          Typed API client
  /domain              Shared domain rules
/docs
  architecture/
  database/
  api/
  agents/
  decisions/
/infra
  docker/
  scripts/

A monorepo is recommended but the Lead Agent may propose an alternative with reasons before implementation.

## 5. Backend module boundaries
- auth
- users
- farms
- zones
- pens
- maps
- animals
- breeding
- health
- incidents
- search
- ai
- sync
- audit
- attachments

Do not create inventory or feeding modules.

## 6. Core domain separation
- `pens`: real-world pen identity and attributes.
- `farm_maps`: map documents/revisions.
- `farm_blocks`: geometry and visual presentation.
- `pen_assignments`: animal-to-pen occupancy over time.
- `animals`: identity and current lifecycle state.
- event tables: immutable historical facts.

Moving a map block must never update animal assignments. Moving an animal between pens must update assignment history, not map geometry.

## 7. Security
- RBAC plus permission checks at API level.
- Validate every DTO server-side.
- No direct database access from browser.
- AI uses allowlisted backend tools, never arbitrary SQL.
- Audit sensitive changes.
- Secure file uploads and validate MIME/type/size.
- Use secure session/token handling and rate limits.
- Backups and restore procedure required.

## 8. Non-functional requirements
- Responsive desktop/tablet/mobile.
- Usable on ordinary broadband and intermittent connectivity.
- Avoid unnecessary complexity for 50–200 animals.
- Accessibility and keyboard support for core forms.
- Database migration and backup tested.
- Observability: structured logs and error reporting.
- No secrets committed to repository.
