const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('./store');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 4001;

const app = express();
app.use(cors());
app.use(express.json());

function problem({ type, title, status, detail, errors }) {
  const body = { type, title, status, detail };
  if (errors) body.errors = errors;
  return body;
}

// POST /signup — create an account
app.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  const fieldErrors = [];
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    fieldErrors.push({ field: 'email', message: 'must be a valid email address' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    fieldErrors.push({ field: 'password', message: 'must be at least 6 characters' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    fieldErrors.push({ field: 'name', message: 'is required' });
  }
  if (fieldErrors.length) {
    return res.status(422).json(problem({
      type: 'https://collabcode.dev/errors/validation-error',
      title: 'Validation failed',
      status: 422,
      detail: 'One or more fields are invalid.',
      errors: fieldErrors,
    }));
  }

  if (store.findByEmail(email)) {
    return res.status(409).json(problem({
      type: 'https://collabcode.dev/errors/email-taken',
      title: 'Email already registered',
      status: 409,
      detail: `An account with email "${email}" already exists.`,
    }));
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser({ email, name, passwordHash });
  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '12h' });

  res.status(201)
    .location(`/users/${user.id}`)
    .json({ id: user.id, email: user.email, name: user.name, token });
});

// POST /login — exchange credentials for a JWT
app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json(problem({
      type: 'https://collabcode.dev/errors/bad-request',
      title: 'Malformed request',
      status: 400,
      detail: 'email and password are both required.',
    }));
  }

  const user = store.findByEmail(email);
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    return res.status(401).json(problem({
      type: 'https://collabcode.dev/errors/invalid-credentials',
      title: 'Invalid credentials',
      status: 401,
      detail: 'Email or password is incorrect.',
    }));
  }

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
  res.status(200).json({ id: user.id, email: user.email, name: user.name, token });
});

// GET /me — verify a token, used by rooms-service's joinRoom call
app.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json(problem({
      type: 'https://collabcode.dev/errors/missing-token',
      title: 'Missing bearer token',
      status: 401,
      detail: 'Provide an Authorization: Bearer <token> header.',
    }));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ id: payload.sub, email: payload.email, name: payload.name });
  } catch {
    res.status(401).json(problem({
      type: 'https://collabcode.dev/errors/invalid-token',
      title: 'Invalid or expired token',
      status: 401,
      detail: 'Log in again to get a new token.',
    }));
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));
}

module.exports = app;
