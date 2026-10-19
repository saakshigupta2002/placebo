import { existsSync, readFileSync } from "node:fs";
import type { Usage } from "../core/types.js";

/** USD per million tokens. */
export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Fallback prices for agents that do not report cost themselves.
 * Claude Code reports exact cost per session, so this table is only used for
 * other agents or when that field is missing. Override with --pricing <file.json>.
 * Anthropic first-party rates, cached 2026-10-06. Cache write uses the 5 minute rate (1.25x input).
 */
const DEFAULT_PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

let prices: Record<string, Price> = { ...DEFAULT_PRICES };

export function loadPricing(file?: string): void {
  prices = { ...DEFAULT_PRICES };
  if (file && existsSync(file)) {
    Object.assign(prices, JSON.parse(readFileSync(file, "utf8")) as Record<string, Price>);
  }
}

/** Find a price for a model id, tolerating date suffixes and aliases. */
export function priceFor(model: string | undefined): Price | undefined {
  if (!model) return undefined;
  if (prices[model]) return prices[model];
  const key = Object.keys(prices)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? prices[key] : undefined;
}

export function estimateCost(model: string | undefined, usage: Usage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheWriteTokens * p.cacheWrite +
      usage.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

export function totalTokens(u: Usage): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
