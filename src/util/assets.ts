import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Find a file shipped with the package (works from src/ in dev and dist/ when installed). */
export function packageAsset(rel: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, rel))) return join(dir, rel);
    dir = dirname(dir);
  }
  throw new Error(`Missing package file: ${rel}`);
}
