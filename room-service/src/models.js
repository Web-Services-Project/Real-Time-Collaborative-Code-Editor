const crypto = require('crypto');

function createRoomModel({ name, ownerId, ownerName, isPrivate = false, maxMembers = 8 }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    ownerId,
    isPrivate,
    maxMembers,
    members: [{ id: ownerId, name: ownerName, role: 'owner' }],
    docStatus: 'pending', // flipped to 'ready' once documents-service confirms
    createdAt: now,
    updatedAt: now,
    version: 1, // bumped on every write; backs the ETag
  };
}

// Weak-ish but good enough identity tag: resource id + its write version.
// Changes exactly when the resource's observable state changes.
function etagFor(room) {
  return `"${room.id}-v${room.version}"`;
}

// Never leak internal fields (nothing sensitive here yet, but this is the
// single seam every response goes through, same idea as a real as_json()).
function toPublicJSON(room) {
  const { id, name, ownerId, isPrivate, maxMembers, members, docStatus, createdAt, updatedAt } = room;
  return { id, name, ownerId, isPrivate, maxMembers, members, docStatus, createdAt, updatedAt };
}

module.exports = { createRoomModel, etagFor, toPublicJSON };
