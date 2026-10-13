# rooms-service — NOTES (Assignments 4, 5, 6)

## Assignment 4, Part D — Network call to Documents

**What calls what:** on `POST /rooms`, after the room is saved locally,
Rooms calls `POST http://documents-service/documents` to provision an
empty document for the new room (`rooms-service/src/documentsClient.js`).

**Timeout:** 1500ms per attempt (`DOCS_TIMEOUT_MS`), via `AbortController`
— a hung connection to Documents must not hang room creation indefinitely.

**Retry policy:** up to 2 retries (`DOCS_MAX_RETRIES`) on a 5xx response,
a timeout, or a network error. **Never** retried on a 4xx — if Documents
rejected our request as malformed, sending the identical body again will
fail identically, so we stop immediately instead of wasting attempts and
time.

**Backoff:** exponential with jitter — `200ms * 2^(attempt-1)` plus up to
100ms of random jitter, so a burst of simultaneous failures (e.g. many
rooms created at once while Documents is restarting) doesn't all retry in
lockstep and re-hammer it the moment it comes back.

**Fallback:** if all attempts are exhausted, the room is still created
(`201`) with `docStatus: "pending"` instead of failing the whole request.
We chose availability of the primary resource (the room) over strict
consistency with a secondary one (its document) — a user can still create
and share a room even if Documents is briefly down; the frontend shows
"setting up your document..." and a document gets created lazily later
(not yet wired up — noted as a known gap, not implemented).
**Verified live:** with `documents-service` forced to fail 100% of
requests (`FAIL_RATE=1`), `POST /rooms` still returned `201` with
`docStatus: "pending"` in ~290ms (two attempts + one backoff), rather
than hanging or erroring.

---

## Assignment 5 — HTTP methods & headers

### Method map
| Resource | GET | POST | PATCH | DELETE | OPTIONS |
|---|---|---|---|---|---|
| `/rooms` | list | create | — | — | `Allow: GET, POST, OPTIONS` |
| `/rooms/:id` | get | — | update | delete | `Allow: GET, PATCH, DELETE, OPTIONS` |
| `/rooms/:id/join` | — | join (action) | — | — | — |
| `/rooms/:id/leave` | — | leave (action) | — | — | — |

Non-CRUD actions (`join`, `leave`) are **not** squeezed into `PATCH` with
a magic field — they're `POST` to a dedicated sub-resource, which is the
RESTful way to model an action that isn't just "replace some fields."

### Safe / idempotent audit
| Method | Safe? | Idempotent? | Why |
|---|---|---|---|
| `GET` | yes | yes | read-only, same request → same result |
| `POST /rooms` | no | no *(but see Idempotency-Key below)* | creates a new resource each call |
| `POST /rooms/:id/join` | no | **yes** | joining twice = joining once (checked explicitly in `joinRoom`) |
| `PATCH` | no | yes | re-sending the same patch with the same (now-current) `If-Match` produces the same end state |
| `DELETE` | no | yes | deleting an already-deleted room still ends with "room gone" (we return `404` on the 2nd call, which is the correct, expected end state) |

### Curl -v transcript (captured live against a real running room)

```
$ curl -v http://localhost:4000/rooms/<id>
> GET /rooms/<id> HTTP/1.1
> Accept: */*
<
< HTTP/1.1 200 OK
< ETag: "<id>-v1"
< Cache-Control: private, max-age=0, must-revalidate
< Content-Type: application/json; charset=utf-8

$ curl -v http://localhost:4000/rooms/<id> -H 'If-None-Match: "<id>-v1"'
> GET /rooms/<id> HTTP/1.1
> If-None-Match: "<id>-v1"
<
< HTTP/1.1 304 Not Modified
< ETag: "<id>-v1"

$ curl -v -X PATCH http://localhost:4000/rooms/<id> \
    -H "Authorization: Bearer <token>" -H 'If-Match: "<id>-v1"' \
    -d '{"name":"OS Lab Group (renamed)"}'
> PATCH /rooms/<id> HTTP/1.1
> If-Match: "<id>-v1"
<
< HTTP/1.1 200 OK
< ETag: "<id>-v2"            ← version bumped, new ETag

$ curl -v -X PATCH http://localhost:4000/rooms/<id> \
    -H "Authorization: Bearer <token>" -H 'If-Match: "<id>-v1"' \
    -d '{"name":"stale write"}'
> If-Match: "<id>-v1"        ← now stale, room is at v2
<
< HTTP/1.1 412 Precondition Failed
< Content-Type: application/problem+json; charset=utf-8
```

