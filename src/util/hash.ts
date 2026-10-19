import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Stable content hash of a directory: sorted relative paths plus file bytes. */
export function hashDir(dir: string, ignore: (rel: string) => boolean = () => false): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const rel = relative(dir, full);
      if (ignore(rel)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        h.update(rel);
        h.update("\0");
        h.update(readFileSync(full));
        h.update("\0");
      }
    }
  };
  walk(dir);
  return h.digest("hex");
}

export function shortHash(data: string, len = 8): string {
  return sha256(data).slice(0, len);
}
