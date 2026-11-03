# 10 – TASK TEMPLATES FOR SUBAGENTS

Use one task brief per subagent. Fill in exact repository paths and interfaces before delegation.

## Generic task template
### Objective
[One bounded outcome.]

### Context
[Relevant product and architecture decisions.]

### Owned files
[List exact files/directories. Avoid shared files unless explicitly assigned.]

### Inputs/contracts
[DTOs, types, endpoints, schema references.]

### Must implement
[Specific behaviors.]

### Must not implement
[Out-of-scope behaviors.]

### Acceptance criteria
[Observable tests.]

### Validation
[Commands to run and actual outputs to report.]

### Handoff
- Files changed
- Public interfaces
- Tests run
- Known issues
- Follow-up dependencies

## Suggested bounded tasks

### Agent 4 – Map editor MVP
Objective: Implement editable 2D canvas with PEN/PATH/ZONE/NOTE blocks.
Acceptance: pan/zoom, drag, resize, rotate, selection, undo/redo, JSON save/load; pen_id reference remains stable.

### Agent 5 – Animal lifecycle MVP
Objective: Implement animal profile and pen assignment history.
Acceptance: unique code, create/edit, transfer transaction, timeline, no overlapping active assignments.

### Agent 6 – Incident MVP
Objective: Implement OFF_FEED and DEATH records.
Acceptance: unsupported types rejected; DEATH transaction closes active assignment and preserves history.

### Agent 7 – Vietnamese search MVP
Objective: Implement unaccented and fuzzy search over animals, pens, health records and incidents.
Acceptance: test terms include `tieu chay` and `tiêu chảy`; permission filtering enforced.

### Agent 8 – Offline event MVP
Objective: Implement local outbox and push/pull sync for animal weights and incidents.
Acceptance: offline write, retry, idempotency, conflict surfaced to user.
