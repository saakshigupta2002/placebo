#!/usr/bin/env node
// House style for docs and user-facing strings: no em dashes, no comma before "and".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", "dist", ".git", ".placebo", "fixtures", "coverage"]);
const EXT = new Set([".md", ".ts", ".mjs", ".yml", ".yaml", ".html", ".json"]);
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name === "package-lock.json") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.has(extname(name))) files.push(p);
  }
};
walk(root);

const rules = [
  { name: "em dash", re: /—/ },
  { name: 'comma before "and"', re: /, and\b/ },
];
let problems = 0;
for (const file of files) {
  if (file.endsWith("check-prose.mjs")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const r of rules) {
      if (r.re.test(line)) {
        problems++;
        console.log(`${relative(root, file)}:${i + 1}: ${r.name}: ${line.trim().slice(0, 120)}`);
      }
    }
  });
}
if (problems) {
  console.log(`\n${problems} style problem(s).`);
  process.exit(1);
}
console.log(`Prose check passed (${files.length} files).`);
