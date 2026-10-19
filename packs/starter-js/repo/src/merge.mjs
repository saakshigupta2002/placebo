/**
 * Deep-merge plain objects. Later sources win.
 * @param {object} target
 * @param  {...object} sources
 */
export function deepMerge(target, ...sources) {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (value && typeof value === "object") {
        target[key] = deepMerge(target[key] || {}, value);
      } else {
        target[key] = value;
      }
    }
  }
  return target;
}
