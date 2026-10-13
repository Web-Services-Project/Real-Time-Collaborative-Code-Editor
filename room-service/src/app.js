const express = require('express');
const cors = require('cors');

const store = require('./store');
const { problem } = require('./errors');
const { validate, createRoomSchema, patchRoomSchema } = require('./validate');
const { createRoomModel, etagFor, toPublicJSON } = require('./models');
const { verifyToken } = require('./authClient');
const { createRoomDocument } = require('./documentsClient');
const { rateLimiter } = require('./rateLimiter');
const { roomToXML } = require('./xml');

const PORT = process.env.PORT || 4000;

const app = express();
// preflightContinue: true — otherwise the cors package answers every OPTIONS
// request itself (204, no body) before it ever reaches our own OPTIONS
// handlers below, so our Allow header never gets set.
app.use(cors({ preflightContinue: true }));
app.use(express.json());
app.use(rateLimiter);

// ---- auth middleware --------------------------------------------------
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return problem(res, {
      type: 'missing-token',
      title: 'Missing bearer token',
      status: 401,
      detail: 'Provide an Authorization: Bearer <token> header.',
    });
  }
  const user = await verifyToken(token);
  if (!user) {
    return problem(res, {
      type: 'invalid-token',
      title: 'Invalid or expired token',
      status: 401,
      detail: 'Log in again to get a new token.',
    });
  }
  req.user = user;
  next();
}

// ---- handlers -----------------------------------------------------------

function listRooms(req, res) {
  const all = store.list().filter((r) => !r.isPrivate).map(toPublicJSON);
  res.set('Cache-Control', 'no-store'); // listing changes too often to cache
  res.json({ rooms: all, count: all.length });
}

async function createRoom(req, res) {
  const idemKey = req.headers['idempotency-key'];
  if (idemKey) {
    const cached = store.getIdempotent(idemKey);
    if (cached) {
      return res.status(cached.status).set(cached.headers).json(cached.body);
    }
  }

  const errors = validate(createRoomSchema, req.body || {});
  if (errors.length) {
    return problem(res, {
      type: 'validation-error',
      title: 'Validation failed',
      status: 422,
      detail: 'One or more fields are invalid.',
      errors,
    });
  }

  const room = createRoomModel({
    name: req.body.name,
    ownerId: req.user.id,
    ownerName: req.user.name,
    isPrivate: !!req.body.isPrivate,
    maxMembers: req.body.maxMembers || 8,
  });
  store.save(room);

  // Cross-service call with its own timeout/retry/fallback — see documentsClient.js.
  const docResult = await createRoomDocument(room.id);
  room.docStatus = docResult.ok ? 'ready' : 'pending';
  store.save(room);

  const body = toPublicJSON(room);
  const headers = { Location: `/rooms/${room.id}`, ETag: etagFor(room) };
  if (idemKey) store.putIdempotent(idemKey, { status: 201, headers, body });

  res.status(201).set(headers).json(body);
}

function getRoom(req, res) {
  const room = store.findById(req.params.id);
  if (!room) {
    return problem(res, {
      type: 'room-not-found',
      title: 'Room not found',
      status: 404,
      detail: `No room with id "${req.params.id}".`,
    });
  }

  const etag = etagFor(room);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).set('ETag', etag).end();
  }

  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  const body = toPublicJSON(room);

  if ((req.headers.accept || '').includes('application/xml')) {
    return res.type('application/xml').send(roomToXML(body));
  }
  res.json(body);
}

function patchRoom(req, res) {
  const room = store.findById(req.params.id);
  if (!room) {
    return problem(res, {
      type: 'room-not-found',
      title: 'Room not found',
      status: 404,
      detail: `No room with id "${req.params.id}".`,
    });
  }
  if (room.ownerId !== req.user.id) {
    return problem(res, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Only the room owner can update this room.',
    });
  }

  const ifMatch = req.headers['if-match'];
  const currentEtag = etagFor(room);
  if (!ifMatch) {
    return problem(res, {
      type: 'precondition-required',
      title: 'If-Match header required',
      status: 428,
      detail: 'Include If-Match: <etag> (from a prior GET) to update this room safely.',
    });
  }
  if (ifMatch !== currentEtag) {
    return problem(res, {
      type: 'precondition-failed',
      title: 'Precondition failed',
      status: 412,
      detail: 'The room changed since you last fetched it. GET it again and retry.',
    });
  }

  const errors = validate(patchRoomSchema, req.body || {});
  if (errors.length) {
    return problem(res, {
      type: 'validation-error',
      title: 'Validation failed',
      status: 422,
      detail: 'One or more fields are invalid.',
      errors,
    });
  }

  if (req.body.name !== undefined) room.name = req.body.name;
  if (req.body.maxMembers !== undefined) room.maxMembers = req.body.maxMembers;
  room.updatedAt = new Date().toISOString();
  room.version += 1;
  store.save(room);

  res.set('ETag', etagFor(room)).json(toPublicJSON(room));
}

