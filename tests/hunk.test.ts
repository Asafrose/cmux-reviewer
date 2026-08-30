import { describe, expect, test } from "bun:test";

import { parseHunkNotes } from "../src/hunk";

describe("Hunk note import", () => {
  test("normalizes new-side and old-side user comments", () => {
    const notes = parseHunkNotes([
      { id: "new", filePath: "src/new.ts", newLine: 18, summary: "Handle the empty case." },
      { id: "old", filePath: "src/old.ts", old_line: 7, body: "Was removing this intentional?" },
    ]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ id: "hunk:new", path: "src/new.ts", line: 18, side: "RIGHT" });
    expect(notes[1]).toMatchObject({ id: "hunk:old", path: "src/old.ts", line: 7, side: "LEFT" });
  });

  test("accepts an object wrapper and skips incomplete comments", () => {
    const notes = parseHunkNotes({
      comments: [
        { file: "README.md", new_line: 3, rationale: "Clarify this statement." },
        { file: "README.md", summary: "No location" },
      ],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe("Clarify this statement.");
  });

  test("normalizes the live Hunk 0.18 user-note shape", () => {
    const notes = parseHunkNotes({
      comments: [
        {
          noteId: "user:123-1",
          source: "user",
          filePath: "README.md",
          newRange: [4, 6],
          body: "Clarify this section.",
          createdAt: "2026-08-28T09:22:23.817Z",
        },
      ],
    });
    expect(notes).toEqual([
      {
        id: "hunk:user:123-1",
        body: "Clarify this section.",
        createdAt: "2026-08-28T09:22:23.817Z",
        path: "README.md",
        line: 6,
        side: "RIGHT",
      },
    ]);
  });
});
