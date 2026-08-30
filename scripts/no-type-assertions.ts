import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import ts from "typescript";

const root = process.cwd();
const glob = new Bun.Glob("{src,tests,scripts}/**/*.{ts,tsx}");
const violations: string[] = [];

for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
  visit(source, path, source);
}

if (violations.length > 0) {
  console.error("Type assertions are forbidden:\n" + violations.join("\n"));
  process.exitCode = 1;
}

function visit(node: ts.Node, path: string, source: ts.SourceFile): void {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push(`${relative(root, path)}:${position.line + 1}:${position.character + 1}`);
  }
  ts.forEachChild(node, (child) => visit(child, path, source));
}
