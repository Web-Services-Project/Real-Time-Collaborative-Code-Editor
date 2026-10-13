// In-memory store — swap for the Postgres schema in docs/design.md when you
// wire up a real database. No other service (and no route handler outside
// this file) should reach into these Maps directly.
const rooms = new Map(); // id -> room
const idempotencyCache = new Map(); // Idempotency-Key -> { status, headers, body }

function save(room) {
  rooms.set(room.id, room);
  return room;
}

function findById(id) {
  return rooms.get(id) || null;
}

function list() {
  return Array.from(rooms.values());
}

function remove(id) {
  return rooms.delete(id);
}

function getIdempotent(key) {
  return idempotencyCache.get(key) || null;
}

function putIdempotent(key, value) {
  idempotencyCache.set(key, value);
}

// Test-only: wipe state between test files/suites.
function _reset() {
  rooms.clear();
  idempotencyCache.clear();
}

module.exports = { save, findById, list, remove, getIdempotent, putIdempotent, _reset };
