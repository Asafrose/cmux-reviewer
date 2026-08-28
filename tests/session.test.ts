import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadSession, saveSession, validateSession } from "../src/session";
import { renderSummary } from "../src/summary";
import type { ReviewSession } from "../src/types";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function fixture(): ReviewSession {
  return {
    version: 1,
    id: "owner-repo-pr-42",
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    repoRoot: "/tmp/repo",
    pr: {
      owner: "owner",
      repo: "repo",
      number: 42,
      title: "Make reviews understandable",
      url: "https://github.com/owner/repo/pull/42",
      baseSha: "aaaaaaaa",
      headSha: "bbbbbbbb",
    },
    intent: {
      goal: "Improve review comprehension",
      architecture: "Narrated chapters",
      tradeoffs: [],
      inScope: ["Review workflow"],
      outOfScope: ["CI"],
      clarity: { score: 82, rationale: "The PR explains its goal", unknowns: [] },
    },
    chapters: [
      {
        id: "orientation",
        title: "The goal",
        purpose: "Explain intent",
        files: [],
        evidence: [],
        lensRevealed: false,
        notes: [],
        findings: [],
        outcome: "approved",
      },
    ],
    currentChapter: 0,
  };
}

describe("review sessions", () => {
  test("round-trips through atomic persistence", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "cmux-review-"));
    temporaryPaths.push(dir);
    const path = resolve(dir, "session.json");
    const session = fixture();
    await saveSession(path, session);
    expect(await loadSession(path)).toEqual(session);
    expect((await readFile(path, "utf8")).endsWith("\n")).toBe(true);
  });

  test("rejects duplicate chapter ids and invalid clarity", () => {
    const duplicated = fixture();
    duplicated.chapters.push({ ...duplicated.chapters[0]!, notes: [], findings: [] });
    expect(() => validateSession(duplicated)).toThrow("Duplicate chapter id");
    const invalid = fixture();
    invalid.intent.clarity.score = 101;
    expect(() => validateSession(invalid)).toThrow("between 0 and 100");
  });

  test("renders the exact publishable draft", () => {
    const session = fixture();
    session.draft = {
      event: "REQUEST_CHANGES",
      body: "Please address the request flow concern.",
      comments: [{ body: "Handle the missing value here.", path: "src/api.ts", line: 81, side: "RIGHT" }],
    };
    const output = renderSummary(session);
    expect(output).toContain("Decision: **REQUEST_CHANGES**");
    expect(output).toContain("`src/api.ts:81` (RIGHT)");
    expect(output).toContain("Handle the missing value here.");
  });

  test("rejects malformed JSON on load", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "cmux-review-"));
    temporaryPaths.push(dir);
    const path = resolve(dir, "session.json");
    await writeFile(path, "not-json");
    await expect(loadSession(path)).rejects.toThrow("not valid JSON");
  });
});
