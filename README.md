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
