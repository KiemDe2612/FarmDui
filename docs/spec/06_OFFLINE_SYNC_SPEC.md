# 06 – OFFLINE AND SYNCHRONIZATION SPECIFICATION

## 1. Principle
The app is cloud-first. PostgreSQL is the authoritative shared source. IndexedDB is a local working store and pending-event queue.

## 2. Offline capabilities
Must support offline:
- View previously synchronized animal profiles and pen data.
- View cached farm map.
- Create animal weight records.
- Create incident drafts/records for OFF_FEED and DEATH, subject to local safeguards.
- Create health notes and follow-ups.
- Record breeding/separation events if required reference data is cached.
- Edit map only if the user has permission and a conflict-safe revision workflow exists.

Online-only or limited:
- AI queries requiring remote model/API.
- Remote RAG documents not cached.
- AI image/PDF recognition when inference service is remote.
- Login/session renewal if credentials/session are expired.
- Cross-device current data.

The UI must clearly label data as synced, pending, failed or conflict.

## 3. Event envelope
Each queued operation includes:
- event_uuid (UUID, globally unique)
- device_id
- user_id
- entity_type
- entity_id
- operation
- payload
- base_version
- client_created_at
- schema_version

Server adds:
- received_at
- processed_at
- sync_status
- server_version

## 4. Sync process
1. User action writes to local database immediately.
2. Same transaction adds an outbox event.
3. UI shows pending-sync state.
4. Sync coordinator sends batches when online.
5. Server authenticates user/device and validates permission.
6. Server validates schema and domain invariants.
7. Idempotency prevents duplicate processing.
8. Server acknowledges accepted/rejected/conflict events.
9. Client updates local server version and removes acknowledged outbox item.
10. Client pulls remote changes using cursor.

## 5. Conflict policy
Do not use blind last-write-wins for important data.

- Weight records: append-only; retain both distinct measurements.
- Incident follow-ups: append-only.
- Treatment notes: preserve revisions or append events; no silent overwrite.
- Animal profile field edits: optimistic concurrency using version; show conflict resolution.
- Pen assignment: server validates no overlapping active assignments; conflicting transfers require review.
- Farm map: revision-based; if base revision is stale, create conflict and allow compare/choose/merge.
- Death event: high-priority transactional workflow; reject contradictory concurrent updates and require manager/admin resolution.

## 6. Safety
- Local data is sensitive; minimize cache and provide logout/device revoke behavior.
- Do not store passwords in IndexedDB.
- Encrypt transport with HTTPS.
- Consider at-rest protection according to deployment/browser capabilities; do not claim browser IndexedDB is automatically encrypted.
- Validate all data again on server.
- Backups must include database and file references.
- Define behavior for lost device and revoked user.

## 7. Required tests
- Offline create then online sync.
- Retry same event multiple times without duplication.
- Two devices edit same animal.
- Two devices transfer same animal.
- Concurrent map edits.
- Death event while another device adds follow-up.
- Session revoked while offline.
- Browser storage quota failure.
- Attachment upload interrupted.
