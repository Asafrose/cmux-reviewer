export const SESSION_VERSION = 1 as const;

export type ChapterOutcome =
  | "pending"
  | "approved"
  | "concerns"
  | "unclear"
  | "deferred";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
export type DiffSide = "LEFT" | "RIGHT";

export interface Evidence {
  source: string;
  detail: string;
  url?: string;
  confidence: "known" | "inferred" | "unknown";
}

export interface ReviewNote {
  id: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
  side?: DiffSide;
  promoted?: boolean;
}

export interface Finding {
  id: string;
  body: string;
  status: "observation" | "concern" | "confirmed" | "publishable" | "dismissed";
  path?: string;
  line?: number;
  side?: DiffSide;
  startLine?: number;
  startSide?: DiffSide;
}

export interface ChapterLens {
  summary: string;
  opinion?: string;
  risks: string[];
  questions: string[];
}

export interface Chapter {
  id: string;
  title: string;
  purpose: string;
  files: string[];
  evidence: Evidence[];
  lens?: ChapterLens;
  lensRevealed: boolean;
  diagram?: string;
  notes: ReviewNote[];
  findings: Finding[];
  outcome: ChapterOutcome;
}

export interface IntentClarity {
  score: number;
  rationale: string;
  unknowns: string[];
}

export interface ReviewIntent {
  goal: string;
  architecture: string;
  tradeoffs: string[];
  inScope: string[];
  outOfScope: string[];
  clarity: IntentClarity;
}

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  baseSha: string;
  headSha: string;
}

export interface DraftComment {
  body: string;
  path: string;
  line: number;
  side: DiffSide;
  startLine?: number;
  startSide?: DiffSide;
  chapterId?: string;
}

export interface ReviewDraft {
  event: ReviewEvent;
  body: string;
  comments: DraftComment[];
}

export interface ReviewSession {
  version: typeof SESSION_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  pr: PullRequestRef;
  intent: ReviewIntent;
  chapters: Chapter[];
  currentChapter: number;
  draft?: ReviewDraft;
  draftUpdatedAt?: string;
  draftReviewedAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
}
