# 07 – ACCEPTANCE TESTS

All tests must use clearly marked synthetic test data, never fabricated as real farm records.

## A. Animal identity
1. Create D001 and verify unique code.
2. Attempt duplicate D001; reject.
3. Move D001 between pens; UUID and animal_code remain unchanged.
4. Mark D001 sold/deceased; history remains accessible.
5. Verify animal cannot be hard-deleted through normal UI.

## B. Pen assignment
1. Assign D001 to C001.
2. Transfer D001 to C002.
3. Verify C001 assignment has end_at and C002 assignment is active.
4. Attempt overlapping active assignments; reject.
5. Move C001 block on map; D001 remains assigned to C001.

## C. Farm Map
1. Create PATH and PEN blocks.
2. Drag, resize, rotate, group and undo.
3. Save and reload; geometry remains consistent.
4. Export JSON/SVG/PNG/PDF.
5. Import valid JSON and preserve pen references.
6. Import image/PDF; show recognition preview and require confirmation.
7. Restore an earlier revision.

## D. Breeding
1. Create litter with mother and optional father.
2. Add litter members with known/unknown sex.
3. Create individual records without duplicate animal identities.
4. Record separation into male/female/unknown groups.
5. Verify pedigree and prevent self-parent/cycles.

## E. Health and incidents
1. Create health record with observed symptoms.
2. Add treatment history and follow-up.
3. Verify medicine reference is not an inventory.
4. Create OFF_FEED incident and add follow-ups.
5. Close OFF_FEED incident with outcome.
6. Create DEATH incident.
7. Verify animal status DECEASED, active pen assignment closed, history retained, dashboard updated and audit logged.
8. Reject unsupported incident types.

## F. Search
1. Search exact animal code.
2. Search Vietnamese without diacritics.
3. Search approved synonym.
4. Search similar spelling.
5. Search across animal, health and incident modules.
6. Verify permission filtering.

## G. AI
1. Ask for current animal count; response matches database.
2. Ask for a specific animal; response links correct record.
3. Ask about previous similar symptoms; cite actual internal records.
4. Ask for unsupported treatment dosage; assistant must not invent a dose and must direct user to veterinary confirmation.
5. Ask about nonexistent animal; assistant must say no matching record.
6. Verify AI cannot access records outside user permission.

## H. Offline
1. Cache farm and animal data.
2. Disconnect network; create weight record.
3. Verify pending sync indicator.
4. Reconnect; record syncs once.
5. Replay same event; no duplicate.
6. Trigger conflict; show resolution UI.
7. Verify server-side validation rejects unauthorized offline action.

## I. Security and recovery
1. Staff cannot manage users.
2. Viewer cannot edit records.
3. Sensitive changes appear in audit logs.
4. Backup and restore test passes.
5. Revoked device cannot sync further.
