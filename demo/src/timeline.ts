import {
  OPEN_CMD,
  SESSION_A_CMD,
  SESSION_A_HEADER,
  SESSION_A_RUNS,
  SESSION_A_TABLE,
  SESSION_B_CMD,
  SESSION_B_HEADER,
  SESSION_B_RUNS,
  SESSION_B_TABLE,
} from "./content";

/** One file owns every beat. 30 fps. */
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export type Line = { kind: "cmd" | "out"; text: string; at: number; typeEnd: number; prompt: string; session: "A" | "B" };

const CPS = 64; // typing speed, characters per second
const lines: Line[] = [];
let t = 0;
const cmd = (text: string, session: "A" | "B", prompt = "$") => {
  const frames = Math.ceil((text.length / CPS) * FPS);
  lines.push({ kind: "cmd", text, at: t, typeEnd: t + frames, prompt, session });
  t += frames + 6;
};
const out = (texts: string[], gap: number, session: "A" | "B") => {
  for (const text of texts) {
    lines.push({ kind: "out", text, at: t, typeEnd: t, prompt: "", session });
    t += gap;
  }
};

// Scene 1: title card, then the terminal comes up.
export const TITLE = { from: 0, to: 84 };
export const TERM_IN = 70;

// Scene 2: the real trial.
t = 96;
for (const c of SESSION_A_CMD) cmd(c.kind === "cmd" ? c.text : "", "A", c.kind === "cmd" && c.prompt ? c.prompt : "$");
t += 6;
out(SESSION_A_HEADER, 6, "A");
t += 4;
out(SESSION_A_RUNS, 9, "A");
t += 10;
out(SESSION_A_TABLE, 3, "A");
export const VERDICT_A = t - 6;
t += 56;

// Scene 3: open the report.
export const OPEN_AT = t;
cmd(OPEN_CMD, "A");
export const BROWSER_IN = t + 4;

// Scene 4: the report, scrolled.
export const CARD_HOLD = { from: BROWSER_IN + 24, to: BROWSER_IN + 104 };
export const SCROLLS = [
  { from: CARD_HOLD.to, to: CARD_HOLD.to + 30, cssTop: 529 }, // every effect
  { from: CARD_HOLD.to + 96, to: CARD_HOLD.to + 122, cssTop: 1040 }, // adverse events
  { from: CARD_HOLD.to + 162, to: CARD_HOLD.to + 188, cssTop: 1295 }, // tasks
];
export const TASK_CLICK = CARD_HOLD.to + 216;
export const BROWSER_OUT = TASK_CLICK + 62;

// Scene 5: test an edit against the last commit, in a cleared terminal.
export const CLEAR_AT = BROWSER_OUT + 18;
t = CLEAR_AT + 6;
for (const c of SESSION_B_CMD) cmd(c.kind === "cmd" ? c.text : "", "B", c.kind === "cmd" && c.prompt ? c.prompt : "$");
t += 6;
out(SESSION_B_HEADER, 6, "B");
t += 4;
out(SESSION_B_RUNS, 8, "B");
t += 8;
out(SESSION_B_TABLE, 3, "B");
export const VERDICT_B = t - 3;
t += 66;

// Scene 6: end card.
export const END = { from: t, to: t + 96 };
export const DURATION = END.to;

export const LINES = lines;

/** Caption pills: short, plain, one idea each. */
export const CAPTIONS = [
  { from: TERM_IN + 30, to: VERDICT_A - 60, text: "Same tasks, same agent, with and without the skill" },
  { from: VERDICT_A - 40, to: OPEN_AT + 10, text: "A real run: the skill fired 16 of 17 times and cost 161% more for no gain" },
  { from: CARD_HOLD.from, to: SCROLLS[0]!.from, text: "Every trial gets a report you can share" },
  { from: SCROLLS[0]!.to - 6, to: SCROLLS[1]!.from, text: "Every effect comes with its 95% interval and p-value" },
  { from: SCROLLS[1]!.to - 6, to: SCROLLS[2]!.from, text: "It also checks for leaked secrets and test tampering" },
  { from: SCROLLS[2]!.to - 6, to: BROWSER_OUT, text: "Open any task to see each run in detail" },
  { from: CLEAR_AT + 10, to: VERDICT_B - 40, text: "Edited your skill? Test the new version against the last commit" },
  { from: VERDICT_B - 30, to: END.from, text: "With too few tasks, Placebo says so instead of guessing" },
];
