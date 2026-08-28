import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Chapter, ReviewSession } from "./types";
import { hasHunk, openHunkChapter } from "./hunk";
import { withWorkspace } from "./cmux-context";

export async function openChapterDiff(session: ReviewSession, chapter: Chapter, sessionPath: string): Promise<void> {
  if (hasHunk()) {
    if (openHunkChapter(session, chapter)) return;
    launchHunkPane(session, chapter);
    return;
  }

  const patchDir = resolve(dirname(sessionPath), "..", "patches", session.id);
  await mkdir(patchDir, { recursive: true });
  const safeId = chapter.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const patchPath = resolve(patchDir, `${safeId}.patch`);
  const revision = `${session.pr.baseSha}...${session.pr.headSha}`;
  const args = ["-C", session.repoRoot, "diff", "--no-ext-diff", revision, "--", ...chapter.files];
  const diff = spawnSync("git", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (diff.status !== 0) {
    throw new Error(`Unable to build chapter diff: ${diff.stderr || "git diff failed"}`);
  }
  await writeFile(patchPath, diff.stdout, "utf8");

  const cmux = spawnSync(
    "cmux",
    ["diff", patchPath, "--title", `Review · ${chapter.title}`, "--layout", "split", "--focus", "true"],
    { cwd: session.repoRoot, encoding: "utf8" },
  );
  if (cmux.status !== 0) {
    throw new Error(`Unable to open cmux diff: ${cmux.stderr || "cmux diff failed"}`);
  }
}

function launchHunkPane(session: ReviewSession, chapter: Chapter): void {
  const paneResult = spawnSync("cmux", withWorkspace(["new-pane", "--type", "terminal", "--direction", "right", "--focus", "true"]), {
    cwd: session.repoRoot,
    encoding: "utf8",
  });
  if (paneResult.status !== 0) throw new Error(paneResult.stderr || "cmux could not create a Hunk pane");
  const pane = paneResult.stdout.match(/pane:\d+/)?.[0];
  if (!pane) throw new Error(`cmux returned an unexpected pane response: ${paneResult.stdout.trim()}`);
  const surfaces = spawnSync("cmux", ["list-pane-surfaces", "--pane", pane], { encoding: "utf8" });
  const surface = surfaces.stdout.match(/surface:\d+/)?.[0];
  if (surfaces.status !== 0 || !surface) throw new Error(surfaces.stderr || "cmux did not create a terminal surface for Hunk");
  const revision = `${session.pr.baseSha}...${session.pr.headSha}`;
  const args = ["hunk", "diff", revision, "--", ...chapter.files].map(shellQuote).join(" ");
  const command = `cd ${shellQuote(session.repoRoot)} && ${args}\n`;
  const sent = spawnSync("cmux", ["send", "--surface", surface, command], { encoding: "utf8" });
  if (sent.status !== 0) throw new Error(sent.stderr || "cmux could not start Hunk");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
