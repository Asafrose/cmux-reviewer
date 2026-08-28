import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SESSION_VERSION,
  type Chapter,
  type ReviewDraft,
  type ReviewSession,
} from "./types";

export class SessionError extends Error {}

export function defaultSessionPath(repoRoot: string, id: string): string {
  return resolve(repoRoot, ".cmux-review", "sessions", `${id}.json`);
}

export async function loadSession(path: string): Promise<ReviewSession> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new SessionError(`Cannot read review session at ${path}: ${String(error)}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionError(`Review session is not valid JSON: ${path}`);
  }
  return validateSession(value);
}

export async function saveSession(path: string, session: ReviewSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  validateSession(session);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export function validateSession(value: unknown): ReviewSession {
  if (!isRecord(value)) throw new SessionError("Session must be a JSON object");
  if (value.version !== SESSION_VERSION) {
    throw new SessionError(`Unsupported session version: ${String(value.version)}`);
  }
  for (const key of ["id", "createdAt", "updatedAt", "repoRoot"] as const) {
    requireString(value[key], key);
  }
  if (!isRecord(value.pr)) throw new SessionError("pr must be an object");
  for (const key of ["owner", "repo", "title", "url", "baseSha", "headSha"] as const) {
    requireString(value.pr[key], `pr.${key}`);
  }
  if (!Number.isInteger(value.pr.number) || Number(value.pr.number) < 1) {
    throw new SessionError("pr.number must be a positive integer");
  }
  if (!isRecord(value.intent) || !isRecord(value.intent.clarity)) {
    throw new SessionError("intent and intent.clarity must be objects");
  }
  for (const key of ["goal", "architecture"] as const) {
    requireString(value.intent[key], `intent.${key}`);
  }
  for (const key of ["tradeoffs", "inScope", "outOfScope"] as const) {
    requireStringArray(value.intent[key], `intent.${key}`);
  }
  requireString(value.intent.clarity.rationale, "intent.clarity.rationale");
  requireStringArray(value.intent.clarity.unknowns, "intent.clarity.unknowns");
  const score = value.intent.clarity.score;
  if (typeof score !== "number" || score < 0 || score > 100) {
    throw new SessionError("intent.clarity.score must be between 0 and 100");
  }
  if (!Array.isArray(value.chapters) || value.chapters.length === 0) {
    throw new SessionError("chapters must contain at least one chapter");
  }
  const ids = new Set<string>();
  for (const [index, chapter] of value.chapters.entries()) {
    validateChapter(chapter, index);
    if (ids.has(chapter.id)) throw new SessionError(`Duplicate chapter id: ${chapter.id}`);
    ids.add(chapter.id);
  }
  if (!Number.isInteger(value.currentChapter) || Number(value.currentChapter) < 0 || Number(value.currentChapter) >= value.chapters.length) {
    throw new SessionError("currentChapter is outside the chapter list");
  }
  if (value.draft !== undefined) validateDraft(value.draft);
  return value as unknown as ReviewSession;
}

export function validateDraft(value: unknown): ReviewDraft {
  if (!isRecord(value)) throw new SessionError("draft must be an object");
  if (!(["APPROVE", "REQUEST_CHANGES", "COMMENT"] as unknown[]).includes(value.event)) {
    throw new SessionError("draft.event must be APPROVE, REQUEST_CHANGES, or COMMENT");
  }
  requireString(value.body, "draft.body");
  if (!Array.isArray(value.comments)) throw new SessionError("draft.comments must be an array");
  for (const [index, comment] of value.comments.entries()) {
    if (!isRecord(comment)) throw new SessionError(`draft.comments[${index}] must be an object`);
    requireString(comment.body, `draft.comments[${index}].body`);
    requireString(comment.path, `draft.comments[${index}].path`);
    if (!Number.isInteger(comment.line) || Number(comment.line) < 1) {
      throw new SessionError(`draft.comments[${index}].line must be positive`);
    }
    if (comment.side !== "LEFT" && comment.side !== "RIGHT") {
      throw new SessionError(`draft.comments[${index}].side must be LEFT or RIGHT`);
    }
  }
  return value as unknown as ReviewDraft;
}

function validateChapter(value: unknown, index: number): asserts value is Chapter {
  if (!isRecord(value)) throw new SessionError(`chapters[${index}] must be an object`);
  for (const key of ["id", "title", "purpose"] as const) {
    requireString(value[key], `chapters[${index}].${key}`);
  }
  for (const key of ["files", "evidence", "notes", "findings"] as const) {
    if (!Array.isArray(value[key])) throw new SessionError(`chapters[${index}].${key} must be an array`);
  }
  requireStringArray(value.files, `chapters[${index}].files`);
  if (typeof value.lensRevealed !== "boolean") {
    throw new SessionError(`chapters[${index}].lensRevealed must be boolean`);
  }
  if (!("pending approved concerns unclear deferred".split(" ").includes(String(value.outcome)))) {
    throw new SessionError(`chapters[${index}].outcome is invalid`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SessionError(`${path} must be a non-empty string`);
  }
}

function requireStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SessionError(`${path} must be an array of strings`);
  }
}
