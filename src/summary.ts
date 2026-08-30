import type { ChapterOutcome, ReviewSession } from "./types";

const outcomeLabels: Record<ChapterOutcome, string> = {
  pending: "Pending",
  approved: "Approved",
  concerns: "Concerns",
  unclear: "Unclear",
  deferred: "Deferred",
};

export function renderSummary(session: ReviewSession): string {
  const lines = [
    `# Review summary: ${session.pr.title}`,
    "",
    `PR: ${session.pr.url}`,
    `Intent clarity: ${session.intent.clarity.score}/100 — ${session.intent.clarity.rationale}`,
    "",
    "## Chapters",
    "",
  ];

  for (const [index, chapter] of session.chapters.entries()) {
    lines.push(`${index + 1}. **${chapter.title}** — ${outcomeLabels[chapter.outcome]}`);
  }

  if (session.intent.clarity.unknowns.length > 0) {
    lines.push("", "## Unresolved intent", "");
    for (const unknown of session.intent.clarity.unknowns) lines.push(`- ${unknown}`);
  }

  lines.push("", "## Exact GitHub review", "");
  if (session.draft === undefined) {
    lines.push("No review draft has been prepared.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    `Decision: **${session.draft.event}**`,
    "",
    session.draft.body === "" ? "_(No review body)_" : session.draft.body,
    "",
    "## Inline comments",
    "",
  );
  if (session.draft.comments.length === 0) {
    lines.push("No inline comments.");
  } else {
    session.draft.comments.forEach((comment, index) => {
      const range =
        comment.startLine === undefined ? String(comment.line) : `${comment.startLine}-${comment.line}`;
      lines.push(`${index + 1}. \`${comment.path}:${range}\` (${comment.side})`, "", `   ${comment.body}`);
    });
  }
  return `${lines.join("\n")}\n`;
}
