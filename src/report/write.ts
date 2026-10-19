import { join } from "node:path";
import type { TrialRecord } from "../core/types.js";
import { writeText } from "../util/fs.js";
import { badgeJson, badgeSvg } from "./badge.js";
import { renderHtml } from "./html.js";
import { renderMarkdown } from "./markdown.js";

export function writeReports(trial: TrialRecord, dir: string): void {
  writeText(join(dir, "report.html"), renderHtml(trial));
  writeText(join(dir, "REPORT.md"), renderMarkdown(trial));
  writeText(join(dir, "badge.json"), badgeJson(trial));
  writeText(join(dir, "badge.svg"), badgeSvg(trial));
}
