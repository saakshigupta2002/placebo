import { z } from "zod";

export const TaskSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "task id must be lowercase letters, digits, dots, dashes"),
  title: z.string().min(1),
  /** What the agent is asked to do. Written like an issue, never like the solution. */
  prompt: z.string().min(1),
  /** Path to the git repository, relative to the task file. */
  repo: z.string().default("."),
  /** Commit the agent starts from. */
  base: z.string().min(1),
  /** Files withheld from the agent and written into the workspace only for grading. */
  hidden: z
    .object({
      /** Read hidden files from this commit (mined tasks). */
      from: z.string().optional(),
      /** Or from this directory, relative to the task file (packs). */
      dir: z.string().optional(),
      files: z.array(z.string()).default([]),
    })
    .default({ files: [] }),
  /** Shell command run in the workspace after the agent finishes. Exit 0 means pass. */
  check: z.string().min(1),
  /** Optional shell command run before the agent starts, e.g. installing dependencies. */
  setup: z.string().optional(),
  /** Paths symlinked from the source repo into each workspace, e.g. node_modules. */
  link: z.array(z.string()).default([]),
  /** Reference solution, used to validate the task and by the fake agent. */
  solution: z
    .object({
      commit: z.string().optional(),
      dir: z.string().optional(),
    })
    .optional(),
  /** Agent time limit in seconds. */
  timeout: z.number().int().positive().default(900),
  /** Check command time limit in seconds. */
  checkTimeout: z.number().int().positive().default(300),
  source: z.enum(["git", "manual", "pack"]).default("manual"),
  tags: z.array(z.string()).default([]),
});

export type TaskSpec = z.infer<typeof TaskSchema>;

/** A task after loading: paths resolved to absolute locations. */
export interface Task extends TaskSpec {
  /** Absolute path to the YAML file. */
  file: string;
  /** Absolute path to the git repository. */
  repoPath: string;
  /** Absolute hidden-files directory when `hidden.dir` is set. */
  hiddenDirPath?: string;
  /** Absolute solution directory when `solution.dir` is set. */
  solutionDirPath?: string;
  /** Content hash of the task definition. */
  hash: string;
}
