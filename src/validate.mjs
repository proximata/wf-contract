// Minimal JSON Schema subset validator. THE only copy — schemas/check.mjs and eval/ both import it.
// ponytail: covers exactly the keywords the six shapes use
// (type/enum/required/properties/items/minItems/minLength/maxLength/additionalProperties:false).
// Ceiling: any other keyword is silently ignored. Upgrade path is a real validator, but D27
// keeps acorn the only dependency and the CLI never validates instances at all (pi's
// structured_output does). This exists to keep the six files and the eval scorer honest.
export function validate(schema, val, path = '$', errs = []) {
  const t = schema.type;
  const is = (x) => (Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val) === x;
  if (t && !is(t)) return errs.push(`${path}: expected ${t}`), errs;
  if (schema.enum && !schema.enum.includes(val)) errs.push(`${path}: not in enum ${schema.enum.join('|')}`);
  if (t === 'string') {
    if (schema.minLength != null && val.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength != null && val.length > schema.maxLength) errs.push(`${path}: longer than ${schema.maxLength}`);
  }
  if (t === 'array') {
    if (schema.minItems != null && val.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.items) val.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errs));
  }
  if (t === 'object') {
    for (const k of schema.required ?? []) if (!(k in val)) errs.push(`${path}.${k}: required, missing`);
    for (const [k, v] of Object.entries(val)) {
      const sub = schema.properties?.[k];
      if (!sub) {
        if (schema.additionalProperties === false) errs.push(`${path}.${k}: additional property`);
        continue;
      }
      validate(sub, v, `${path}.${k}`, errs);
    }
  }
  return errs;
}
