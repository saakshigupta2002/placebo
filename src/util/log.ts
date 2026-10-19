import pc from "picocolors";

let quiet = false;
let verbose = false;

export function configureLog(opts: { quiet?: boolean; verbose?: boolean }): void {
  quiet = Boolean(opts.quiet);
  verbose = Boolean(opts.verbose);
}

export const log = {
  info(msg: string): void {
    if (!quiet) process.stderr.write(`${msg}\n`);
  },
  step(msg: string): void {
    if (!quiet) process.stderr.write(`${pc.cyan("›")} ${msg}\n`);
  },
  ok(msg: string): void {
    if (!quiet) process.stderr.write(`${pc.green("✓")} ${msg}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`${pc.yellow("!")} ${msg}\n`);
  },
  error(msg: string): void {
    process.stderr.write(`${pc.red("✗")} ${msg}\n`);
  },
  debug(msg: string): void {
    if (verbose) process.stderr.write(`${pc.dim(msg)}\n`);
  },
};
