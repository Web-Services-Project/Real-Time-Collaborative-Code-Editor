// Rooms calls Auth to turn a bearer token into a user. This is the first leg
// of the joinRoom cross-service call described in docs/design.md.
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';

async function verifyToken(token) {
  const res = await fetch(`${AUTH_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { verifyToken };
