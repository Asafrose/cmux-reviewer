import { stdin, stdout } from "node:process";
import { openChapterDiff } from "./cmux";
import { renderSummary } from "./summary";
import { saveSession } from "./session";
import { readHunkUserNotes } from "./hunk";
import type { ChapterOutcome, ReviewSession } from "./types";

const color = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const badges: Record<ChapterOutcome, string> = {
  pending: `${color.dim}PENDING${color.reset}`,
  approved: `${color.green}APPROVED${color.reset}`,
  concerns: `${color.red}CONCERNS${color.reset}`,
  unclear: `${color.yellow}UNCLEAR${color.reset}`,
  deferred: `${color.cyan}DEFERRED${color.reset}`,
};

export async function runTui(session: ReviewSession, sessionPath: string): Promise<void> {
  if (!stdin.isTTY) throw new Error("The interactive review requires a TTY");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  const input = stdin[Symbol.asyncIterator]() as AsyncIterator<string>;
  render(session);

  try {
    while (true) {
      const next = await input.next();
      if (next.done) break;
      const key = next.value;
      if (key === "q" || key === "\u0003") break;
      const chapter = session.chapters[session.currentChapter]!;
      if (key === "j" || key === "\u001b[B") session.currentChapter = Math.min(session.currentChapter + 1, session.chapters.length - 1);
      if (key === "k" || key === "\u001b[A") session.currentChapter = Math.max(session.currentChapter - 1, 0);
      if (key === "l") chapter.lensRevealed = !chapter.lensRevealed;
      if (key === "a") chapter.outcome = "approved";
      if (key === "c") chapter.outcome = "concerns";
      if (key === "u") chapter.outcome = "unclear";
      if (key === "d") chapter.outcome = "deferred";
      if (key === "o") {
        await saveSession(sessionPath, session);
        await openChapterDiff(session, chapter, sessionPath);
      }
      if (key === "n") await captureNote(session, sessionPath, input);
      if (key === "i") await syncHunkNotes(session, sessionPath, input);
      if (key === "s") await showSummary(session, sessionPath, input);
      await saveSession(sessionPath, session);
      render(session);
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[2J\x1b[H");
  }
}

function render(session: ReviewSession): void {
  const chapter = session.chapters[session.currentChapter]!;
  const completed = session.chapters.filter((item) => item.outcome !== "pending").length;
  const width = Math.max(50, Math.min(stdout.columns || 90, 110));
  const divider = "─".repeat(width);
  const clarityColor = session.intent.clarity.score >= 75 ? color.green : session.intent.clarity.score >= 50 ? color.yellow : color.red;
  const lines = [
    "\x1b[2J\x1b[H",
    `${color.bold}${session.pr.title}${color.reset}`,
    `${color.dim}${session.pr.url}${color.reset}`,
    `${clarityColor}Intent clarity ${session.intent.clarity.score}/100${color.reset} · ${session.intent.clarity.rationale}`,
    divider,
    `${color.bold}Chapter ${session.currentChapter + 1}/${session.chapters.length}: ${chapter.title}${color.reset}  ${badges[chapter.outcome]}`,
    chapter.purpose,
    "",
    `${color.dim}Files:${color.reset} ${chapter.files.join(", ") || "cross-cutting context"}`,
    `${color.dim}Evidence:${color.reset}`,
    ...chapter.evidence.map((item) => `  ${item.confidence === "known" ? "●" : item.confidence === "inferred" ? "◐" : "○"} ${item.detail} (${item.source})`),
  ];

  if (chapter.diagram) lines.push("", `${color.bold}Diagram${color.reset}`, chapter.diagram);
  lines.push("", `${color.bold}LLM Lens${color.reset} ${chapter.lensRevealed ? "(open)" : "(hidden — press l)"}`);
  if (chapter.lensRevealed && chapter.lens) {
    lines.push(chapter.lens.summary);
    if (chapter.lens.opinion) lines.push(`Opinion: ${chapter.lens.opinion}`);
    for (const risk of chapter.lens.risks) lines.push(`  ! ${risk}`);
    for (const question of chapter.lens.questions) lines.push(`  ? ${question}`);
  }
  lines.push(
    "",
    `${color.dim}${chapter.notes.length} notes · ${chapter.findings.length} findings · ${completed}/${session.chapters.length} chapters decided${color.reset}`,
    divider,
    "j/k navigate  o open diff  i sync Hunk notes  l lens  n note  a approve  c concerns  u unclear  d defer  s summary  q quit",
  );
  stdout.write(lines.join("\n"));
}

async function syncHunkNotes(session: ReviewSession, sessionPath: string, input: AsyncIterator<string>): Promise<void> {
  const chapter = session.chapters[session.currentChapter]!;
  try {
    const notes = readHunkUserNotes(session.repoRoot).filter((note) => chapter.files.length === 0 || chapter.files.includes(note.path || ""));
    const existing = new Set(chapter.notes.map((note) => note.id));
    const imported = notes.filter((note) => !existing.has(note.id));
    chapter.notes.push(...imported);
    await saveSession(sessionPath, session);
    await promptRaw(input, `Imported ${imported.length} new Hunk note(s). Press enter.`);
  } catch (error) {
    await promptRaw(input, `${error instanceof Error ? error.message : String(error)}. Press enter.`);
  }
}

async function captureNote(session: ReviewSession, sessionPath: string, input: AsyncIterator<string>): Promise<void> {
  stdout.write("\n\n");
  const kind = (await promptRaw(input, "Note type — [g]eneral or [i]nline? ")).trim().toLowerCase();
  const body = (await promptRaw(input, "Note: ")).trim();
  if (body) {
    const note = {
      id: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
    } as ReviewSession["chapters"][number]["notes"][number];
    if (kind === "i" || kind === "inline") {
      const path = (await promptRaw(input, "Repository-relative path: ")).trim();
      const line = Number((await promptRaw(input, "Diff line number: ")).trim());
      const side = (await promptRaw(input, "Side [R]IGHT/[L]EFT: ")).trim().toUpperCase();
      if (!path || !Number.isInteger(line) || line < 1 || (side !== "R" && side !== "RIGHT" && side !== "L" && side !== "LEFT")) {
        await promptRaw(input, "Invalid inline location; note was not saved. Press enter.");
        return;
      }
      note.path = path;
      note.line = line;
      note.side = side.startsWith("R") ? "RIGHT" : "LEFT";
    }
    session.chapters[session.currentChapter]!.notes.push(note);
    await saveSession(sessionPath, session);
  }
}

async function showSummary(session: ReviewSession, sessionPath: string, input: AsyncIterator<string>): Promise<void> {
  stdout.write(`\x1b[2J\x1b[H${renderSummary(session)}\n`);
  const answer = (await promptRaw(input, "Acknowledge this exact draft as reviewed? [y/N] ")).trim().toLowerCase();
  if (answer === "y" || answer === "yes") {
    session.draftReviewedAt = new Date().toISOString();
    await saveSession(sessionPath, session);
  }
  await promptRaw(input, "Press enter to return to the walkthrough.");
}

async function promptRaw(input: AsyncIterator<string>, prompt: string): Promise<string> {
  stdout.write(prompt);
  let value = "";
  while (true) {
    const next = await input.next();
    if (next.done) return value;
    for (const character of next.value) {
      if (character === "\r" || character === "\n") {
        stdout.write("\n");
        return value;
      }
      if (character === "\u0003") throw new Error("Interrupted");
      if (character === "\u007f" || character === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (character >= " ") {
        value += character;
        stdout.write(character);
      }
    }
  }
}
