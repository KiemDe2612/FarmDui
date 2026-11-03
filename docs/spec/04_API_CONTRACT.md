# 04 – API CONTRACT (INITIAL)

All routes are versioned under `/api/v1`. Use DTO validation, pagination, consistent errors and permission checks. Exact payloads must be finalized by Agent 2 and shared with Frontend/Offline agents before implementation.

## Authentication
- POST `/auth/login`
- POST `/auth/logout`
- POST `/auth/refresh`
- GET `/auth/me`

## Farm, zones and pens
- GET/POST `/farms`
- GET/PATCH `/farms/:farmId`
- GET/POST `/farms/:farmId/zones`
- GET/POST `/farms/:farmId/pens`
- GET/PATCH `/pens/:penId`
- GET `/pens/:penId/animals`
- GET `/pens/:penId/history`

## Maps
- GET `/farms/:farmId/maps`
- POST `/farms/:farmId/maps`
- GET `/maps/:mapId/revisions`
- POST `/maps/:mapId/revisions`
- GET `/maps/:mapId/revisions/:revisionId`
- POST `/maps/:mapId/restore/:revisionId`
- POST `/maps/import/validate`
- POST `/maps/export`

Import recognition may be an asynchronous job. Never silently convert an unrecognized object into a pen.

## Animals
- GET/POST `/animals`
- GET/PATCH `/animals/:animalId`
- GET `/animals/:animalId/timeline`
- GET `/animals/:animalId/weights`
- POST `/animals/:animalId/weights`
- GET `/animals/:animalId/relations`
- POST `/animals/:animalId/transfer`
- GET `/animals/:animalId/pen-history`

## Breeding
- GET/POST `/breeding-records`
- GET/POST `/litters`
- GET `/litters/:litterId`
- POST `/litters/:litterId/members`
- POST `/separation-records`
- GET `/animals/:animalId/offspring`
- GET `/animals/:animalId/pedigree`

## Health and incidents
- GET/POST `/health-records`
- GET/PATCH `/health-records/:recordId`
- POST `/health-records/:recordId/treatments`
- POST `/treatments/:treatmentId/followups`
- GET `/medicines`
- GET/POST `/animal-incidents`
- GET `/animal-incidents/:incidentId`
- POST `/animal-incidents/:incidentId/followups`
- POST `/animal-incidents/:incidentId/close`

Incident creation must validate type against OFF_FEED and DEATH only. DEATH workflow must be transactional.

## Search and AI
- GET `/search?q=...&types=...`
- POST `/ai/conversations`
- GET `/ai/conversations/:id`
- POST `/ai/conversations/:id/messages`

AI tools must be server-side allowlisted operations, e.g. searchAnimals, getAnimalTimeline, searchHealthRecords, getPenOccupancy, getBreedingSummary. No arbitrary SQL from LLM.

## Sync
- GET `/sync/bootstrap?since=...`
- POST `/sync/push`
- GET `/sync/pull?cursor=...`
- POST `/sync/resolve-conflict`

Every pushed event has event_uuid, device_id, entity_type, operation, payload, base_version and client_created_at. Server validates permission, schema, invariants and idempotency.

## Error format
Use a consistent response:
- code
- message
- details
- request_id

Use HTTP status codes appropriately. Never expose stack traces or secrets.
