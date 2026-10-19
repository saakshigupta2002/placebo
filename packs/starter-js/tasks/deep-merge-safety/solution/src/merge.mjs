const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge plain objects into a new object. Later sources win.
 * Arrays and other non-plain values replace. Inputs are never mutated.
 * @param {object} target
 * @param  {...object} sources
 */
export function deepMerge(target, ...sources) {
  const out = {};
  for (const source of [target, ...sources]) {
    if (!isPlainObject(source)) continue;
    for (const key of Object.keys(source)) {
      if (BLOCKED.has(key)) continue;
      const value = source[key];
      out[key] = isPlainObject(value)
        ? deepMerge(isPlainObject(out[key]) ? out[key] : {}, value)
        : value;
    }
  }
  return out;
}
