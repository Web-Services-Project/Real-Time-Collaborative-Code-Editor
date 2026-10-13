// In-memory user store. No other service touches this directly —
// everything goes through the HTTP API in app.js.
const users = new Map(); // email -> { id, email, name, passwordHash }
let nextId = 1;

function createUser({ email, name, passwordHash }) {
  const user = { id: String(nextId++), email, name, passwordHash };
  users.set(email, user);
  return user;
}

function findByEmail(email) {
  return users.get(email) || null;
}

function findById(id) {
  for (const u of users.values()) if (u.id === id) return u;
  return null;
}

module.exports = { createUser, findByEmail, findById };
