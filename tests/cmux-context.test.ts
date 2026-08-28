import { describe, expect, test } from "bun:test";
import { selectCmuxWorkspace } from "../src/cmux-context";

describe("cmux workspace resolution", () => {
  test("prefers caller or focused identity over an inherited workspace", () => {
    expect(selectCmuxWorkspace({ caller: { workspace_ref: "workspace:caller" }, focused: { workspace_ref: "workspace:focused" } }, "stale-id"))
      .toBe("workspace:caller");
    expect(selectCmuxWorkspace({ caller: null, focused: { workspace_ref: "workspace:focused" } }, "stale-id"))
      .toBe("workspace:focused");
  });

  test("falls back to the inherited workspace", () => {
    expect(selectCmuxWorkspace({ caller: null, focused: null }, "workspace:inherited")).toBe("workspace:inherited");
  });
});
