-- CollabCode database schema (Assignment 2)
-- Each service owns its own tables below — no table is shared across two
-- services. Cross-service references (owner_id, room_id as seen from
-- Documents) are plain text/UUID columns, never real foreign keys, since
-- they point into another service's database.
--
-- Currently all three services run on an in-memory store (see each
-- service's src/store.js) so the project runs with zero setup. Swapping
-- a service to Postgres means pointing its store.js at a `pg` client
-- using the tables below — the rest of the service (app.js, models.js)
-- doesn't need to change.

-- ============================================================
-- Auth service database
-- ============================================================
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Rooms service database (the service rebuilt in Assignment 4)
-- ============================================================
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_id      TEXT NOT NULL,                     -- Auth's users.id, no FK
  is_private    BOOLEAN NOT NULL DEFAULT false,
  max_members   INT NOT NULL DEFAULT 8,
  doc_status    TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'ready'
  version       INT NOT NULL DEFAULT 1,             -- backs the ETag
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_members (
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,                         -- Auth's users.id, no FK
  user_name  TEXT NOT NULL,                          -- denormalized snapshot
  role       TEXT NOT NULL DEFAULT 'editor',          -- 'owner' | 'editor'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE idempotency_keys (
  key          TEXT PRIMARY KEY,
  status_code  INT NOT NULL,
  headers      JSONB NOT NULL,
  body         JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Documents service database
-- ============================================================
CREATE TABLE documents (
  room_id     TEXT PRIMARY KEY,                     -- Rooms' rooms.id, no FK
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
