import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { validateSession } from "../src/session";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const cli = resolve(import.meta.dir, "..", "src", "cli.ts");

function run(cwd: string, args: string[]) {
  return Bun.spawnSync(["bun", "run", cli, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
}

describe("CLI workflow", () => {
  test("persists notes, outcomes, drafts, and summary acknowledgement", async () => {
    const repo = await mkdtemp(resolve(tmpdir(), "cmux-review-cli-"));
    temporaryPaths.push(repo);
    await mkdir(resolve(repo, ".git"));
    const manifestPath = resolve(repo, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        repoRoot: repo,
        pr: {
          owner: "owner",
          repo: "repo",
          number: 7,
          title: "Narrate the review",
          url: "https://github.com/owner/repo/pull/7",
          baseSha: "aaaaaaaa",
          headSha: "bbbbbbbb",
        },
        intent: {
          goal: "Make review digestible",
          architecture: "Chapters",
          tradeoffs: [],
          inScope: ["Review"],
          outOfScope: ["Linting"],
          clarity: { score: 80, rationale: "Clear description", unknowns: [] },
        },
        chapters: [
          {
            id: "orientation",
            title: "Orientation",
            purpose: "Explain the PR",
            files: [],
            evidence: [],
            lensRevealed: false,
            notes: [],
            findings: [],
            outcome: "pending",
          },
        ],
      }),
    );

    expect(run(repo, ["init", "--manifest", manifestPath]).exitCode).toBe(0);
    expect(run(repo, ["note", "--chapter", "orientation", "--body", "This is clear."]).exitCode).toBe(0);
    expect(run(repo, ["outcome", "--chapter", "orientation", "--set", "approved"]).exitCode).toBe(0);

    const draftPath = resolve(repo, "draft.json");
    await writeFile(draftPath, JSON.stringify({ event: "APPROVE", body: "Looks good.", comments: [] }));
    expect(run(repo, ["draft", "--file", draftPath]).exitCode).toBe(0);

    const beforeAck = run(repo, ["publish", "--confirm"]);
    expect(beforeAck.exitCode).toBe(1);
    expect(beforeAck.stderr.toString()).toContain("summary checkpoint");

    const summary = run(repo, ["summary", "--ack"]);
    expect(summary.exitCode).toBe(0);
    expect(summary.stdout.toString()).toContain("Decision: **APPROVE**");

    const shown = run(repo, ["show"]);
    expect(shown.exitCode).toBe(0);
    const session = validateSession(JSON.parse(shown.stdout.toString()));
    expect(session.chapters.at(0)?.notes.at(0)?.body).toBe("This is clear.");
    expect(session.chapters.at(0)?.outcome).toBe("approved");
    expect(session.draftReviewedAt).toBeString();
  });
});
