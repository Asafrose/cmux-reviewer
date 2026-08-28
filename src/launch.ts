import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function launchReviewPane(sessionPath: string, repoRoot: string): string {
  const paneResult = spawnSync("cmux", ["new-pane", "--type", "terminal", "--direction", "right", "--focus", "false"], {
    encoding: "utf8",
  });
  if (paneResult.status !== 0) throw new Error(paneResult.stderr || "cmux could not create the review pane");
  const pane = extractRef(paneResult.stdout, "pane");
  if (!pane) throw new Error(`cmux created a pane but returned an unexpected response: ${paneResult.stdout.trim()}`);

  const surfacesResult = spawnSync("cmux", ["list-pane-surfaces", "--pane", pane], { encoding: "utf8" });
  if (surfacesResult.status !== 0) throw new Error(surfacesResult.stderr || "cmux could not inspect the review pane");
  const surface = extractRef(surfacesResult.stdout, "surface");
  if (!surface) throw new Error("cmux did not report a terminal surface for the new review pane");

  const cliPath = resolve(import.meta.dir, "cli.ts");
  const command = `cd ${shellQuote(repoRoot)} && bun run ${shellQuote(cliPath)} tui --session ${shellQuote(sessionPath)}\n`;
  const sendResult = spawnSync("cmux", ["send", "--surface", surface, command], { encoding: "utf8" });
  if (sendResult.status !== 0) throw new Error(sendResult.stderr || "cmux could not start the review TUI");
  return surface;
}

function extractRef(output: string, kind: "pane" | "surface"): string | undefined {
  return output.match(new RegExp(`${kind}:\\d+`))?.[0];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
