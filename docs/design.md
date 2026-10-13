# CollabCode — Service Design, Contracts & Schema

## 1. Capability list

| # | Capability (verb) | Owning service |
|---|---|---|
| 1 | `signUp` | Auth |
| 2 | `login` | Auth |
| 3 | `verifyToken` | Auth |
| 4 | `createRoom` | Rooms |
| 5 | `getRoom` / `listRooms` | Rooms |
| 6 | `updateRoom` | Rooms |
| 7 | `deleteRoom` | Rooms |
| 8 | `joinRoom` / `leaveRoom` | Rooms (central operation — fans out to Auth + Documents) |
| 9 | `createDocument` | Documents |
| 10 | `getDocument` / `saveDocument` | Documents |
| 11 | `broadcastEdit` / `trackPresence` | Collaboration (WebSocket, not REST — see §6) |
| 12 | `runCode` | Code Execution (external SOAP partner — design only, see `integration.md`) |

## 2. Service diagram

```
                         ┌──────────────┐
                         │   Frontend   │
                         │ React+Tailwind│
                         └──────┬───────┘
                   REST calls   │    WebSocket
             ┌───────────────────────────────┐
             ▼                 ▼              ▼
      ┌────────────┐   ┌─────────────┐  ┌──────────────┐
      │    Auth    │   │    Rooms    │  │ Collaboration │
      │  service   │◄──┤  (central)  │  │  (WebSocket)  │
      │  :4001     │   │   :4000     │  └──────┬────────┘
      └────────────┘   └──────┬──────┘         │
                               │                │
                               ▼                ▼
                        ┌─────────────────────────┐
                        │      Documents           │
                        │        :4002             │
                        └─────────────────────────┘

      ┌───────────────────────┐
      │  Code Execution        │  ← external SOAP partner (Assignment 3,
      │  (SOAP partner)         │    design-only — not implemented here)
      └───────────────────────┘
```
Owners: Auth → M1, Rooms → M2, Documents → M3, Collaboration → M4,
Code Execution integration → M5.

Rooms is the **central service**: it is the only one that calls another
internal service synchronously over HTTP (Documents, on room creation —
see §4), and it's the service every other assignment (A4–A6) builds on.

## 3. Contracts per service

### Auth (owner: M1)
| Operation | Method & path | Request | Success | Errors |
|---|---|---|---|---|
| signUp | `POST /signup` | `{email, password, name}` | `201` + `Location: /users/:id`, body has `token` | `422` validation, `409` email taken |
| login | `POST /login` | `{email, password}` | `200`, body has `token` | `400` malformed, `401` bad credentials |
| verifyToken | `GET /me` | `Authorization: Bearer <token>` | `200` `{id, email, name}` | `401` missing/invalid token |

### Rooms (owner: M2) — ≥3 operations, our central service
| Operation | Method & path | Request | Success | Errors |
|---|---|---|---|---|
| createRoom | `POST /rooms` | `{name, isPrivate?, maxMembers?}` + `Idempotency-Key` | `201` + `Location`, `ETag` | `401`, `422` |
| listRooms | `GET /rooms` | — | `200` `{rooms, count}` | — |
| getRoom | `GET /rooms/:id` | `If-None-Match?` | `200` w/ `ETag`, or `304` | `404` |
| updateRoom | `PATCH /rooms/:id` | `If-Match` (required) + partial body | `200` w/ new `ETag` | `401/403`, `404`, `412`, `422`, `428` |
| deleteRoom | `DELETE /rooms/:id` | — | `204` | `401/403`, `404` |
| joinRoom | `POST /rooms/:id/join` | — | `200` (idempotent) | `401`, `404`, `422` (room full) |
| leaveRoom | `POST /rooms/:id/leave` | — | `200` | `401`, `404` |

### Documents (owner: M3)
| Operation | Method & path | Request | Success | Errors |
|---|---|---|---|---|
| createDocument | `POST /documents` | `{roomId, initialContent?}` | `201` + `Location` | `400` |
| getDocument | `GET /documents/:roomId` | — | `200` | `404` |
| saveDocument | `PUT /documents/:roomId` | `{content}` | `200` | `400` |

### Collaboration (owner: M4) — not REST, see §6

## 4. `joinRoom` — full spec (the central, cross-service operation)

`POST /rooms/:id/join`

1. **Auth check** — `requireAuth` middleware reads the `Authorization: Bearer`
   header and calls Auth's `GET /me` to resolve it to a `{id, name}` user.
   `401` if missing/invalid — short-circuits before touching Rooms' own
   data at all.
