import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { SESSION_VERSION, type ReviewDraft, type ReviewSession } from "./types";

export class SessionError extends Error {}

const NonEmptyString = z.string().trim().min(1);
const DiffSideSchema = z.enum(["LEFT", "RIGHT"]);
const OutcomeSchema = z.enum(["pending", "approved", "concerns", "unclear", "deferred"]);
const ReviewEventSchema = z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
const EvidenceSchema = z.object({
  source: NonEmptyString,
  detail: NonEmptyString,
  url: NonEmptyString.optional(),
  confidence: z.enum(["known", "inferred", "unknown"]),
});
const NoteSchema = z.object({
  id: NonEmptyString,
  body: NonEmptyString,
  createdAt: NonEmptyString,
  path: NonEmptyString.optional(),
  line: z.number().int().positive().optional(),
  side: DiffSideSchema.optional(),
  promoted: z.boolean().optional(),
});
const FindingSchema = z.object({
  id: NonEmptyString,
  body: NonEmptyString,
  status: z.enum(["observation", "concern", "confirmed", "publishable", "dismissed"]),
  path: NonEmptyString.optional(),
  line: z.number().int().positive().optional(),
  side: DiffSideSchema.optional(),
  startLine: z.number().int().positive().optional(),
  startSide: DiffSideSchema.optional(),
});
const LensSchema = z.object({
  summary: NonEmptyString,
  opinion: NonEmptyString.optional(),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
});
const ChapterSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  purpose: NonEmptyString,
  files: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  lens: LensSchema.optional(),
  lensRevealed: z.boolean(),
  diagram: z.string().optional(),
  notes: z.array(NoteSchema),
  findings: z.array(FindingSchema),
  outcome: OutcomeSchema,
});
const PrSchema = z.object({
  owner: NonEmptyString,
  repo: NonEmptyString,
  number: z.number().int().positive(),
  title: NonEmptyString,
  url: NonEmptyString,
  baseSha: NonEmptyString,
  headSha: NonEmptyString,
});
const IntentSchema = z.object({
  goal: NonEmptyString,
  architecture: NonEmptyString,
  tradeoffs: z.array(z.string()),
  inScope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  clarity: z.object({
    score: z.number().min(0).max(100),
    rationale: NonEmptyString,
    unknowns: z.array(z.string()),
  }),
});
const DraftSchema = z.object({
  event: ReviewEventSchema,
  body: z.string(),
  comments: z.array(
    z.object({
      body: NonEmptyString,
      path: NonEmptyString,
      line: z.number().int().positive(),
      side: DiffSideSchema,
      startLine: z.number().int().positive().optional(),
      startSide: DiffSideSchema.optional(),
      chapterId: NonEmptyString.optional(),
    }),
  ),
});
const SessionSchema = z
  .object({
    version: z.literal(SESSION_VERSION),
    id: NonEmptyString,
    createdAt: NonEmptyString,
    updatedAt: NonEmptyString,
    repoRoot: NonEmptyString,
    pr: PrSchema,
    intent: IntentSchema,
    chapters: z.array(ChapterSchema).min(1),
    currentChapter: z.number().int().nonnegative(),
    draft: DraftSchema.optional(),
    draftUpdatedAt: NonEmptyString.optional(),
    draftReviewedAt: NonEmptyString.optional(),
    publishedAt: NonEmptyString.optional(),
    publishedUrl: NonEmptyString.optional(),
  })
  .superRefine((session, context) => {
    if (session.currentChapter >= session.chapters.length) {
      context.addIssue({ code: "custom", path: ["currentChapter"], message: "outside the chapter list" });
    }
    const ids = new Set(session.chapters.map((chapter) => chapter.id));
    if (ids.size !== session.chapters.length) {
      context.addIssue({ code: "custom", path: ["chapters"], message: "chapter ids must be unique" });
    }
  });
const ManifestSchema = z.object({
  id: NonEmptyString.optional(),
  createdAt: NonEmptyString.optional(),
  repoRoot: NonEmptyString.optional(),
  pr: PrSchema,
  intent: IntentSchema,
  chapters: z.array(ChapterSchema).min(1),
  currentChapter: z.number().int().nonnegative().optional(),
});

export type ReviewManifest = z.output<typeof ManifestSchema>;

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
  try {
    return validateSession(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SessionError) throw error;
    throw new SessionError(`Review session is invalid at ${path}: ${formatValidationError(error)}`);
  }
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
  return parseWithSchema(SessionSchema, value, "Session");
}

export function validateManifest(value: unknown): ReviewManifest {
  return parseWithSchema(ManifestSchema, value, "Manifest");
}

export function validateDraft(value: unknown): ReviewDraft {
  return parseWithSchema(DraftSchema, value, "Draft");
}

function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SessionError(`${name} is invalid: ${z.prettifyError(result.error)}`);
  return result.data;
}

function formatValidationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
