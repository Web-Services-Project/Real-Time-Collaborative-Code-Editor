// Small hand-rolled validator — enough for this service's request bodies
// without pulling in a full JSON Schema library. Returns an array of
// { field, message } objects (empty array = valid), the shape A6's 422
// response puts straight into its `errors` field.
function validate(schema, data) {
  const errors = [];
  const body = data || {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];
    const missing = value === undefined || value === null || value === '';

    if (rules.required && missing) {
      errors.push({ field, message: 'is required' });
      continue;
    }
    if (missing) continue; // optional and absent — nothing further to check

    if (rules.type && typeof value !== rules.type) {
      errors.push({ field, message: `must be of type ${rules.type}` });
      continue;
    }
    if (rules.minLength !== undefined && String(value).length < rules.minLength) {
      errors.push({ field, message: `must be at least ${rules.minLength} characters` });
    }
    if (rules.maxLength !== undefined && String(value).length > rules.maxLength) {
      errors.push({ field, message: `must be at most ${rules.maxLength} characters` });
    }
    if (rules.minimum !== undefined && value < rules.minimum) {
      errors.push({ field, message: `must be >= ${rules.minimum}` });
    }
    if (rules.maximum !== undefined && value > rules.maximum) {
      errors.push({ field, message: `must be <= ${rules.maximum}` });
    }
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field, message: `must be one of: ${rules.enum.join(', ')}` });
    }
  }
  return errors;
}

const createRoomSchema = {
  name: { required: true, type: 'string', minLength: 3, maxLength: 60 },
  isPrivate: { type: 'boolean' },
  maxMembers: { type: 'number', minimum: 2, maximum: 20 },
};

const patchRoomSchema = {
  name: { type: 'string', minLength: 3, maxLength: 60 },
  maxMembers: { type: 'number', minimum: 2, maximum: 20 },
};

module.exports = { validate, createRoomSchema, patchRoomSchema };
