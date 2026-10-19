import { randomBytes } from "node:crypto";

export function trialId(): string {
  return `t_${randomBytes(3).toString("hex")}`;
}

export function slug(text: string, max = 40): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, max)
      .replace(/-+$/, "") || "task"
  );
}