function deleteRoom(req, res) {
  const room = store.findById(req.params.id);
  if (!room) {
    return problem(res, {
      type: 'room-not-found',
      title: 'Room not found',
      status: 404,
      detail: `No room with id "${req.params.id}".`,
    });
  }
  if (room.ownerId !== req.user.id) {
    return problem(res, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Only the room owner can delete this room.',
    });
  }
  store.remove(room.id);
  res.status(204).end();
}

// joinRoom is the service's central/richest operation: it's the one other
// services (Auth, via requireAuth; Documents, indirectly via docStatus) feed
// into, and the one most likely to be asked about in viva.
function joinRoom(req, res) {
  const room = store.findById(req.params.id);
  if (!room) {
    return problem(res, {
      type: 'room-not-found',
      title: 'Room not found',
      status: 404,
      detail: `No room with id "${req.params.id}".`,
    });
  }

  const already = room.members.find((m) => m.id === req.user.id);
  if (already) {
    // Joining a room you're already in is a no-op, not an error — keeps the
    // endpoint safely retryable.
    return res.status(200).set('ETag', etagFor(room)).json(toPublicJSON(room));
  }
  if (room.members.length >= room.maxMembers) {
    // Well-formed request, rejected by a domain rule -> 422, not 400.
    return problem(res, {
      type: 'room-full',
      title: 'Room is full',
      status: 422,
      detail: `Room "${room.name}" already has its maximum of ${room.maxMembers} members.`,
    });
  }

  room.members.push({ id: req.user.id, name: req.user.name, role: 'editor' });
  room.updatedAt = new Date().toISOString();
  room.version += 1;
  store.save(room);

  res.status(200).set('ETag', etagFor(room)).json(toPublicJSON(room));
}

function leaveRoom(req, res) {
  const room = store.findById(req.params.id);
  if (!room) {
    return problem(res, {
      type: 'room-not-found',
      title: 'Room not found',
      status: 404,
      detail: `No room with id "${req.params.id}".`,
    });
  }
  room.members = room.members.filter((m) => m.id !== req.user.id);
  room.updatedAt = new Date().toISOString();
  room.version += 1;
  store.save(room);
  res.status(200).set('ETag', etagFor(room)).json(toPublicJSON(room));
}

// ---- routes ---------------------------------------------------------------
// Sub-resource actions declared first so they're matched before the generic
// /rooms/:id router below.
app.post('/rooms/:id/join', requireAuth, joinRoom);
app.post('/rooms/:id/leave', requireAuth, leaveRoom);

const roomsRouter = express.Router();
roomsRouter.get('/', listRooms);
roomsRouter.post('/', requireAuth, createRoom);
roomsRouter.options('/', (req, res) => res.set('Allow', 'GET, POST, OPTIONS').status(204).end());
roomsRouter.all('/', (req, res) => {
  res.set('Allow', 'GET, POST, OPTIONS');
  return problem(res, {
    type: 'method-not-allowed',
    title: 'Method not allowed',
    status: 405,
    detail: `${req.method} is not supported on /rooms.`,
  });
});
app.use('/rooms', roomsRouter);

const roomRouter = express.Router({ mergeParams: true });
roomRouter.get('/', getRoom);
roomRouter.patch('/', requireAuth, patchRoom);
roomRouter.delete('/', requireAuth, deleteRoom);
roomRouter.options('/', (req, res) => res.set('Allow', 'GET, PATCH, DELETE, OPTIONS').status(204).end());
roomRouter.all('/', (req, res) => {
  res.set('Allow', 'GET, PATCH, DELETE, OPTIONS');
  return problem(res, {
    type: 'method-not-allowed',
    title: 'Method not allowed',
    status: 405,
    detail: `${req.method} is not supported on /rooms/:id.`,
  });
});
app.use('/rooms/:id', roomRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'rooms-service' }));

// ---- 404 + error fallbacks ------------------------------------------------
app.use((req, res) => {
  problem(res, {
    type: 'not-found',
    title: 'Not found',
    status: 404,
    detail: `No route for ${req.method} ${req.path}.`,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err); // internals stay server-side; the client never sees err.message/stack
  problem(res, {
    type: 'internal-error',
    title: 'Internal server error',
    status: 500,
    detail: 'Something went wrong on our end. Please try again.',
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`rooms-service listening on :${PORT}`));
}

module.exports = app;
