import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Kill the process after this many milliseconds. */
  timeoutMs?: number;
  /** Write every stdout chunk to this file as it arrives. */
  stdoutFile?: string;
  /** Text piped to stdin. When omitted, stdin is closed immediately. */
  input?: string;
  /** Keep at most this many characters of stdout/stderr in memory. */
  maxBuffer?: number;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Spawn a process without a shell. stdin is always closed unless `input` is given,
 * because agent CLIs such as `claude -p` wait on an open stdin forever.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const started = Date.now();
  const max = opts.maxBuffer ?? 2_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      signal: opts.signal,
    });
    const file = opts.stdoutFile ? createWriteStream(opts.stdoutFile) : undefined;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, opts.timeoutMs);
    }
    child.stdout.on("data", (d: Buffer) => {
      file?.write(d);
      if (stdout.length < max) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < max) stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      file?.end();
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const finish = () =>
        resolve({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
      if (file) file.end(finish);
      else finish();
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

/** Run a command line through the user's shell. Used for task check and setup commands. */
export function sh(command: string, opts: RunOptions = {}): Promise<RunResult> {
  return run(
    process.env.SHELL && !process.env.SHELL.includes("fish") ? process.env.SHELL : "/bin/sh",
    ["-c", command],
    opts,
  );
}

/** Resolve whether an executable is on PATH. */
export async function which(bin: string): Promise<string | undefined> {
  try {
    const r = await run("/bin/sh", ["-c", `command -v ${bin}`], { timeoutMs: 5_000 });
    const out = r.stdout.trim();
    return r.code === 0 && out ? out : undefined;
  } catch {
    return undefined;
  }
}
