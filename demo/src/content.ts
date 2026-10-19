/**
 * Every terminal line in the video, copied from real runs:
 *   session A: trial t_launch1 (progress lines from its log, the table from `placebo report t_launch1`)
 *   session B: trial t_version1 (progress lines from its log, the table from `placebo report t_version1`)
 * Some progress lines are skipped (shown as "..."), nothing is invented.
 * Markup: [g] green, [r] red, [y] yellow, [c] cyan, [b] bold, [dim] dim, [/] reset.
 */

export type Entry =
  | { kind: "cmd"; text: string; prompt?: string }
  | { kind: "out"; text: string }
  | { kind: "pause"; frames: number }
  | { kind: "gap"; frames: number };

export const SESSION_A_CMD: Entry[] = [
  { kind: "cmd", text: "placebo trial examples/skills/test-first --pack starter-js --limit 12 --model haiku \\" },
  { kind: "cmd", text: "  --until-confident --min-tasks 8 --budget 3.5 --seed 2026", prompt: " " },
];

export const SESSION_A_HEADER = [
  "",
  "[b]Placebo[/] trial t_launch1: skill [b]test-first[/]",
  "[dim]  12 tasks from pack starter-js × 2 arms × 2 repeats = 48 runs · claude-code · isolation flags · budget $3.5 · seed 2026[/]",
  "",
];

export const SESSION_A_RUNS = [
  "  [r]✗[/] word-wrap          control #2    failed    55.5k tok   $0.01    11s  [dim]1/48[/]",
  "  [r]✗[/] word-wrap          control #1    failed    55.3k tok   $0.01    13s  [dim]2/48[/]",
  "  [g]✓[/] merge-intervals    control #1    passed    94.1k tok   $0.02    15s  [dim]3/48[/]",
  "  [g]✓[/] word-wrap          treatment #1  passed   212.4k tok   $0.05    33s[dim] not fired[/]  [dim]4/48[/]",
  "[g]✓[/] Isolation verified. Control arm saw only built-in skills (keybindings-help), no plugins and no MCP servers.",
  "  [g]✓[/] word-wrap          treatment #2  passed   347.3k tok   $0.07    40s[c] fired[/]  [dim]5/48[/]",
  "  [g]✓[/] merge-intervals    control #2    passed    93.6k tok   $0.02    14s  [dim]6/48[/]",
  "  [g]✓[/] merge-intervals    treatment #1  passed   268.9k tok   $0.05    39s[c] fired[/]  [dim]7/48[/]",
  "  [g]✓[/] money-format       control #1    passed   180.4k tok   $0.04    31s  [dim]10/48[/]",
  "  [g]✓[/] money-format       treatment #1  passed   294.9k tok   $0.06    54s[c] fired[/]  [dim]11/48[/]",
  "  [dim]...[/]",
  "  [g]✓[/] slugify-accents    control #2    passed    55.0k tok   $0.01     9s  [dim]31/48[/]",
  "  [g]✓[/] slugify-accents    treatment #2  passed   349.0k tok   $0.06    49s[c] fired[/]  [dim]33/48[/]",
  "[y]![/] Stopping: confident after 8 tasks (tokens, cost settled)",
];

export const SESSION_A_TABLE = [
  "",
  "  [b]Placebo[/] · trial t_launch1 · 9 tasks × 2 arms × 2 repeats · claude-code 2.1.25 / haiku",
  "  [dim]Testing[/] skill \"test-first\" (sha c80c12e9)",
  "",
  "[dim]                    control     treatment    effect (95% CI)           p[/]",
  "  tests passed      14/18       16/17        +17 pts  (0, +50)         0.500",
  "  tokens / task     126.7k      338.1k       [r]+198.0%  (+108.4, +321.7)[/] 0.004",
  "  cost / task       $0.03       $0.07        [r]+160.9%  (+78.6, +276.8) [/] 0.004",
  "  time / task       22s         48s          [r]+136.4%  (+71.4, +221.3) [/] 0.004",
  "  lines changed     53          76           +68.3%  (+1.5, +179.6)    0.039",
  "  skill fired       -           16/17 runs (94%)",
  "",
  "  adverse events    [g]none[/]",
  "  also noted        [dim]wrote its own test files (control 0, treatment 8) · info, not adverse[/]",
  "  isolation         [g]verified[/] [dim](flags mode)[/]",
  "  stopped early     confident after 8 tasks (tokens, cost settled)",
  "",
  "  [b]VERDICT[/]  [r][b]HARMFUL[/]  Costs 161% more with no gain in correctness.",
  "  [dim]Report[/]   .placebo/trials/t_launch1/report.html",
];

export const OPEN_CMD = "open .placebo/trials/t_launch1/report.html";

export const SESSION_B_CMD: Entry[] = [
  { kind: "cmd", text: "placebo trial examples/skills/test-first --baseline HEAD --pack starter-js --limit 6 \\" },
  { kind: "cmd", text: "  --repeats 1 --model haiku --budget 1 --seed 2027", prompt: " " },
];

export const SESSION_B_HEADER = [
  "",
  "[b]Placebo[/] trial t_version1: skill-version [b]test-first[/] (new vs HEAD)",
  "[dim]  6 tasks from pack starter-js × 2 arms × 1 repeat = 12 runs · claude-code · isolation flags · budget $1 · seed 2027[/]",
  "",
];

export const SESSION_B_RUNS = [
  "  [g]✓[/] slugify-accents  treatment #1  passed   200.9k tok   $0.04    25s[c] fired[/]  [dim]1/12[/]",
  "  [g]✓[/] query-string     control #1    passed   251.0k tok   $0.05    35s[dim] not fired[/]  [dim]2/12[/]",
  "[g]✓[/] Isolation verified. Control arm saw only built-in skills (keybindings-help) plus the baseline version of test-first, no plugins and no MCP servers.",
  "  [g]✓[/] query-string     treatment #1  passed   276.9k tok   $0.06    40s[c] fired[/]  [dim]3/12[/]",
  "  [g]✓[/] csv-quotes       treatment #1  passed   237.6k tok   $0.05    36s[c] fired[/]  [dim]5/12[/]",
  "  [dim]...[/]",
  "  [g]✓[/] money-format     treatment #1  passed   415.9k tok   $0.08  1m01s[c] fired[/]  [dim]11/12[/]",
];

export const SESSION_B_TABLE = [
  "",
  "  [b]Placebo[/] · trial t_version1 · 6 tasks × 2 arms × 1 repeat · claude-code 2.1.25 / haiku",
  "  [dim]Testing[/] skill \"test-first\" new (sha ad861179) vs baseline HEAD (sha c80c12e9)",
  "",
  "[dim]                    control     treatment    effect (95% CI)           p[/]",
  "  tests passed      6/6         6/6          0 pts  (0, 0)             1.000",
  "  tokens / task     417.1k      296.0k       -23.7%  (-55.3, +27.3)    0.219",
  "  cost / task       $0.09       $0.06        -23.7%  (-54.1, +23.6)    0.188",
  "  time / task       56s         44s          -18.6%  (-48.6, +16.9)    0.250",
  "  skill fired       5/6         5/6 runs (83%)",
  "",
  "  adverse events    [g]none[/]",
  "  isolation         [g]verified[/] [dim](flags mode)[/]",
  "",
  "  [b]VERDICT[/]  [bl][b]INCONCLUSIVE[/]  Not enough evidence yet. About 17 tasks would settle it.",
];
