const decode = (s) => decodeURIComponent(s.replace(/\+/g, " "));

/** Parse a URL query string into an object. Repeated keys become arrays. */
export function parseQuery(qs) {
  const out = {};
  const s = qs.startsWith("?") ? qs.slice(1) : qs;
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const key = decode(i === -1 ? part : part.slice(0, i));
    const value = i === -1 ? "" : decode(part.slice(i + 1));
    if (Object.hasOwn(out, key)) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Build a URL query string from an object. Keys are sorted, arrays repeat the key. */
export function stringifyQuery(obj) {
  const parts = [];
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join("&");
}
