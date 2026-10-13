// Assignment 4, Part D: Rooms -> Documents over HTTP, with a timeout, a
// bounded retry with exponential backoff + jitter, and a fallback so a slow
// or dead Documents service never blocks room creation outright.
const DOCS_URL = process.env.DOCUMENTS_SERVICE_URL || 'http://localhost:4002';
const TIMEOUT_MS = Number(process.env.DOCS_TIMEOUT_MS || 1500);
const MAX_RETRIES = Number(process.env.DOCS_MAX_RETRIES || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 200ms, 400ms, 800ms... plus up to 100ms of jitter so a burst of failing
// requests doesn't all retry in lockstep and hammer Documents at once.
function backoffDelay(attempt) {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.random() * 100;
  return base + jitter;
}

async function createRoomDocument(roomId) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${DOCS_URL}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, initialContent: '' }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return { ok: true, data: await res.json() };
      }
      // A 4xx means Documents rejected what we sent — retrying the same
      // body will fail the same way, so we stop immediately instead of
      // wasting attempts.
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, retried: false };
      }
      lastError = new Error(`documents-service responded ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err; // timeout (AbortError) or network failure — both retryable
    }

    if (attempt <= MAX_RETRIES) {
      await sleep(backoffDelay(attempt));
    }
  }

  // Exhausted retries: fall back rather than fail the whole create-room
  // request. The room is still created with docStatus: 'pending'; the UI
  // can show "setting up your document..." and retry later.
  return { ok: false, error: lastError ? lastError.message : 'unknown error', fallback: true };
}

module.exports = { createRoomDocument };
