# Mizan Backend

Express + MongoDB Atlas + Mongoose backend for the Mizan Life OS frontend.

## Setup
1. `npm install`
2. Copy `.env.example` → `.env`, fill in `MONGODB_URI` and `OPENROUTER_API_KEY`
3. `npm run dev`

No migration step — Mongoose creates collections on first write.

## Endpoints
See `docs/superpowers/specs/2026-08-06-mizan-backend-design.md` for the full contract.

## Migrating existing localStorage
POST `/api/migrate` with the JSON from your browser's localStorage. See spec §5.

## Tests
`MONGODB_DB_NAME=mizan_test npm test`

## Content tracking

- `GET /api/content`: assets and experiment settings, separate from all life-planning collections.
- `POST /api/content/initialize`: insert the 150 supplied Enzo/HustlIQ ideas and default settings. Stable IDs and insert-only writes preserve existing edits on repeat calls.
- `POST /api/content/assets`: create a validated content record.
- `PUT /api/content/assets/:id`: save `{ revision, data }`; conflicting revisions return 409.
- `PUT /api/content/settings`: save `{ revision, data }` with the same conflict protection.

Content is stored in the `ContentAsset` and `ContentSettings` Mongo models. Archive records through their status instead of deleting them. Uploads and metrics are manual records, not social API integrations. Each video contains three platform publication records; unknown metrics stay `null`.

Run the isolated content API tests with `npx vitest run test/content.test.js`. They use a mocked data store and never reset the configured Mongo database.

## HustlIQ Journey

- `GET /api/journey`: events, playbooks, overview, and initialization state.
- `POST /api/journey/initialize`: insert three draft procedures and an empty overview. Personal starter history belongs in the database, not the public source repository. Stable IDs and insert-only writes preserve all edits, including archived entries.
- `POST /api/journey/events` and `POST /api/journey/playbooks`: create validated records.
- `PUT /api/journey/events/:id`, `PUT /api/journey/playbooks/:id`, and `PUT /api/journey/overview`: save `{ revision, data }`; stale writes return 409.

Records use the separate `JourneyRecord` collection. No Content, task, goal, or daily-log data is modified. Dates can be null; event order and links organize the story. Nested updates preserve follow-ups inside events. Evidence links accept only HTTP(S). Invalid event references and causal cycles are rejected. Archive events or retire playbooks instead of deleting them. Suggested procedures start as Draft, and evidence assessments start as Not assessed.

Run `npm test -- test/journey.test.js test/content.test.js` for isolated router, validation, initialization, and conflict checks. These tests never connect to MongoDB. Deploy this backend route before releasing the matching Journey frontend.
