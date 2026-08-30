import { describe, expect, test } from "bun:test";

import { filetypeForPath, splitFilePatches } from "./diff";

describe("splitFilePatches", () => {
  test("creates one patch per changed file", () => {
    const patches = splitFilePatches(
      `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n`,
    );
    expect(patches.map((item) => item.path)).toEqual(["src/a.ts", "README.md"]);
    expect(patches.at(0)?.patch).not.toContain("README.md");
  });
});

test("maps common file types", () => {
  expect(filetypeForPath("src/view.tsx")).toBe("tsx");
  expect(filetypeForPath("workflow.yml")).toBe("yaml");
});
