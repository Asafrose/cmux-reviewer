#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { publishReview } from "./github";
import { readHunkUserNotes } from "./hunk";
import { installSkill } from "./install";
import { openChapterDiff } from "./cmux";
import {
  defaultSessionPath,
  loadSession,
  saveSession,
  SessionError,
  validateDraft,
  validateSession,
} from "./session";
import { renderSummary } from "./summary";
import { SESSION_VERSION, type ChapterOutcome, type ReviewSession } from "./types";

const args = process.argv.slice(2);
const command = args.shift();

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else if (command === "init") {
    await initCommand(args);
  } else if (command === "launch") {
    const sessionPath = await resolveSessionArg(args);
    const session = await loadSession(sessionPath);
    await openChapterDiff(session, session.chapters[session.currentChapter]!, sessionPath);
    console.log(session.chapters[session.currentChapter]!.id);
  } else if (command === "install-skill") {
    const skillsDir = takeOption(args, "--skills-dir");
    rejectExtra(args);
    console.log(await installSkill(skillsDir));
  } else if (command === "show") {
    const sessionPath = await resolveSessionArg(args);
    console.log(JSON.stringify(await loadSession(sessionPath), null, 2));
  } else if (command === "summary") {
    await summaryCommand(args);
  } else if (command === "draft") {
    await draftCommand(args);
  } else if (command === "note") {
    await noteCommand(args);
  } else if (command === "outcome") {
    await outcomeCommand(args);
  } else if (command === "chapter") {
    await chapterCommand(args);
  } else if (command === "sync-hunk") {
    await syncHunkCommand(args);
  } else if (command === "publish") {
    await publishCommand(args);
  } else {
    throw new SessionError(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`cmux-review: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function initCommand(commandArgs: string[]): Promise<void> {
  const manifestPath = requireOption(commandArgs, "--manifest");
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as Record<string, unknown>;
  const now = new Date().toISOString();
  const pr = manifest.pr as Record<string, unknown> | undefined;
  if (!pr) throw new SessionError("Manifest must include pr metadata");
  const repoRoot = resolve(String(manifest.repoRoot || process.cwd()));
  const defaultId = `${String(pr.owner)}-${String(pr.repo)}-pr-${String(pr.number)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const session = validateSession({
    ...manifest,
    version: SESSION_VERSION,
    id: manifest.id || defaultId,
    createdAt: manifest.createdAt || now,
    updatedAt: now,
    repoRoot,
    currentChapter: manifest.currentChapter ?? 0,
  });
  const explicitPath = takeOption(commandArgs, "--session");
  rejectExtra(commandArgs);
  const sessionPath = resolve(explicitPath || defaultSessionPath(repoRoot, session.id));
  await saveSession(sessionPath, session);
  await setCurrentSession(repoRoot, sessionPath);
  console.log(sessionPath);
}

async function summaryCommand(commandArgs: string[]): Promise<void> {
  const acknowledge = takeFlag(commandArgs, "--ack");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  process.stdout.write(renderSummary(session));
  if (acknowledge) {
    if (!session.draft) throw new SessionError("There is no draft to acknowledge");
    session.draftReviewedAt = new Date().toISOString();
    await saveSession(sessionPath, session);
    console.error("Draft summary acknowledged.");
  }
}

async function draftCommand(commandArgs: string[]): Promise<void> {
  const file = requireOption(commandArgs, "--file");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  session.draft = validateDraft(JSON.parse(await readFile(resolve(file), "utf8")));
  session.draftUpdatedAt = new Date().toISOString();
  delete session.draftReviewedAt;
  await saveSession(sessionPath, session);
  console.log(`Draft updated with ${session.draft.comments.length} inline comment(s).`);
}

async function noteCommand(commandArgs: string[]): Promise<void> {
  const chapterId = requireOption(commandArgs, "--chapter");
  const body = requireOption(commandArgs, "--body");
  const path = takeOption(commandArgs, "--path");
  const lineText = takeOption(commandArgs, "--line");
  const sideText = takeOption(commandArgs, "--side");
  const promoted = takeFlag(commandArgs, "--promote");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  const chapter = findChapter(session, chapterId);
  const line = lineText ? Number(lineText) : undefined;
  if (line !== undefined && (!Number.isInteger(line) || line < 1)) throw new SessionError("--line must be a positive integer");
  if (sideText && sideText !== "LEFT" && sideText !== "RIGHT") throw new SessionError("--side must be LEFT or RIGHT");
  chapter.notes.push({
    id: crypto.randomUUID(),
    body,
    createdAt: new Date().toISOString(),
    ...(path ? { path } : {}),
    ...(line ? { line } : {}),
    ...(sideText ? { side: sideText } : {}),
    ...(promoted ? { promoted: true } : {}),
  });
  await saveSession(sessionPath, session);
  console.log(`Note added to ${chapter.title}.`);
}

async function outcomeCommand(commandArgs: string[]): Promise<void> {
  const chapterId = requireOption(commandArgs, "--chapter");
  const outcome = requireOption(commandArgs, "--set") as ChapterOutcome;
  if (!("pending approved concerns unclear deferred".split(" ").includes(outcome))) {
    throw new SessionError("--set must be pending, approved, concerns, unclear, or deferred");
  }
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  findChapter(session, chapterId).outcome = outcome;
  await saveSession(sessionPath, session);
  console.log(`${chapterId}: ${outcome}`);
}

async function syncHunkCommand(commandArgs: string[]): Promise<void> {
  const chapterId = requireOption(commandArgs, "--chapter");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  const chapter = findChapter(session, chapterId);
  const notes = readHunkUserNotes(session.repoRoot).filter((note) => chapter.files.length === 0 || chapter.files.includes(note.path || ""));
  const existing = new Set(chapter.notes.map((note) => note.id));
  const imported = notes.filter((note) => !existing.has(note.id));
  chapter.notes.push(...imported);
  await saveSession(sessionPath, session);
  console.log(`Imported ${imported.length} new inline Hunk note(s) into ${chapter.title}.`);
}

async function chapterCommand(commandArgs: string[]): Promise<void> {
  const chapterId = requireOption(commandArgs, "--select");
  const open = takeFlag(commandArgs, "--open");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  const index = session.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) throw new SessionError(`Unknown chapter: ${chapterId}`);
  session.currentChapter = index;
  await saveSession(sessionPath, session);
  if (open) await openChapterDiff(session, session.chapters[index]!, sessionPath);
  console.log(`${index + 1}/${session.chapters.length}: ${session.chapters[index]!.title}`);
}

async function publishCommand(commandArgs: string[]): Promise<void> {
  const confirmed = takeFlag(commandArgs, "--confirm");
  if (!confirmed) throw new SessionError("Publishing is external and irreversible. Re-run with --confirm after reviewing the summary.");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  const result = publishReview(session);
  session.publishedAt = new Date().toISOString();
  session.publishedUrl = result.html_url;
  await saveSession(sessionPath, session);
  console.log(result.html_url || `Published review ${String(result.id || "")}`.trim());
}

async function resolveSessionArg(commandArgs: string[]): Promise<string> {
  const explicit = takeOption(commandArgs, "--session");
  rejectExtra(commandArgs);
  if (explicit) return resolve(explicit);
  try {
    return (await readFile(resolve(process.cwd(), ".cmux-review", "current"), "utf8")).trim();
  } catch {
    throw new SessionError("No current session. Pass --session or run `cmux-review init` first.");
  }
}

async function setCurrentSession(repoRoot: string, sessionPath: string): Promise<void> {
  const pointer = resolve(repoRoot, ".cmux-review", "current");
  await mkdir(dirname(pointer), { recursive: true });
  await writeFile(pointer, `${sessionPath}\n`, "utf8");
}

function findChapter(session: ReviewSession, id: string) {
  const chapter = session.chapters.find((item) => item.id === id);
  if (!chapter) throw new SessionError(`Unknown chapter: ${id}`);
  return chapter;
}

function takeOption(commandArgs: string[], name: string): string | undefined {
  const index = commandArgs.indexOf(name);
  if (index < 0) return undefined;
  const value = commandArgs[index + 1];
  if (!value || value.startsWith("--")) throw new SessionError(`${name} requires a value`);
  commandArgs.splice(index, 2);
  return value;
}

function requireOption(commandArgs: string[], name: string): string {
  const value = takeOption(commandArgs, name);
  if (!value) throw new SessionError(`Missing required option ${name}`);
  return value;
}

function takeFlag(commandArgs: string[], name: string): boolean {
  const index = commandArgs.indexOf(name);
  if (index < 0) return false;
  commandArgs.splice(index, 1);
  return true;
}

function rejectExtra(commandArgs: string[]): void {
  if (commandArgs.length > 0) throw new SessionError(`Unexpected argument: ${commandArgs[0]}`);
}

function printHelp(): void {
  console.log(`cmux-review — narrated, chapter-based code review

Usage:
  cmux-review init --manifest <file> [--session <file>]
  cmux-review launch [--session <file>]
  cmux-review install-skill [--skills-dir <directory>]
  cmux-review show [--session <file>]
  cmux-review note --chapter <id> --body <text> [--path <file> --line <n> --side LEFT|RIGHT] [--promote]
  cmux-review outcome --chapter <id> --set pending|approved|concerns|unclear|deferred
  cmux-review chapter --select <id> [--open] [--session <file>]
  cmux-review sync-hunk --chapter <id> [--session <file>]
  cmux-review draft --file <draft.json> [--session <file>]
  cmux-review summary [--ack] [--session <file>]
  cmux-review publish --confirm [--session <file>]
`);
}
