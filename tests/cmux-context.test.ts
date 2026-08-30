import { describe, expect, test } from "bun:test";

import { selectCmuxBinding } from "../src/cmux-context";

describe("cmux agent binding resolution", () => {
  test("prefers caller or focused identity over an inherited workspace", () => {
    expect(
      selectCmuxBinding(
        {
          caller: { workspace_ref: "workspace:caller", surface_ref: "surface:caller" },
          focused: { workspace_ref: "workspace:focused", surface_ref: "surface:focused" },
        },
        "workspace:stale",
        "surface:stale",
      ),
    ).toEqual({ workspace: "workspace:caller", surface: "surface:caller" });
    expect(
      selectCmuxBinding({
        caller: null,
        focused: { workspace_ref: "workspace:focused", surface_ref: "surface:focused" },
      }),
    ).toEqual({ workspace: "workspace:focused", surface: "surface:focused" });
  });

  test("falls back to the inherited workspace", () => {
    expect(
      selectCmuxBinding({ caller: null, focused: null }, "workspace:inherited", "surface:inherited"),
    ).toEqual({ workspace: "workspace:inherited", surface: "surface:inherited" });
  });

  test("does not create a partial binding", () => {
    expect(selectCmuxBinding({ caller: { workspace_ref: "workspace:caller" } })).toBeUndefined();
  });
});
