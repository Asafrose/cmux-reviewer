import { expect, test } from "bun:test";

import { renderDiagram } from "./diagram";

test("turns Mermaid shapes and labeled arrows into a compact terminal diagram", () => {
  const output = renderDiagram("flowchart LR\n A[Agent] -->|commands| S[(Session JSON)]\n S --> C[Chapter]");
  expect(output).toContain("Agent");
  expect(output).toContain("commands");
  expect(output).toContain("Session JSON");
  expect(output).toContain("▼");
  expect(output).not.toContain("flowchart");
});
