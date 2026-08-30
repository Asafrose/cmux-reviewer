import { spawnSync } from "node:child_process";
import { extname } from "node:path";

import type { Chapter, ReviewSession } from "./types";

export interface FilePatch {
  path: string;
  patch: string;
  filetype: string;
}

export function loadChapterPatches(session: ReviewSession, chapter: Chapter): FilePatch[] {
  if (chapter.files.length === 0) return [];
  const revision = `${session.pr.baseSha}...${session.pr.headSha}`;
  const result = spawnSync(
    "git",
    ["-C", session.repoRoot, "diff", "--no-ext-diff", "--no-color", revision, "--", ...chapter.files],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(`Unable to build chapter diff: ${result.stderr || "git diff failed"}`);
  return splitFilePatches(result.stdout);
}

export function splitFilePatches(diff: string): FilePatch[] {
  if (!diff.trim()) return [];
  const starts = [...diff.matchAll(/^diff --git /gm)].map((match) => match.index ?? 0);
  if (starts.length === 0) return [{ path: "change.patch", patch: diff, filetype: "diff" }];
  return starts.map((start, index) => {
    const patch = diff.slice(start, starts[index + 1] ?? diff.length).trimEnd() + "\n";
    const path = extractPath(patch);
    return { path, patch, filetype: filetypeForPath(path) };
  });
}

function extractPath(patch: string): string {
  const added = patch.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  if (added !== undefined && added !== "" && added !== "/dev/null") return added;
  const removed = patch.match(/^--- a\/(.+)$/m)?.[1];
  if (removed !== undefined && removed !== "" && removed !== "/dev/null") return removed;
  return patch.match(/^diff --git a\/(.+?) b\/(.+)$/m)?.[2] ?? "change.patch";
}

export function filetypeForPath(path: string): string {
  const extension = extname(path).slice(1).toLowerCase();
  const aliases: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    css: "css",
    html: "html",
    sh: "bash",
    zsh: "bash",
    sql: "sql",
  };
  return aliases[extension] ?? (extension === "" ? "text" : extension);
}
