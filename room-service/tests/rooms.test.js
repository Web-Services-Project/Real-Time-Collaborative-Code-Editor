const request = require('supertest');

// Stub fetch for both outbound calls (authClient -> auth-service, and
// documentsClient -> documents-service) so these tests run fast, offline,
// and deterministically — no other service needs to be running.
const VALID_TOKEN = 'valid-token-abc';
const OTHER_USER_TOKEN = 'valid-token-xyz';
const THIRD_USER_TOKEN = 'valid-token-qrs';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async (url, options = {}) => {
    const urlStr = String(url);

    if (urlStr.includes('/me')) {
      const auth = (options.headers && options.headers.Authorization) || '';
      if (auth === `Bearer ${VALID_TOKEN}`) {
        return jsonResponse(200, { id: 'user-1', email: 'alice@example.com', name: 'Alice' });
      }
      if (auth === `Bearer ${OTHER_USER_TOKEN}`) {
        return jsonResponse(200, { id: 'user-2', email: 'bob@example.com', name: 'Bob' });
      }
      if (auth === `Bearer ${THIRD_USER_TOKEN}`) {
        return jsonResponse(200, { id: 'user-3', email: 'carol@example.com', name: 'Carol' });
      }
      return jsonResponse(401, { title: 'Invalid token' });
    }

    if (urlStr.includes('/documents')) {
      return jsonResponse(201, { roomId: 'whatever', content: '', updatedAt: new Date().toISOString() });
    }

    throw new Error(`Unexpected fetch to ${urlStr}`);
  });
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// Re-require fresh each time so each test file's in-memory store starts clean.
function freshApp() {
  jest.resetModules();
  const store = require('../src/store');
  store._reset();
  return require('../src/app');
}

describe('rooms-service', () => {
  test('POST /rooms without a token is rejected with 401', async () => {
    const app = freshApp();
    const res = await request(app).post('/rooms').send({ name: 'Study Group' });
    expect(res.status).toBe(401);
    expect(res.body.type).toContain('missing-token');
  });

  test('POST /rooms with a valid token creates a room: 201, Location, ETag', async () => {
    const app = freshApp();
    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Study Group', maxMembers: 4 });

    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/^\/rooms\//);
    expect(res.headers.etag).toBeDefined();
    expect(res.body.name).toBe('Study Group');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ id: 'user-1', role: 'owner' });
  });

  test('POST /rooms with an invalid body returns 422 with field errors', async () => {
    const app = freshApp();
    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'ab' }); // below minLength: 3

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })])
    );
  });

  test('GET /rooms/:id supports conditional requests: 200 then 304 on matching If-None-Match', async () => {
    const app = freshApp();
    const create = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Study Group' });

    const id = create.body.id;
    const etag = create.headers.etag;

    const first = await request(app).get(`/rooms/${id}`);
    expect(first.status).toBe(200);
    expect(first.headers.etag).toBe(etag);

    const second = await request(app).get(`/rooms/${id}`).set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });

  test('GET /rooms/:id for an unknown id returns 404 with a problem body', async () => {
    const app = freshApp();
    const res = await request(app).get('/rooms/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.type).toContain('room-not-found');
    expect(res.body.status).toBe(404);
  });

  test('Idempotency-Key: repeating a create with the same key returns the same room, not a duplicate', async () => {
    const app = freshApp();
    const key = 'create-room-123';

    const first = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .set('Idempotency-Key', key)
      .send({ name: 'Study Group' });

    const second = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .set('Idempotency-Key', key)
      .send({ name: 'Study Group' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app).get('/rooms');
    expect(list.body.count).toBe(1); // only one room was actually created
  });

  test('joining a full room returns 422 (domain rejection), not 400', async () => {
    const app = freshApp();
    const create = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Tiny Room', maxMembers: 2 }); // owner (1) + one more (2) = full
    expect(create.status).toBe(201);

    const secondJoin = await request(app)
      .post(`/rooms/${create.body.id}/join`)
      .set('Authorization', `Bearer ${OTHER_USER_TOKEN}`);
    expect(secondJoin.status).toBe(200); // fills the room to capacity

    const thirdJoin = await request(app)
      .post(`/rooms/${create.body.id}/join`)
      .set('Authorization', `Bearer ${THIRD_USER_TOKEN}`);

    expect(thirdJoin.status).toBe(422);
    expect(thirdJoin.body.type).toContain('room-full');
  });

  test('PATCH without If-Match is rejected with 428; wrong If-Match is rejected with 412', async () => {
    const app = freshApp();
    const create = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Study Group' });
    const id = create.body.id;

    const noHeader = await request(app)
      .patch(`/rooms/${id}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'Renamed' });
    expect(noHeader.status).toBe(428);

    const staleEtag = await request(app)
      .patch(`/rooms/${id}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .set('If-Match', '"not-the-real-etag"')
      .send({ name: 'Renamed' });
    expect(staleEtag.status).toBe(412);

    const correct = await request(app)
      .patch(`/rooms/${id}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .set('If-Match', create.headers.etag)
      .send({ name: 'Renamed' });
    expect(correct.status).toBe(200);
    expect(correct.body.name).toBe('Renamed');
  });

  test('OPTIONS /rooms returns 204 with an Allow header', async () => {
    const app = freshApp();
    const res = await request(app).options('/rooms');
    expect(res.status).toBe(204);
    expect(res.headers.allow).toContain('POST');
  });

  test('unsupported method on /rooms returns 405 with an Allow header', async () => {
    const app = freshApp();
    const res = await request(app).delete('/rooms');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toContain('GET');
  });
});