### Headers table
| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <token>` | request | identifies the caller (verified against Auth) |
| `Idempotency-Key` | request (POST) | lets a client safely retry a create without risking a duplicate |
| `If-None-Match` | request (GET) | conditional read → `304` if unchanged |
| `If-Match` | request (PATCH/DELETE) | conditional write → `412` if the resource moved on since the client last read it; `428` if omitted entirely |
| `ETag` | response | version fingerprint of the resource, feeds back into `If-None-Match`/`If-Match` |
| `Location` | response (201) | where the newly created resource now lives |
| `Cache-Control` | response | `private, max-age=0, must-revalidate` on rooms (always revalidate); `no-store` on the list (changes too often to cache at all) |
| `X-RateLimit-Limit/Remaining/Reset` | response | how many more requests this client can make before `429` |
| `Access-Control-Allow-*` | response | CORS — lets the frontend (different origin in dev) call this API from the browser |
| `Allow` | response (OPTIONS / 405) | which methods this route actually supports |

### Q&A
1. **Why `428` on a missing `If-Match` instead of just allowing the write?**
   Because an unconditional `PATCH` can silently overwrite someone else's
   concurrent change (two people both editing room settings). Requiring
   `If-Match` forces the client to prove it has seen the current version
   first.
2. **Why is `If-Match` required on `PATCH` but not on `GET`?** `GET` never
   changes anything, so there's nothing to protect against a lost update.
3. **What's the difference between `304` and `412`?** `304` means "you
   already have the latest version, here's nothing new" (a read
   optimization). `412` means "you tried to *write* based on a version
   that's no longer current" (a conflict guard).
4. **Why does `OPTIONS` return `204`, not `200`?** No body to return —
   only the `Allow` header matters, so there's nothing to put in a `200`
   response body.
5. **Why `Cache-Control: no-store` on the list but not on a single room?**
   The list's membership/count changes on almost every write anywhere in
   the system; caching it even briefly would show stale data more often
   than it would help. A single room changes less often and benefits from
   `ETag` revalidation.
6. **Why is `joinRoom` a `POST`, not a `PUT`?** `PUT` means "replace this
   exact resource with what I'm sending" — we're not replacing the room,
   we're triggering a side effect (adding a member) on it, which is what
   `POST` to a sub-resource models.
7. **What would break if the rate-limit headers were removed?** Nothing
   server-side — they're informational. A well-behaved client would lose
   the ability to back off *before* hitting `429`, so it'd rely purely on
   reacting to `429` + `Retry-After` instead of anticipating it.
8. **Why `private` in `Cache-Control` and not `public`?** Room membership
   is specific to who's asking — a CDN or shared proxy caching it for
   "everyone" could leak one user's room view to another.

---

## Assignment 6 — Status codes, errors, validation

### Outcome map (selected)
| Outcome | Status | Notes |
|---|---|---|
| Room created | `201` | + `Location`, `ETag` |
| Room fetched, unchanged since `If-None-Match` | `304` | no body |
| Validation failed (bad shape/length) | `422` | field-level `errors[]` |
| Room is full on join | `422` | well-formed request, rejected by a domain rule |
| No `If-Match` on a write | `428` | — |
| Stale `If-Match` | `412` | — |
| Not the room's owner | `403` | — |
| Unknown route/method | `404` / `405` | `405` includes `Allow` |
| Unexpected server failure | `500` | generic `detail`, no internals leaked |

### Error shape — one catalogue, everywhere
Every error in this service (and in Auth/Documents, independently) goes
through a single `problem()` helper producing:
```json
{
  "type": "https://collabcode.dev/errors/room-not-found",
  "title": "Room not found",
  "status": 404,
  "detail": "No room with id \"...\"."
}
```
`type` is a stable slug a client can `switch` on. `detail` is
human-readable but never leaks a stack trace or internal exception
message — the unhandled-error fallback in `app.js` logs the real error
server-side and returns a generic `"Something went wrong on our end"` to
the client.

### `400` vs `422` — the rule
**`400`**: the request itself is malformed — not valid JSON, wrong
`Content-Type`, a field of the wrong type entirely. **`422`**: the
request is well-formed JSON matching the expected shape, but rejected by
a *domain* rule. Concrete example from this service: `POST /rooms` with
`{"name": 123}` (number instead of string) → `422`, field error on
`name`; a request body that isn't valid JSON at all → `400` (Express's
body-parser rejects it before our validation ever runs). Joining a room
that's already full → `422` (nothing wrong with the request shape — the
room is just full right now).

### Validation
`src/validate.js` checks `required`, `type`, `minLength`/`maxLength`,
`minimum`/`maximum`, and `enum` per field against a small schema object
(`createRoomSchema`, `patchRoomSchema`) and returns `[{field, message}]`
— validate-then-act: nothing is written to the store until validation
passes cleanly.

### Content negotiation (`Accept` header)
`GET /rooms/:id` returns JSON by default; sending
`Accept: application/xml` returns the same room serialized as XML
(`src/xml.js`) — demonstrated live:
```
$ curl http://localhost:4000/rooms/<id> -H 'Accept: application/xml'
<?xml version="1.0" encoding="UTF-8"?><room><id>...</id><name>...</name>...</room>
```

### Q&A
1. **Why `problem+json` instead of plain `application/json` for errors?**
   It's a distinct, RFC-recognized media type (RFC 9457) a client can
   check for to know "this response is a structured error," separate
   from "this response is ordinary data that happens to be JSON."
2. **Why does `joinRoom` return `200`, not `201`, on success?** No new
   resource was created — the room already existed; we modified it
   (added a member) and return its new state, which is what `200` means.
3. **Why does calling `join` on a room you're already in return `200`
   instead of an error?** It keeps the endpoint idempotent/safely
   retryable — a flaky network causing a client to resend the same join
   shouldn't surface as a user-facing error.
4. **What does `Location` mean on a `201` vs. on a `3xx` redirect?** On
   `201` it's "here's where to `GET` the thing you just created" (no
   redirect happens). On a `3xx` it's "go here instead" (the client is
   expected to follow it).
5. **Why bother with a stable `type` URL instead of just a `message`
   string?** A `message` is for a human and can be reworded any time
   without warning; `type` is a contract a client can safely code
   against and expect not to change.
6. **Where would `Retry-After` show up in this service?** On `429 Too
   Many Requests` (not yet wired to a header value in the demo rate
   limiter, but the `X-RateLimit-Reset` timestamp serves the same
   purpose today) and would also fit a `503` if Rooms itself were ever
   temporarily overloaded.
7. **Why validate *before* checking business rules like room capacity?**
   Cheaper checks first — no point looking up a room and checking its
   member count for a request whose `name` field is already invalid.