2. **Lookup** — Rooms looks up the room by `:id`. `404` if it doesn't exist.
3. **Idempotency check** — if the caller is already a member, return the
   current room state with `200` (no-op, not an error) — this makes the
   endpoint safe to retry/double-click.
4. **Capacity check** — if `members.length >= maxMembers`, reject with
   `422` (well-formed request, rejected by a domain rule — not `400`).
5. **Mutation** — append `{id, name, role: 'editor'}` to `members`, bump
   `version`, update `updatedAt`.
6. **Response** — `200` with the updated room (including the new `ETag`).

Document provisioning (step where Rooms would call Documents) actually
happens earlier, at **room creation**, not at join time — see Assignment 4
Part D in `rooms-service/src/documentsClient.js` for that network call's
timeout/retry/fallback behavior. `joinRoom` itself only talks to Auth
(via the shared `requireAuth` middleware) and its own store.

## 5. Database schema

Each service owns its own tables — no table is shared across two
services (keeps the Assignment 2 boundary clean for Assignment 4).

```sql
-- Auth service
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rooms service
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_id      TEXT NOT NULL,        -- references users.id, but NOT a FK
                                       -- (Rooms doesn't share Auth's DB)
  is_private    BOOLEAN NOT NULL DEFAULT false,
  max_members   INT NOT NULL DEFAULT 8,
  doc_status    TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready'
  version       INT NOT NULL DEFAULT 1,          -- backs the ETag
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_members (
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,           -- references users.id, not an FK
  user_name  TEXT NOT NULL,           -- denormalized snapshot, avoids a
                                       -- cross-service join on every read
  role       TEXT NOT NULL DEFAULT 'editor', -- 'owner' | 'editor'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Documents service
CREATE TABLE documents (
  room_id     TEXT PRIMARY KEY,       -- references rooms.id, not an FK
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

ER diagram (text form — draw this as boxes+arrows in draw.io for submission):
```
users (Auth)          rooms (Rooms)              documents (Documents)
┌──────────┐          ┌──────────────┐           ┌──────────────┐
│ id PK    │╌╌╌╌╌╌╌╌╌►│ id PK        │╌╌╌╌╌╌╌╌╌► │ room_id PK   │
│ email    │ no FK,   │ owner_id     │ no FK,    │ content      │
│ name     │ cross-   │ name         │ cross-    │ updated_at   │
│ pwd_hash │ service  │ is_private   │ service   └──────────────┘
└──────────┘          │ max_members  │
                       │ doc_status   │           room_members
                       │ version      │           ┌──────────────┐
                       └──────┬───────┘           │ room_id FK   │──┐
                              │ 1:N (real FK,      │ user_id      │  │ (within
                              │ same DB)           │ user_name    │  │  Rooms'
                              └───────────────────►│ role         │◄─┘  own DB)
                                                    └──────────────┘
```

## 6. Note on Collaboration/Presence

This service is deliberately **not** part of the REST contract table
above — it's a WebSocket service (`socket.io`), because its job is
pushing many small updates (keystrokes, cursor moves) to clients with
low latency, which request/response REST isn't built for. It's still a
real part of the project (`collaboration-service/`, wired into the
frontend's `Room.jsx`), just outside the scope of what Assignments 1–6
ask us to design/rebuild as REST.

## 7. Five properties validation

| Property | How this design satisfies it |
|---|---|
| **Client–server** | Frontend (client) never touches a database directly; all state changes go through one of the three REST services. |
| **Statelessness** | Every request carries its own `Authorization: Bearer` token — no service keeps session state about "who's currently calling"; Rooms re-verifies the token with Auth on every protected request. |
| **Cacheability** | `GET /rooms/:id` sends `ETag` + `Cache-Control`, and honors `If-None-Match` with a `304` — a client/proxy can safely cache and revalidate instead of re-fetching the full body. |
| **Uniform interface** | Each resource (`/rooms`, `/rooms/:id`, `/documents/:roomId`) is addressed by a stable URL and manipulated with standard methods (`GET`/`POST`/`PATCH`/`DELETE`); non-CRUD actions (`join`/`leave`) are modeled as `POST` to a sub-resource, not as verbs in the query string. |
| **Layered system** | The frontend never needs to know Documents exists — it only talks to Rooms and Documents directly for what it needs; Rooms could be put behind a gateway/load balancer with zero client-side changes. |
