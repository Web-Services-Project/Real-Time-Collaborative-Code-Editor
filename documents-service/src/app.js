const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 4002;

const app = express();
app.use(cors());
app.use(express.json());

// roomId -> { content, updatedAt }
const documents = new Map();

// Dev-only chaos knobs so rooms-service's timeout/retry/fallback logic
// (Assignment 4, Part D) has something real to exercise.
//   FAIL_RATE=0.5   -> 50% of requests get a 503
//   SLOW_MS=2000    -> every request is delayed this many ms
const FAIL_RATE = Number(process.env.FAIL_RATE || 0);
const SLOW_MS = Number(process.env.SLOW_MS || 0);

app.use((req, res, next) => {
  const delay = SLOW_MS > 0 ? SLOW_MS : 0;
  setTimeout(() => {
    if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) {
      return res.status(503).json({
        type: 'https://collabcode.dev/errors/temporarily-unavailable',
        title: 'Documents service temporarily unavailable',
        status: 503,
        detail: 'Simulated outage for demo purposes.',
      });
    }
    next();
  }, delay);
});

// POST /documents — create an (empty) document for a room
app.post('/documents', (req, res) => {
  const { roomId, initialContent } = req.body || {};
  if (!roomId) {
    return res.status(400).json({
      type: 'https://collabcode.dev/errors/bad-request',
      title: 'Malformed request',
      status: 400,
      detail: 'roomId is required.',
    });
  }
  const doc = { content: initialContent || '', updatedAt: new Date().toISOString() };
  documents.set(roomId, doc);
  res.status(201).location(`/documents/${roomId}`).json({ roomId, ...doc });
});

// GET /documents/:roomId
app.get('/documents/:roomId', (req, res) => {
  const doc = documents.get(req.params.roomId);
  if (!doc) {
    return res.status(404).json({
      type: 'https://collabcode.dev/errors/document-not-found',
      title: 'Document not found',
      status: 404,
      detail: `No document exists for room "${req.params.roomId}".`,
    });
  }
  res.json({ roomId: req.params.roomId, ...doc });
});

// PUT /documents/:roomId — save the latest content
app.put('/documents/:roomId', (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({
      type: 'https://collabcode.dev/errors/bad-request',
      title: 'Malformed request',
      status: 400,
      detail: 'content must be a string.',
    });
  }
  const doc = { content, updatedAt: new Date().toISOString() };
  documents.set(req.params.roomId, doc);
  res.json({ roomId: req.params.roomId, ...doc });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'documents-service' }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`documents-service listening on :${PORT}`));
}

module.exports = app;
