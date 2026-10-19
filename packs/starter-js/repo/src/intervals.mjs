/**
 * Merge overlapping [start, end] intervals.
 * @param {[number, number][]} intervals
 * @returns {[number, number][]}
 */
export function mergeIntervals(intervals) {
  const out = [];
  for (const [start, end] of intervals) {
    const last = out[out.length - 1];
    if (last && start < last[1]) {
      last[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out;
}
