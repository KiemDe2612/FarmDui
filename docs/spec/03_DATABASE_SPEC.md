# 03 – DATABASE SPECIFICATION

This is a logical schema guide. Agent 3 must produce the final ERD and Prisma schema, documenting any proposed changes before implementation.

## 1. Conventions
- Primary keys: UUID.
- Human-readable codes: unique and non-reusable (e.g. D001, C001).
- Timestamps: store UTC; display in Asia/Ho_Chi_Minh.
- Use `created_at`, `updated_at`, `created_by`, `updated_by` where appropriate.
- Use soft-delete/archive only where appropriate; preserve historical records.
- Prefer explicit status enums and database constraints.
- Avoid storing derived counts as authoritative values.

## 2. Tables

### Identity and access
- users(id, email, password_hash/auth_provider, display_name, status, created_at, updated_at)
- roles(id, code, name)
- permissions(id, code, description)
- user_roles(user_id, role_id)
- role_permissions(role_id, permission_id)
- devices(id, user_id, device_name, last_seen_at, revoked_at)
- audit_logs(id, actor_user_id, device_id, action, entity_type, entity_id, before_data, after_data, created_at)

### Farm and map
- farms(id, farm_code, name, timezone, status)
- zones(id, farm_id, zone_code, name, description, status)
- pens(id, farm_id, zone_id, pen_code, name, status, capacity, notes, created_at, updated_at)
- farm_maps(id, farm_id, name, current_revision_id, created_at, updated_at)
- farm_map_revisions(id, farm_map_id, revision_number, document_json, created_by, created_at, change_note)
- farm_blocks(id, revision_id, block_key, block_type, pen_id nullable, geometry_json, style_json, layer_order)
- pen_assignments(id, animal_id, pen_id, start_at, end_at nullable, reason, recorded_by, created_at)

Important: `farm_blocks` may be represented entirely inside versioned JSON instead of a relational table, but choose one canonical representation. Do not duplicate two independently editable sources of geometry.

### Animals
- animals(id, animal_code, name nullable, sex, date_of_birth nullable, birth_date_precision, origin_type, status, father_id nullable, mother_id nullable, notes, created_at, updated_at, version)
- animal_photos(id, animal_id, file_id, caption, created_at)
- animal_weights(id, animal_id, measured_at, weight_value, weight_unit, recorded_by, note)
- animal_events(id, animal_id, event_type, occurred_at, details_json, recorded_by, created_at)
- animal_relations(id, animal_id, related_animal_id, relation_type, confidence, source_note)

Use either father_id/mother_id or a relation model as the authoritative parent link; do not maintain conflicting duplicate sources. Validate no self-parent and no ancestry cycles.

### Breeding
- breeding_records(id, female_animal_id, male_animal_id nullable, start_at, end_at nullable, outcome, notes, recorded_by)
- litters(id, litter_code, mother_animal_id, father_animal_id nullable, birth_at, total_born, alive_count, deceased_count, notes)
- litter_members(id, litter_id, animal_id nullable, temporary_label nullable, sex_at_recording, notes)
- separation_records(id, litter_id nullable, occurred_at, reason, recorded_by, notes)
- separation_members(id, separation_record_id, animal_id, destination_pen_id, sex_at_separation)

Do not force a litter member to have an animal ID before an individual record exists. Provide a controlled workflow to create animal profiles from litter members without duplicate identities.

### Health and treatment
- symptom_catalog(id, code, name_vi, synonyms, description)
- health_records(id, animal_id, detected_at, severity, diagnosis_status, diagnosis_text, veterinary_confirmation, recorded_by, notes, status)
- health_record_symptoms(id, health_record_id, symptom_id nullable, observed_text, severity)
- medicines(id, medicine_code, trade_name, active_ingredient, medicine_group, reference_description, warnings, contraindications, source_reference, verification_status)
- treatment_records(id, health_record_id, started_at, ended_at nullable, action_taken, prescribed_by nullable, performed_by, outcome, notes)
- treatment_medicines(id, treatment_record_id, medicine_id, medicine_name_snapshot, active_ingredient_snapshot, usage_notes, dose_text nullable, dose_source nullable)
- treatment_followups(id, treatment_record_id, followed_up_at, observations, outcome, recorded_by)

No medicine stock, batches, expiry inventory, or inventory transactions.

### Incidents
- animal_incidents(id, animal_id, incident_type, occurred_at, detected_at, pen_id_snapshot nullable, description, severity nullable, suspected_cause nullable, confirmed_cause nullable, cause_status, recorded_by, closed_at nullable, linked_health_record_id nullable, created_at)
- incident_followups(id, incident_id, followed_up_at, observations, action_taken, outcome, recorded_by, created_at)

Allowed incident types only:
- OFF_FEED
- DEATH

For DEATH, preserve the last pen as a snapshot and close the active pen assignment in a transaction. Do not delete animal history.

### Search and AI
- knowledge_documents(id, title, source_type, source_reference, uploaded_by, approval_status, created_at)
- knowledge_chunks(id, document_id, chunk_index, content, page_number nullable, metadata_json)
- document_embeddings(id, chunk_id, embedding, model_name)
- search_synonyms(id, canonical_term, synonym, language, approved_by)
- ai_conversations(id, user_id, title, created_at)
- ai_messages(id, conversation_id, role, content, source_refs_json, created_at)

### Sync
- sync_events(id, event_uuid, device_id, user_id, entity_type, entity_id, operation, payload_json, base_version, created_at, sync_status)
- sync_conflicts(id, sync_event_id, entity_type, entity_id, local_payload, server_payload, resolution_status, resolved_by, resolved_at)
- idempotency_keys(id, key, device_id, response_hash, created_at)

## 3. Constraints and invariants
- Unique animal_code and pen_code within farm.
- An animal can have at most one active pen assignment at a time.
- Use transaction/constraint strategy to enforce non-overlapping assignments.
- DEATH incident must atomically set animal status to DECEASED and close active assignment.
- A deceased animal cannot receive a new active pen assignment unless an authorized correction workflow reopens it.
- No self-parent, no circular pedigree.
- Birth totals must be non-negative and internally consistent.
- No hard delete of animal, health, breeding, treatment, or incident history.
- Record actor and timestamp for critical actions.
- Validate all offline event payloads again on server.

## 4. Important design review
Before coding, Agent 3 must resolve and document:
1. Canonical map geometry storage: relational blocks or revision JSON.
2. Canonical parent relationship storage.
3. How litter members become permanent individual animal records.
4. How overlapping pen assignments are prevented in PostgreSQL.
5. Whether `DEATH` is both an incident and an animal lifecycle event, and how duplicate event creation is prevented.
