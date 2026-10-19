import { mulberry32 } from "../util/prng.js";

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Paired sign-flip permutation test on per-task differences (two-sided).
 * Under "no effect" each difference is equally likely to be positive or negative.
 * Exact enumeration up to 16 tasks, Monte Carlo above that.
 */
export function signFlipTest(d: number[], seed = 1, iters = 20_000): number {
  const n = d.length;
  if (n === 0) return 1;
  const obs = Math.abs(d.reduce((s, x) => s + x, 0));
  if (obs < 1e-12) return 1;
  const eps = 1e-9 * Math.max(1, obs);
  if (n <= 16) {
    const total = 1 << n;
    let count = 0;
    for (let mask = 0; mask < total; mask++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += mask & (1 << i) ? -d[i]! : d[i]!;
      if (Math.abs(s) >= obs - eps) count++;
    }
    return count / total;
  }
  const rand = mulberry32(seed);
  let count = 0;
  for (let k = 0; k < iters; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rand() < 0.5 ? -d[i]! : d[i]!;
    if (Math.abs(s) >= obs - eps) count++;
  }
  return (count + 1) / (iters + 1);
}

/**
 * Confidence interval for the mean shift, found by inverting the sign-flip test:
 * the interval holds every shift δ for which "the true mean difference is δ" is not rejected.
 * The interval and the p-value therefore always agree: p < alpha exactly when 0 is outside.
 * With very few tasks the test cannot reject anything; the bound then falls back to the data range.
 */
export function permutationCI(
  d: number[],
  alpha = 0.05,
  seed = 1,
  iters = 4_000,
): [number, number] {
  const n = d.length;
  if (n === 0) return [Number.NaN, Number.NaN];
  const m = mean(d);
  const min = Math.min(...d);
  const max = Math.max(...d);
  const spread = Math.max(max - min, Math.abs(m), 1e-9);
  const p = (delta: number) =>
    signFlipTest(
      d.map((x) => x - delta),
      seed,
      iters,
    );
  const bound = (dir: -1 | 1): number => {
    let inside = m;
    let outside = m + dir * spread * 2;
    if (p(outside) >= alpha) return dir < 0 ? min : max;
    for (let i = 0; i < 40; i++) {
      const mid = (inside + outside) / 2;
      if (p(mid) >= alpha) inside = mid;
      else outside = mid;
    }
    return inside;
  };
  return [bound(-1), bound(1)];
}

/** Percentile bootstrap confidence interval for the mean, resampling tasks. */
export function bootstrapMeanCI(
  d: number[],
  alpha = 0.05,
  iters = 5_000,
  seed = 1,
): [number, number] {
  const n = d.length;
  if (n === 0) return [Number.NaN, Number.NaN];
  if (n === 1) return [d[0]!, d[0]!];
  const rand = mulberry32(seed);
  const means = new Float64Array(iters);
  for (let k = 0; k < iters; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)]!;
    means[k] = s / n;
  }
  means.sort();
  const lo = means[Math.floor((alpha / 2) * iters)]!;
  const hi = means[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)]!;
  return [lo, hi];
}

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** Exact McNemar test: b = control passed and treatment failed, c = the reverse. */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * p);
}

/** Standard normal CDF (Abramowitz and Stegun 26.2.17, error below 7.5e-8). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? 1 - tail : tail;
}

/** Wilcoxon signed-rank test (two-sided). Exact without ties up to n = 30, normal approximation otherwise. */
export function wilcoxonSignedRank(d: number[]): { wPlus: number; n: number; p: number } {
  const nz = d.filter((x) => Math.abs(x) > 1e-12);
  const n = nz.length;
  if (n === 0) return { wPlus: 0, n: 0, p: 1 };
  const order = nz
    .map((x, i) => ({ a: Math.abs(x), s: Math.sign(x), i }))
    .sort((p, q) => p.a - q.a);
  const ranks = new Array<number>(n);
  let ties = false;
  let tieCorrection = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && Math.abs(order[j + 1]!.a - order[i]!.a) < 1e-12) j++;
    const r = (i + j + 2) / 2;
    const t = j - i + 1;
    if (t > 1) {
      ties = true;
      tieCorrection += t ** 3 - t;
    }
    for (let k = i; k <= j; k++) ranks[k] = r;
    i = j + 1;
  }
  let wPlus = 0;
  for (let k = 0; k < n; k++) if (order[k]!.s > 0) wPlus += ranks[k]!;
  const maxW = (n * (n + 1)) / 2;
  if (!ties && n <= 30) {
    // counts[s] = number of subsets of {1..n} with rank sum s
    const counts = new Float64Array(maxW + 1);
    counts[0] = 1;
    for (let r = 1; r <= n; r++) for (let s = maxW; s >= r; s--) counts[s]! += counts[s - r]!;
    const total = 2 ** n;
    const w = Math.round(wPlus);
    let lower = 0;
    for (let s = 0; s <= w; s++) lower += counts[s]!;
    let upper = 0;
    for (let s = w; s <= maxW; s++) upper += counts[s]!;
    return { wPlus, n, p: Math.min(1, (2 * Math.min(lower, upper)) / total) };
  }
  const mu = maxW / 2;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection / 48;
  if (variance <= 0) return { wPlus, n, p: 1 };
  const diff = wPlus - mu;
  const z = (Math.abs(diff) - 0.5) / Math.sqrt(variance);
  return { wPlus, n, p: Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))) };
}

/** Wilson score interval for a single proportion. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
