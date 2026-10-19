const VERSION =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parse(v) {
  const m = typeof v === "string" ? v.match(VERSION) : null;
  if (!m) throw new TypeError(`invalid version: ${v}`);
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

function compareIdentifiers(x, y) {
  const nx = /^\d+$/.test(x);
  const ny = /^\d+$/.test(y);
  if (nx && ny) return Number(x) === Number(y) ? 0 : Number(x) < Number(y) ? -1 : 1;
  if (nx) return -1;
  if (ny) return 1;
  return x === y ? 0 : x < y ? -1 : 1;
}

/**
 * Compare two semantic versions.
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] < B.nums[i] ? -1 : 1;
  }
  if (!A.pre.length && !B.pre.length) return 0;
  if (!A.pre.length) return 1;
  if (!B.pre.length) return -1;
  const n = Math.max(A.pre.length, B.pre.length);
  for (let i = 0; i < n; i++) {
    if (A.pre[i] === undefined) return -1;
    if (B.pre[i] === undefined) return 1;
    const c = compareIdentifiers(A.pre[i], B.pre[i]);
    if (c !== 0) return c;
  }
  return 0;
}
