import { describe, expect, test } from "bun:test";
import { withWorkspace } from "../src/cmux-context";

describe("cmux workspace resolution", () => {
  test("uses an inherited workspace when present", () => {
    const previous = process.env.CMUX_WORKSPACE_ID;
    process.env.CMUX_WORKSPACE_ID = "workspace:test";
    try {
      expect(withWorkspace(["new-pane"])).toEqual(["new-pane", "--workspace", "workspace:test"]);
    } finally {
      if (previous === undefined) delete process.env.CMUX_WORKSPACE_ID;
      else process.env.CMUX_WORKSPACE_ID = previous;
    }
  });
});
