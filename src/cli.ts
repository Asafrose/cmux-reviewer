#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { launchCompanion } from "./cmux";
import { runCompanion } from "./companion";
import { publishReview } from "./github";
import { readHunkUserNotes } from "./hunk";
import { installSkill } from "./install";
import {
  defaultSessionPath,
  loadSession,
  saveSession,
  SessionError,
  validateDraft,
  validateManifest,
  validateSession,
} from "./session";
import { renderSummary } from "./summary";
import { SESSION_VERSION, type ChapterOutcome, type DiffSide, type ReviewSession } from "./types";

const args = process.argv.slice(2);
const command = args.shift();

try {
  if (
    command === undefined ||
    command === "" ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
  } else if (command === "init") {
    await initCommand(args);
  } else if (command === "launch") {
    const sessionPath = await resolveSessionArg(args);
    const session = await loadSession(sessionPath);
    console.log(await launchCompanion(session, sessionPath));
  } else if (command === "companion") {
    await companionCommand(args);
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
  const manifest = validateManifest(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
  const now = new Date().toISOString();
  const pr = manifest.pr;
  const repoRoot = resolve(manifest.repoRoot ?? process.cwd());
  const defaultId = `${pr.owner}-${pr.repo}-pr-${pr.number}`.toLowerCase().replaceAll(/[^a-z0-9-]/gu, "-");
  const session = validateSession({
    ...manifest,
    version: SESSION_VERSION,
    id: manifest.id ?? defaultId,
    createdAt: manifest.createdAt ?? now,
    updatedAt: now,
    repoRoot,
    currentChapter: manifest.currentChapter ?? 0,
  });
  const explicitPath = takeOption(commandArgs, "--session");
  rejectExtra(commandArgs);
  const sessionPath = resolve(explicitPath ?? defaultSessionPath(repoRoot, session.id));
  await saveSession(sessionPath, session);
  await setCurrentSession(repoRoot, sessionPath);
  console.log(sessionPath);
}

async function companionCommand(commandArgs: string[]): Promise<void> {
  const pane = requireOption(commandArgs, "--pane");
  const surface = requireOption(commandArgs, "--surface");
  const workspace = requireOption(commandArgs, "--workspace");
  const sessionPath = await resolveSessionArg(commandArgs);
  await runCompanion(sessionPath, { pane, surface, workspace });
}

async function summaryCommand(commandArgs: string[]): Promise<void> {
  const acknowledge = takeFlag(commandArgs, "--ack");
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  process.stdout.write(renderSummary(session));
  if (acknowledge) {
    if (session.draft === undefined) throw new SessionError("There is no draft to acknowledge");
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
  const line = lineText === undefined ? undefined : Number(lineText);
  if (line !== undefined && (!Number.isInteger(line) || line < 1))
    throw new SessionError("--line must be a positive integer");
  const side = sideText === undefined ? undefined : parseDiffSide(sideText);
  chapter.notes.push({
    id: crypto.randomUUID(),
    body,
    createdAt: new Date().toISOString(),
    ...(path === undefined ? {} : { path }),
    ...(line === undefined ? {} : { line }),
    ...(side === undefined ? {} : { side }),
    ...(promoted ? { promoted: true } : {}),
  });
  await saveSession(sessionPath, session);
  console.log(`Note added to ${chapter.title}.`);
}

async function outcomeCommand(commandArgs: string[]): Promise<void> {
  const chapterId = requireOption(commandArgs, "--chapter");
  const outcome = parseOutcome(requireOption(commandArgs, "--set"));
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
  const notes = readHunkUserNotes(session.repoRoot).filter(
    (note) => chapter.files.length === 0 || chapter.files.includes(note.path ?? ""),
  );
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
  const chapter = chapterAt(session, index);
  if (open) await launchCompanion(session, sessionPath);
  console.log(`${index + 1}/${session.chapters.length}: ${chapter.title}`);
}

async function publishCommand(commandArgs: string[]): Promise<void> {
  const confirmed = takeFlag(commandArgs, "--confirm");
  if (!confirmed)
    throw new SessionError(
      "Publishing is external and irreversible. Re-run with --confirm after reviewing the summary.",
    );
  const sessionPath = await resolveSessionArg(commandArgs);
  const session = await loadSession(sessionPath);
  const result = publishReview(session);
  session.publishedAt = new Date().toISOString();
  session.publishedUrl = result.html_url;
  await saveSession(sessionPath, session);
  console.log(result.html_url ?? `Published review ${String(result.id ?? "")}`.trim());
}

async function resolveSessionArg(commandArgs: string[]): Promise<string> {
  const explicit = takeOption(commandArgs, "--session");
  rejectExtra(commandArgs);
  if (explicit !== undefined && explicit !== "") return resolve(explicit);
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
  if (chapter === undefined) throw new SessionError(`Unknown chapter: ${id}`);
  return chapter;
}

function chapterAt(session: ReviewSession, index: number) {
  const chapter = session.chapters[index];
  if (chapter === undefined) throw new SessionError(`Chapter index is outside the chapter list: ${index}`);
  return chapter;
}

function parseDiffSide(value: string): DiffSide {
  if (value === "LEFT" || value === "RIGHT") return value;
  throw new SessionError("--side must be LEFT or RIGHT");
}

function parseOutcome(value: string): ChapterOutcome {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "concerns" ||
    value === "unclear" ||
    value === "deferred"
  ) {
    return value;
  }
  throw new SessionError("--set must be pending, approved, concerns, unclear, or deferred");
}

function takeOption(commandArgs: string[], name: string): string | undefined {
  const index = commandArgs.indexOf(name);
  if (index < 0) return undefined;
  const value = commandArgs[index + 1];
  if (value === undefined || value === "" || value.startsWith("--"))
    throw new SessionError(`${name} requires a value`);
  commandArgs.splice(index, 2);
  return value;
}

function requireOption(commandArgs: string[], name: string): string {
  const value = takeOption(commandArgs, name);
  if (value === undefined || value === "") throw new SessionError(`Missing required option ${name}`);
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
  cmux-review companion --session <file> --pane <ref> --surface <ref> --workspace <ref>
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
