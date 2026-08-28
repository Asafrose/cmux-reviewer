import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { installSkill } from "../src/install";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("skill installer", () => {
  test("links the repository skill without overwriting", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "cmux-review-skill-"));
    temporaryPaths.push(root);
    const target = await installSkill(root);
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(await installSkill(root)).toBe(target);
  });
});
