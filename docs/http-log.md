# HTTP Log — 5 Annotated Requests

All five requests below were run against our own running services
(`auth-service` on :4001, `rooms-service` on :4000, `documents-service` on
:4002) rather than a third-party API, so the examples double as a live
demonstration of the project. Full `curl -i` output (headers + body)
included for each.

---

### Request 1 — `POST /signup` (201 Created)
```
curl -i -X POST http://localhost:4001/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"carol@test.com","password":"hunter22","name":"Carol"}'
```
```
HTTP/1.1 201 Created
Location: /users/1
Content-Type: application/json; charset=utf-8
ETag: W/"100-nTI0ECFL1pAAw+bS86f9dBnZvrs"

{"id":"1","email":"carol@test.com","name":"Carol","token":"eyJhbGciOi..."}
```
**Notes:** `201 Created` because a new resource (the user) now exists.
`Location` points to where that resource can be fetched (`/users/1`).
`Content-Type: application/json` tells the client to parse the body as
JSON. The response body carries a JWT the client stores and reuses as a
bearer token on every subsequent request.

---

### Request 2 — `POST /rooms` (201 Created)
```
curl -i -X POST http://localhost:4000/rooms \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"name":"OS Lab Group"}'
```
```
HTTP/1.1 201 Created
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1791857294
Location: /rooms/3793150f-3617-45d9-bb46-189000cd34c6
ETag: "3793150f-3617-45d9-bb46-189000cd34c6-v1"
Content-Type: application/json; charset=utf-8

{"id":"3793150f-...","name":"OS Lab Group","ownerId":"1","isPrivate":false,
 "maxMembers":8,"members":[{"id":"1","name":"Carol","role":"owner"}],
 "docStatus":"ready","createdAt":"...","updatedAt":"..."}
```
**Notes:** Again `201` + `Location` for a newly created resource. The
`ETag` is a version fingerprint of this exact room state — any later `GET`
can send it back as `If-None-Match` to avoid re-downloading unchanged
data, and any later `PATCH`/`DELETE` must send it as `If-Match` so we
reject a stale/conflicting write (see Assignment 5). `X-RateLimit-*`
headers tell the client how many more requests it can make in the current
window before getting `429 Too Many Requests`.

---

### Request 3 — `GET /rooms/:id` (200 OK)
```
curl -i http://localhost:4000/rooms/3793150f-3617-45d9-bb46-189000cd34c6
```
```
HTTP/1.1 200 OK
ETag: "3793150f-3617-45d9-bb46-189000cd34c6-v1"
Cache-Control: private, max-age=0, must-revalidate
Content-Type: application/json; charset=utf-8

{"id":"3793150f-...","name":"OS Lab Group", ...}
```
**Notes:** `200 OK` — the resource exists and is returned as-is.
`Cache-Control: private, max-age=0, must-revalidate` tells any cache
(browser or intermediary) it may store this response but must check back
with the server (via the `ETag`) before reusing it — never serve it
blindly from cache, since room membership can change at any time.

---

### Request 4 — `GET /documents/:roomId` (200 OK)
```
curl -i http://localhost:4002/documents/3793150f-3617-45d9-bb46-189000cd34c6
```
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
ETag: W/"65-wb3ABsfYcALL4zlyi96uQFjKGZs"

{"roomId":"3793150f-...","content":"","updatedAt":"2026-10-13T02:07:17.313Z"}
```
**Notes:** This document was auto-created by `rooms-service`'s network
call to `documents-service` at room-creation time (Assignment 4, Part D),
which is why it already exists and returns `200` with empty `content`
rather than `404`. Express's default `ETag` (`W/"..."`, weak validator,
content-hash based) is distinct from `rooms-service`'s own hand-rolled,
version-number-based `ETag` — both are valid approaches; we use the
version-number style on Rooms because it also has to support `If-Match`
writes.

---

### Request 5 — `GET /rooms/:id` for an id that doesn't exist (404 Not Found)
```
curl -i http://localhost:4000/rooms/this-room-does-not-exist
```
```
HTTP/1.1 404 Not Found
Content-Type: application/problem+json; charset=utf-8

{"type":"https://collabcode.dev/errors/room-not-found",
 "title":"Room not found","status":404,
 "detail":"No room with id \"this-room-does-not-exist\"."}
```
**Notes:** `404 Not Found` — the server understood the request
perfectly but no resource exists at that path. `Content-Type:
application/problem+json` (RFC 9457) marks this as a structured machine-
readable error body rather than ordinary JSON data, so client code can
reliably branch on `type`/`status` instead of string-matching an error
message. This same `problem()` shape is used for every error response
across the whole system (see Assignment 6).
