import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, text);
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** A fresh temp directory with its real path resolved (macOS /var -> /private/var). */
export function makeTempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `placebo-${prefix}-`)));
}

export function removeDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function isInside(child: string, parent: string): boolean {
  const c = child.endsWith("/") ? child : `${child}/`;
  const p = parent.endsWith("/") ? parent : `${parent}/`;
  return c.startsWith(p);
}
