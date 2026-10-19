/**
 * Merge overlapping or touching [start, end] intervals. Returns a new sorted array.
 * @param {[number, number][]} intervals
 * @returns {[number, number][]}
 */
export function mergeIntervals(intervals) {
  const sorted = intervals
    .map(([start, end]) => [start, end])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}
