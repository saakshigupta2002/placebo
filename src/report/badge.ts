import type { TrialRecord } from "../core/types.js";
import { fmtEffect } from "./format.js";

const COLORS = {
  WORKS: "#2ea44f",
  PLACEBO: "#dfb317",
  HARMFUL: "#e05d44",
  INCONCLUSIVE: "#9f9f9f",
} as const;

export function badgeMessage(t: TrialRecord): { label: string; message: string; color: string } {
  const r = t.results;
  if (!r) return { label: "placebo", message: "unfinished", color: COLORS.INCONCLUSIVE };
  const v = r.verdict.label;
  const spend =
    r.metrics.find((m) => m.key === "cost") ?? r.metrics.find((m) => m.key === "tokens");
  const pass = r.metrics.find((m) => m.key === "pass");
  let detail = "";
  if (v === "WORKS" || v === "HARMFUL") {
    if (pass && pass.pValue < 0.05) detail = ` · ${fmtEffect(pass)} passed`;
    else if (spend) detail = ` · ${fmtEffect(spend).replace(".0%", "%")} ${spend.key}`;
  }
  return { label: "placebo", message: `${v.toLowerCase()}${detail}`, color: COLORS[v] };
}

/** shields.io endpoint format, for https://img.shields.io/endpoint?url=... */
export function badgeJson(t: TrialRecord): string {
  const b = badgeMessage(t);
  return `${JSON.stringify({ schemaVersion: 1, label: b.label, message: b.message, color: b.color.replace("#", "") }, null, 2)}\n`;
}

function textWidth(s: string): number {
  return (
    Math.round(
      [...s].reduce(
        (w, ch) =>
          w +
          (/[ilj.,:;|!']/.test(ch)
            ? 3.5
            : /[mwMW]/.test(ch)
              ? 9.5
              : /[A-Z0-9%]/.test(ch)
                ? 7.5
                : 6.5),
        0,
      ),
    ) + 10
  );
}

export function badgeSvg(t: TrialRecord): string {
  const b = badgeMessage(t);
  const lw = textWidth(b.label);
  const rw = textWidth(b.message);
  const w = lw + rw;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(b.label)}: ${esc(b.message)}">
<title>${esc(b.label)}: ${esc(b.message)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${rw}" height="20" fill="${b.color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(b.label)}</text><text x="${lw / 2}" y="13">${esc(b.label)}</text>
<text x="${lw + rw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(b.message)}</text><text x="${lw + rw / 2}" y="13">${esc(b.message)}</text>
</g></svg>
`;
}
