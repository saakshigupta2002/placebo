const UNITS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Parse a human duration such as "1h30m" or "250ms" into milliseconds.
 * @param {string} input
 * @returns {number}
 */
export function parseDuration(input) {
  if (typeof input !== "string") throw new TypeError("duration must be a string");
  const text = input.trim();
  if (!text) throw new TypeError("empty duration");
  const part = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\s*/y;
  let total = 0;
  let pos = 0;
  while (pos < text.length) {
    part.lastIndex = pos;
    const m = part.exec(text);
    if (!m) throw new TypeError(`cannot parse duration: ${input}`);
    total += Number(m[1]) * UNITS[m[2]];
    pos = part.lastIndex;
  }
  return Math.round(total);
}
