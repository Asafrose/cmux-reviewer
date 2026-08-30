import { spawnSync } from "node:child_process";

import { z } from "zod";

import type { ReviewSession } from "./types";

export interface PublishResult {
  html_url?: string;
  id?: number;
}

const PublishResultSchema = z.object({ html_url: z.string().optional(), id: z.number().optional() });

export function publishReview(session: ReviewSession): PublishResult {
  if (session.draft === undefined) throw new Error("Prepare a review draft before publishing");
  if (
    session.draftReviewedAt === undefined ||
    session.draftUpdatedAt === undefined ||
    session.draftReviewedAt < session.draftUpdatedAt
  ) {
    throw new Error(
      "The current draft has not passed the summary checkpoint. Run `cmux-review summary --ack` first.",
    );
  }
  if (session.publishedAt !== undefined)
    throw new Error(`This session was already published at ${session.publishedAt}`);
  const pending = session.chapters.filter((chapter) => chapter.outcome === "pending");
  if (pending.length > 0) {
    throw new Error(
      `Every chapter needs an explicit outcome. Pending: ${pending.map((chapter) => chapter.title).join(", ")}`,
    );
  }

  const payload = {
    commit_id: session.pr.headSha,
    event: session.draft.event,
    body: session.draft.body,
    comments: session.draft.comments.map((comment) => ({
      body: comment.body,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      ...(comment.startLine === undefined ? {} : { start_line: comment.startLine }),
      ...(comment.startSide === undefined ? {} : { start_side: comment.startSide }),
    })),
  };
  const endpoint = `repos/${session.pr.owner}/${session.pr.repo}/pulls/${session.pr.number}/reviews`;
  const env = { ...process.env };
  // The project requires gh to use its own authenticated credential store.
  delete env.GITHUB_TOKEN;
  const result = spawnSync("gh", ["api", "--method", "POST", endpoint, "--input", "-"], {
    env,
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || "GitHub rejected the review");
  return PublishResultSchema.parse(JSON.parse(result.stdout));
}
