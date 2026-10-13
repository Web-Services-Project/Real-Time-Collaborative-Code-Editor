# CollabCode — Realtime Collaborative Code Editor

CS543 Web Services project. A small microservice system where multiple users
create "rooms" and edit the same code file together in real time.

## Team

| Service | Owner |
|---|---|
| Auth | M1 |
| Rooms (central service) | M2 |
| Documents | M3 |
| Collaboration / Presence (WebSocket) | M4 |
| Code Execution (external SOAP partner, design only) | M5 |

*(swap M1–M5 for real names/roll numbers in this table)*

## What's in this repo

```
collab-code-editor/
  auth-service/           # signup/login, issues JWTs                    (A1 base)
  rooms-service/          # the service rebuilt for A4 / A5 / A6         <-- main deliverable
  documents-service/      # minimal service rooms-service depends on
  collaboration-service/  # WebSocket layer: live edits + presence (beyond A1-A6, the actual "project")
  frontend/                # React + Tailwind UI (dashboard + live editor)
  docs/                    # design.md (A2), integration.md + WSDL (A3), NOTES.md (A4-A6), http-log.md etc (A1)
```

## Running it locally

You need Node.js 18+ (for native `fetch`).

**Quickest — one command for everything:**
```bash
npm run install:all   # installs all 5 services' dependencies, once
npm run dev            # starts auth, documents, rooms, collaboration, and the frontend together
```
Then open `http://localhost:5173`.

**Or run each service in its own terminal** (useful when you want to watch
one service's logs on its own, or kill/restart just one):
```bash
cd auth-service && npm install && npm start          # http://localhost:4001
cd documents-service && npm install && npm start      # http://localhost:4002
cd rooms-service && npm install && npm start           # http://localhost:4000
cd collaboration-service && npm install && npm start   # http://localhost:4003
cd frontend && npm install && npm run dev              # http://localhost:5173
```

Open two browser windows at `http://localhost:5173`, sign up two different
users, create a room in one, join it from the other with the room code, and
type — both editors stay in sync and you'll see each other's presence.

## Running the tests

```bash
npm test                               # from the repo root, or:
cd rooms-service && npm install && npm test
```
All 10 tests pass as of this writing — they cover auth-required creation,
`201`/`Location`/`ETag`, `422` validation, conditional `GET` (`304`),
`404`, `Idempotency-Key` replay, room-full `422`, `If-Match` `428`/`412`,
and `OPTIONS`/`405` with `Allow`.

## Demoing the resilience behavior (A4 Part D) live

```bash
# force documents-service to fail every request, and shorten rooms-service's
# retry budget so the demo doesn't take long:
cd documents-service && FAIL_RATE=1 npm start
cd rooms-service && DOCS_TIMEOUT_MS=400 DOCS_MAX_RETRIES=1 npm start
```
Creating a room still returns `201` (with `"docStatus": "pending"`
instead of `"ready"`) rather than hanging or erroring — good evidence for
viva that the timeout/retry/fallback logic actually works, not just that
it's written.

## Assignment → code map

| Assignment | Where |
|---|---|
| A1 — HTTP by hand & setup | `docs/http-log.md`, `docs/network-analysis.md`, `docs/brief.md`, this repo itself |
| A2 — Services, contracts, schema | `docs/design.md`, `docs/schema.sql` |
| A3 — External SOAP partner | `docs/integration.md`, `docs/partner.wsdl`, `docs/soap-*.xml` |
| A4 — Rebuild a service in REST | `rooms-service/` (model, contract, endpoints, idempotency, tests, network call to documents-service) + `docs/NOTES.md` |
| A5 — HTTP methods & headers | `rooms-service/src/app.js` (OPTIONS/Allow, ETag/304, If-Match/412, rate-limit headers, CORS) + `docs/NOTES.md` |
| A6 — Status codes, errors, validation | `rooms-service/src/errors.js`, `rooms-service/src/validate.js` + `docs/NOTES.md` |

Each service still has its own commit-worthy history if you `git init` fresh
and commit module-by-module — don't just push this as one giant commit; split
it into a few commits (setup → auth → rooms → documents → frontend → docs) so
your contribution graph looks real.
