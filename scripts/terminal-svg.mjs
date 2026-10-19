#!/usr/bin/env node
// Turn a short terminal script into a looping, animated SVG (SMIL), the kind GitHub plays inline.
// No dependencies. Usage: node scripts/terminal-svg.mjs <script.json> <out.svg>
//
// Script format:
// {
//   "title": "placebo · sped up", "cols": 92, "rows": 20, "fontSize": 13, "lineHeight": 19, "holdMs": 4500,
//   "steps": [
//     { "cmd": "placebo trial ./skills/test-first --pack starter-js", "cps": 38 },
//     { "out": ["[b]Placebo[/] trial t_1", "[dim]  12 tasks[/]"], "gapMs": 90 },
//     { "pauseMs": 600 }
//   ]
// }
// Markup inside lines: [g] green, [r] red, [y] yellow, [c] cyan, [bl] blue, [b] bold, [dim] dim, [/] reset.
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: terminal-svg.mjs <script.json> <out.svg>");
  process.exit(1);
}
const s = JSON.parse(readFileSync(input, "utf8"));
const cols = s.cols ?? 92;
const rows = s.rows ?? 20;
const fs = s.fontSize ?? 13;
const lh = s.lineHeight ?? Math.round(fs * 1.45);
const cw = fs * 0.6; // monospace advance
const padX = 20;
const top = 46;
const width = Math.round(padX * 2 + cols * cw);
const height = Math.round(top + rows * lh + 18);
const C = {
  fg: "#c9d1d9",
  dim: "#8b949e",
  g: "#3fb950",
  r: "#f85149",
  y: "#d29922",
  c: "#39c5cf",
  bl: "#58a6ff",
  prompt: "#3fb950",
};

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Split "[g]ok[/] done" into styled segments. */
function segments(line) {
  const out = [];
  let style = {};
  for (const part of line.split(/(\[(?:g|r|y|c|bl|b|dim|\/)\])/)) {
    const tag = part.match(/^\[(g|r|y|c|bl|b|dim|\/)\]$/)?.[1];
    if (tag === "/") style = {};
    else if (tag === "b") style = { ...style, bold: true };
    else if (tag) style = { ...style, color: tag };
    else if (part) out.push({ text: part, ...style });
  }
  return out;
}

// Build a timeline of lines with their reveal times.
const lines = []; // { y-index, t, kind, text }
let t = 400;
for (const step of s.steps) {
  if (step.cmd !== undefined) {
    const cps = step.cps ?? 38;
    const start = t;
    const typing = (step.cmd.length / cps) * 1000;
    lines.push({ kind: "cmd", text: step.cmd, t: start, typeEnd: start + typing });
    t = start + typing + (step.afterMs ?? 350);
  } else if (step.out) {
    const gap = step.gapMs ?? 70;
    for (const text of step.out) {
      lines.push({ kind: "out", text, t });
      t += gap;
    }
  } else if (step.pauseMs) {
    t += step.pauseMs;
  }
}
const total = t + (s.holdMs ?? 4500);
const kt = (ms) => Math.min(0.999, Math.max(0, ms / total)).toFixed(5);
const reveal = (ms) =>
  `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${kt(ms)};${kt(ms + 1)};0.996;1" dur="${total}ms" repeatCount="indefinite"/>`;

// Scroll: once more lines than rows are visible, shift the content up one line per new line.
const scrollEvents = [];
lines.forEach((ln, i) => {
  const offset = Math.max(0, i + 1 - rows) * lh;
  if (offset > 0) scrollEvents.push({ t: ln.t, offset });
});
let scroll = "";
if (scrollEvents.length) {
  const values = ["0 0"];
  const times = ["0"];
  for (const e of scrollEvents) {
    values.push(`0 ${-e.offset}`);
    times.push(kt(e.t));
  }
  values.push("0 0");
  times.push("0.999");
  scroll = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="${values.join(";")}" keyTimes="${times.join(";")}" dur="${total}ms" repeatCount="indefinite"/>`;
}

const body = [];
const defs = [];
lines.forEach((ln, i) => {
  const y = top + (i + 1) * lh - 5;
  if (ln.kind === "cmd") {
    const id = `c${i}`;
    const steps = ln.text.length;
    const widths = [];
    const times = [];
    for (let k = 0; k <= steps; k++) {
      widths.push((k * cw).toFixed(1));
      times.push(kt(ln.t + ((ln.typeEnd - ln.t) * k) / steps));
    }
    widths.push((steps * cw).toFixed(1), "0");
    times.push("0.996", "0.999");
    defs.push(
      `<clipPath id="${id}"><rect x="${padX + 2 * cw}" y="${y - lh + 5}" height="${lh}" width="0"><animate attributeName="width" calcMode="discrete" values="0;${widths.join(";")}" keyTimes="0;${times.join(";")}" dur="${total}ms" repeatCount="indefinite"/></rect></clipPath>`,
    );
    body.push(
      `<text x="${padX}" y="${y}" fill="${C.prompt}" font-weight="700" opacity="0">$${reveal(ln.t)}</text>`,
    );
    body.push(
      `<text x="${padX + 2 * cw}" y="${y}" fill="${C.fg}" clip-path="url(#${id})" xml:space="preserve">${esc(ln.text)}</text>`,
    );
    // caret follows the typing, then disappears
    const xs = [];
    const cts = [];
    for (let k = 0; k <= steps; k++) {
      xs.push((padX + (2 + k) * cw).toFixed(1));
      cts.push(kt(ln.t + ((ln.typeEnd - ln.t) * k) / steps));
    }
    body.push(
      `<rect y="${y - fs + 1}" width="${cw.toFixed(1)}" height="${fs + 2}" fill="${C.fg}" opacity="0"><animate attributeName="x" calcMode="discrete" values="${xs[0]};${xs.join(";")}" keyTimes="0;${cts.join(";")}" dur="${total}ms" repeatCount="indefinite"/><animate attributeName="opacity" calcMode="discrete" values="0;0.8;0" keyTimes="0;${kt(ln.t)};${kt(ln.typeEnd + 250)}" dur="${total}ms" repeatCount="indefinite"/></rect>`,
    );
  } else {
    const spans = segments(ln.text)
      .map((g) => {
        const fill = g.color ? (C[g.color] ?? C.fg) : C.fg;
        return `<tspan fill="${fill}"${g.bold ? ' font-weight="700"' : ""}>${esc(g.text)}</tspan>`;
      })
      .join("");
    body.push(
      `<text x="${padX}" y="${y}" opacity="0" xml:space="preserve">${spans}${reveal(ln.t)}</text>`,
    );
  }
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${fs}" role="img" aria-label="${esc(s.label ?? s.title ?? "terminal demo")}">
<defs><clipPath id="screen"><rect x="0" y="${top + 1}" width="${width}" height="${rows * lh + 8}"/></clipPath>${defs.join("")}</defs>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="#0d1117" stroke="#30363d"/>
<circle cx="22" cy="20" r="5.5" fill="#ff5f56"/><circle cx="40" cy="20" r="5.5" fill="#ffbd2e"/><circle cx="58" cy="20" r="5.5" fill="#27c93f"/>
<text x="${width / 2}" y="24" text-anchor="middle" fill="${C.dim}" font-size="${fs - 1}">${esc(s.title ?? "")}</text>
<g clip-path="url(#screen)"><g>${scroll}${body.join("\n")}</g></g>
</svg>
`;
writeFileSync(output, svg);
console.log(
  `wrote ${output} (${(svg.length / 1024).toFixed(1)} KB, ${Math.round(total / 100) / 10}s loop, ${lines.length} lines)`,
);
