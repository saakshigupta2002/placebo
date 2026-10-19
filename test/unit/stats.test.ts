import { describe, expect, it } from "vitest";
import {
  bootstrapMeanCI,
  mcnemarExact,
  mean,
  normalCdf,
  permutationCI,
  signFlipTest,
  wilcoxonSignedRank,
  wilson,
} from "../../src/stats/core.js";
import { mulberry32 } from "../../src/util/prng.js";

/** Brute-force two-sided sign-flip p-value, for checking the fast version. */
function bruteSignFlip(d: number[]): number {
  const obs = Math.abs(d.reduce((s, x) => s + x, 0));
  let count = 0;
  const total = 2 ** d.length;
  for (let mask = 0; mask < total; mask++) {
    const s = d.reduce((acc, x, i) => acc + (mask & (1 << i) ? -x : x), 0);
    if (Math.abs(s) >= obs - 1e-9) count++;
  }
  return count / total;
}

/** Brute-force exact Wilcoxon p-value by enumerating sign assignments of the ranks. */
function bruteWilcoxon(d: number[]): number {
  const nz = d.filter((x) => x !== 0);
  const order = nz.map((x, i) => ({ a: Math.abs(x), i })).sort((p, q) => p.a - q.a);
  const rank = new Map<number, number>();
  for (const [k, o] of order.entries()) rank.set(o.i, k + 1);
  const w = nz.reduce((s, x, i) => s + (x > 0 ? rank.get(i)! : 0), 0);
  const n = nz.length;
  let lower = 0;
  let upper = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {
    let s = 0;
    for (let k = 0; k < n; k++) if (mask & (1 << k)) s += k + 1;
    if (s <= w) lower++;
    if (s >= w) upper++;
  }
  return Math.min(1, (2 * Math.min(lower, upper)) / 2 ** n);
}

describe("sign-flip permutation test", () => {
  it("matches hand-computed values", () => {
    expect(signFlipTest([1, 1, 1])).toBeCloseTo(2 / 8, 12);
    expect(signFlipTest([1, 2, 3, 4, 5, 6])).toBeCloseTo(2 / 64, 12);
    expect(signFlipTest([0, 0, 0])).toBe(1);
    expect(signFlipTest([])).toBe(1);
  });

  it("matches brute force on random vectors", () => {
    const rand = mulberry32(42);
    for (let trial = 0; trial < 25; trial++) {
      const n = 3 + Math.floor(rand() * 9);
      const d = Array.from({ length: n }, () => Math.round((rand() - 0.4) * 10) / 2);
      expect(signFlipTest(d)).toBeCloseTo(bruteSignFlip(d), 10);
    }
  });

  it("uses a calibrated Monte Carlo estimate above 16 tasks", () => {
    const d = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? -1 : 1));
    const p = signFlipTest(d, 7, 40_000);
    // Exact two-sided p for sum = 10 of 30 ±1 values: P(|S| >= 10) = P(heads <= 10 or >= 20).
    let tail = 0;
    let c = 1;
    for (let k = 0; k <= 10; k++) {
      tail += c;
      c = (c * (30 - k)) / (k + 1);
    }
    expect(p).toBeCloseTo((2 * tail) / 2 ** 30, 2);
  });
});

describe("permutation confidence interval", () => {
  it("contains the mean and agrees with the p-value", () => {
    const rand = mulberry32(9);
    for (let trial = 0; trial < 20; trial++) {
      const n = 6 + Math.floor(rand() * 8);
      const shift = rand() * 0.6 - 0.2;
      const d = Array.from({ length: n }, () => shift + (rand() - 0.5) * 0.5);
      const [lo, hi] = permutationCI(d);
      expect(lo).toBeLessThanOrEqual(mean(d) + 1e-9);
      expect(hi).toBeGreaterThanOrEqual(mean(d) - 1e-9);
      const p = signFlipTest(d);
      if (p < 0.04) expect(lo > 0 || hi < 0).toBe(true);
      if (p > 0.06) expect(lo <= 0 && hi >= 0).toBe(true);
    }
  });

  it("falls back to the data range when there are too few tasks to reject anything", () => {
    expect(permutationCI([0.2, 0.4, 0.3])).toEqual([0.2, 0.4]);
  });
});

describe("McNemar exact", () => {
  it("matches the binomial tail", () => {
    expect(mcnemarExact(1, 9)).toBeCloseTo(0.021484375, 12);
    expect(mcnemarExact(5, 5)).toBe(1);
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(0, 6)).toBeCloseTo(2 / 64, 12);
  });
});

describe("Wilcoxon signed-rank", () => {
  it("exact p matches brute force without ties", () => {
    expect(wilcoxonSignedRank([1, 2, 3, 4, 5, 6]).p).toBeCloseTo(2 / 64, 12);
    const rand = mulberry32(3);
    for (let trial = 0; trial < 15; trial++) {
      const n = 4 + Math.floor(rand() * 8);
      const vals = Array.from(
        { length: n },
        (_, i) => (i + 1 + rand() * 0.1) * (rand() < 0.6 ? 1 : -1),
      );
      expect(wilcoxonSignedRank(vals).p).toBeCloseTo(bruteWilcoxon(vals), 10);
    }
  });

  it("falls back to the normal approximation with ties", () => {
    const r = wilcoxonSignedRank([1, 1, 1, 1, 2, 2, -1, 3, 3, 3]);
    expect(r.p).toBeGreaterThan(0);
    expect(r.p).toBeLessThan(0.1);
  });
});

describe("helpers", () => {
  it("normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1.644854)).toBeCloseTo(0.05, 5);
  });

  it("Wilson interval", () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
  });

  it("bootstrap is reproducible from its seed", () => {
    const d = [0.1, -0.2, 0.3, 0.4, 0.05, 0.2];
    expect(bootstrapMeanCI(d, 0.05, 2000, 5)).toEqual(bootstrapMeanCI(d, 0.05, 2000, 5));
  });
});
