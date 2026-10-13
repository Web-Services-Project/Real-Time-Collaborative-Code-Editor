// Minimal hand-rolled XML serializer, just so GET /rooms/:id can honor
// Accept: application/xml and demonstrate real content negotiation (A5-B)
// without pulling in a dependency for one demo endpoint.
function esc(value) {
  return String(value).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function fieldToXML(key, value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => `<item>${objectToXML(item)}</item>`).join('');
    return `<${key}>${items}</${key}>`;
  }
  if (value && typeof value === 'object') {
    return `<${key}>${objectToXML(value)}</${key}>`;
  }
  return `<${key}>${esc(value)}</${key}>`;
}

function objectToXML(obj) {
  return Object.entries(obj).map(([k, v]) => fieldToXML(k, v)).join('');
}

function roomToXML(room) {
  return `<?xml version="1.0" encoding="UTF-8"?><room>${objectToXML(room)}</room>`;
}

module.exports = { roomToXML };
