// Every error response in this service goes through here, so the shape is
// always the same: { type, title, status, detail, errors? }. type is a stable
// catalogue of slugs a client can switch on — never an internal message or a
// stack trace, which never make it into this file at all.
function problem(res, { type, title, status, detail, errors }) {
  const body = {
    type: `https://collabcode.dev/errors/${type}`,
    title,
    status,
    detail,
  };
  if (errors) body.errors = errors;
  return res.status(status).type('application/problem+json').json(body);
}

module.exports = { problem };
