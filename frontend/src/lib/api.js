// Thin fetch wrappers around the three REST services. Every function throws
// on a non-2xx response with the server's `detail`/`title` message attached,
// so callers can just try/catch and show err.message.
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'http://localhost:4001';
const ROOMS_URL = import.meta.env.VITE_ROOMS_URL || 'http://localhost:4000';
const DOCS_URL = import.meta.env.VITE_DOCS_URL || 'http://localhost:4002';
export const COLLAB_URL = import.meta.env.VITE_COLLAB_URL || 'http://localhost:4003';

async function parseOrThrow(res) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && (data.detail || data.title)) || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function signup({ email, password, name }) {
  return fetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  }).then(parseOrThrow);
}

export function login({ email, password }) {
  return fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(parseOrThrow);
}

export function listRooms() {
  return fetch(`${ROOMS_URL}/rooms`).then(parseOrThrow);
}

export function createRoom(token, { name, maxMembers, isPrivate }) {
  return fetch(`${ROOMS_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, maxMembers, isPrivate }),
  }).then(parseOrThrow);
}

export function getRoom(id) {
  return fetch(`${ROOMS_URL}/rooms/${id}`).then(parseOrThrow);
}

export function joinRoom(token, id) {
  return fetch(`${ROOMS_URL}/rooms/${id}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then(parseOrThrow);
}

export function leaveRoom(token, id) {
  return fetch(`${ROOMS_URL}/rooms/${id}/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then(parseOrThrow);
}

export async function fetchDocument(roomId) {
  const res = await fetch(`${DOCS_URL}/documents/${roomId}`);
  if (res.status === 404) return { content: '' };
  return parseOrThrow(res);
}
