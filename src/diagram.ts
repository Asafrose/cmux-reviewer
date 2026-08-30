export function renderDiagram(source: string | undefined): string | undefined {
  if (source === undefined || source.trim() === "") return undefined;
  const lines = source
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/, "")
    .split(/\r?\n/);
  const first = lines[0]?.trim() ?? "";
  if (!/^(flowchart|graph)\s+(LR|RL|TB|TD|BT)/i.test(first)) return source.trim();

  const nodes = new Map<string, string>();
  const edges: Array<{ from: string; to: string; label?: string }> = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    const edge = line.match(/^([\w-]+)(.*?)\s*-->\s*(?:\|([^|]+)\|\s*)?([\w-]+)(.*)$/);
    if (edge) {
      const [, from, fromShape, label, to, toShape] = edge;
      if (from === undefined || to === undefined) continue;
      nodes.set(from, nodeLabel(fromShape) ?? nodes.get(from) ?? from);
      nodes.set(to, nodeLabel(toShape) ?? nodes.get(to) ?? to);
      edges.push({ from, to, ...(label === undefined ? {} : { label: cleanLabel(label) }) });
      continue;
    }
    const node = line.match(/^([\w-]+)(.*)$/);
    const id = node?.[1];
    if (id !== undefined) nodes.set(id, nodeLabel(node?.[2]) ?? id);
  }
  if (edges.length === 0) {
    const body = lines.slice(1).join("\n").trim();
    return body === "" ? source.trim() : body;
  }
  const rendered = [box(nodes.get(edges[0]?.from ?? "") ?? edges[0]?.from ?? "")];
  let previous = edges[0]?.from;
  for (const edge of edges) {
    if (previous !== edge.from) rendered.push("", box(nodes.get(edge.from) ?? edge.from));
    rendered.push(arrow(edge.label), box(nodes.get(edge.to) ?? edge.to));
    previous = edge.to;
  }
  return rendered.join("\n");
}

function arrow(label: string | undefined): string {
  return `      │${label === undefined ? "" : `  ${label}`}\n      ▼`;
}

function box(label: string): string {
  const clean = cleanLabel(label).slice(0, 28);
  const width = clean.length + 2;
  return `╭${"─".repeat(width)}╮\n│ ${clean} │\n╰${"─".repeat(width)}╯`;
}

function nodeLabel(shape: string | undefined): string | undefined {
  if (shape === undefined || shape.trim() === "") return undefined;
  const clean = shape.trim();
  return (
    clean.match(/^\[\((.*?)\)\]$/)?.[1] ?? clean.match(/^\[(.*?)\]$/)?.[1] ?? clean.match(/^\((.*?)\)$/)?.[1]
  );
}

function cleanLabel(value: string): string {
  return value.trim().replaceAll(/^['"]|['"]$/gu, "");
}
