import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import type { Chapter, ReviewNote, ReviewSession } from "./types";

export function hasHunk(): boolean {
  return spawnSync("hunk", ["--version"], { stdio: "ignore" }).status === 0;
}

export function openHunkChapter(session: ReviewSession, chapter: Chapter): boolean {
  const revision = `${session.pr.baseSha}...${session.pr.headSha}`;
  const diffArgs = [revision, "--", ...chapter.files];
  const existing = spawnSync("hunk", ["session", "get", "--repo", session.repoRoot, "--json"], {
    cwd: session.repoRoot,
    encoding: "utf8",
  });
  if (existing.status === 0) {
    const reload = spawnSync(
      "hunk",
      ["session", "reload", "--repo", session.repoRoot, "--json", "--", "diff", ...diffArgs],
      { cwd: session.repoRoot, encoding: "utf8" },
    );
    if (reload.status !== 0) throw new Error(reload.stderr || "Hunk could not load the chapter diff");
    return true;
  }
  return false;
}

export function readHunkUserNotes(repoRoot: string): ReviewNote[] {
  const result = spawnSync(
    "hunk",
    ["session", "comment", "list", "--repo", repoRoot, "--type", "user", "--json"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr || "No live Hunk review session was found");
  return parseHunkNotes(JSON.parse(result.stdout));
}

export function parseHunkNotes(value: unknown): ReviewNote[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.comments)
      ? value.comments
      : [];
  const notes: ReviewNote[] = [];
  for (const item of source) {
    if (!isRecord(item)) continue;
    const path = stringValue(item.filePath) ?? stringValue(item.file) ?? stringValue(item.path);
    const newLine =
      numberValue(item.newLine) ??
      numberValue(item.new_line) ??
      rangeEnd(item.newRange) ??
      rangeEnd(item.new_range);
    const oldLine =
      numberValue(item.oldLine) ??
      numberValue(item.old_line) ??
      rangeEnd(item.oldRange) ??
      rangeEnd(item.old_range);
    const body = stringValue(item.summary) ?? stringValue(item.body) ?? stringValue(item.rationale);
    const line = newLine ?? oldLine;
    if (path === undefined || line === undefined || body === undefined) continue;
    const externalId =
      stringValue(item.noteId) ??
      stringValue(item.note_id) ??
      stringValue(item.id) ??
      createHash("sha256").update(`${path}:${line}:${body}`).digest("hex").slice(0, 16);
    notes.push({
      id: `hunk:${externalId}`,
      body,
      createdAt: stringValue(item.createdAt) ?? stringValue(item.created_at) ?? new Date().toISOString(),
      path,
      line,
      side: newLine === undefined ? "LEFT" : "RIGHT",
    });
  }
  return notes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function rangeEnd(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  return numberValue(value[1]) ?? numberValue(value[0]);
}
