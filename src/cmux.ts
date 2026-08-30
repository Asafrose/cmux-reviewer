import { spawnSync } from "node:child_process";

import { resolveCmuxWorkspace, withWorkspace } from "./cmux-context";
import { readRuntime, processIsAlive } from "./runtime";
import type { ReviewSession } from "./types";

export async function launchCompanion(session: ReviewSession, sessionPath: string): Promise<string> {
  const existing = await readRuntime(sessionPath);
  if (existing !== undefined && processIsAlive(existing.pid)) {
    const focused = spawnSync(
      "cmux",
      ["focus-pane", "--pane", existing.pane, "--workspace", existing.workspace],
      { encoding: "utf8" },
    );
    if (focused.status === 0) return existing.surface;
  }

  const workspace = resolveCmuxWorkspace();
  if (workspace === undefined || workspace === "") {
    throw new Error("cmux-review launch must run inside a cmux workspace");
  }
  const paneResult = spawnSync(
    "cmux",
    withWorkspace(["new-pane", "--type", "terminal", "--direction", "right", "--focus", "true"]),
    { cwd: session.repoRoot, encoding: "utf8" },
  );
  if (paneResult.status !== 0)
    throw new Error(nonEmpty(paneResult.stderr, "cmux could not create a companion pane"));
  const pane = referenceFrom(paneResult.stdout, "pane");
  if (pane === undefined)
    throw new Error(`cmux returned an unexpected pane response: ${paneResult.stdout.trim()}`);

  const surfaces = spawnSync("cmux", ["list-pane-surfaces", "--pane", pane, "--workspace", workspace], {
    encoding: "utf8",
  });
  const surface = referenceFrom(surfaces.stdout, "surface");
  if (surfaces.status !== 0 || surface === undefined) {
    throw new Error(nonEmpty(surfaces.stderr, "cmux did not create a terminal surface for the companion"));
  }

  const command = `cd ${shellQuote(session.repoRoot)} && cmux-review companion --session ${shellQuote(sessionPath)} --pane ${shellQuote(pane)} --surface ${shellQuote(surface)} --workspace ${shellQuote(workspace)}\n`;
  const sent = spawnSync("cmux", ["send", "--surface", surface, "--workspace", workspace, command], {
    encoding: "utf8",
  });
  if (sent.status !== 0) throw new Error(nonEmpty(sent.stderr, "cmux could not start the companion"));
  spawnSync("cmux", ["rename-tab", "--surface", surface, "--workspace", workspace, "Narrated review"], {
    encoding: "utf8",
  });
  return surface;
}

function referenceFrom(output: string, kind: "pane" | "surface"): string | undefined {
  return output.match(new RegExp(`${kind}:\\d+`, "u"))?.[0];
}

function nonEmpty(value: string, fallback: string): string {
  return value.trim() === "" ? fallback : value;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
