---
name: narrated-code-review
description: Guide a human through a GitHub pull request as a persistent, narrated sequence of digestible chapters in cmux, then prepare concise review comments for explicit approval. Use when asked to review, walk through, or understand a GitHub PR with cmux-reviewer. Do not run builds, tests, or linters.
---

# Narrated Code Review

Turn a GitHub pull request into a collaborative walkthrough of decisions rather than a file-by-file diff dump. The reviewer remains the decision-maker.

## Prepare the story

Gather intent from every source available to the current agent: PR title and description, labels, comments, linked tickets, commits, repository documentation, tests as readable evidence, and relevant surrounding code. Follow linked tickets using the agent's available integrations. Never present inferred intent as fact.

When using `gh`, first unset `GITHUB_TOKEN`, for example `env -u GITHUB_TOKEN gh pr view ...`.

Do not run tests, builds, linters, formatters, or automated validation. Read code beyond the diff when it helps explain callers, downstream behavior, or external flows. An issue found there may be promoted into the current review when the reviewer chooses.

Create the chapter plan once before beginning. The first chapter establishes the goal, architecture, tradeoffs, scope, and unresolved intent. Remaining chapters are the smallest units a person can understand and approve independently, ordered as a coherent learning path rather than by filename. Modify the plan later only when discovery makes the original structure misleading.

Score intent clarity from 0–100. Explain the score, list missing context, and tag evidence as `known`, `inferred`, or `unknown`. Add a compact Mermaid or ASCII diagram automatically when it materially clarifies a relationship or flow.

Read [references/session-protocol.md](references/session-protocol.md) before creating or changing a review session. Initialize the session with `cmux-review init`, then use `cmux-review launch` to open the persistent walkthrough beside the current agent pane.

## Walk through each chapter

Present the chapter's purpose and evidence without revealing the model's verdict. Put analysis, risks, opinion, and suggested questions in the collapsed LLM Lens so the reviewer decides when to open it.

Invite both conversational feedback and line-specific diff notes. Record decisions and notes in the session as they occur. A chapter outcome is one of:

- `approved`: understood and acceptable
- `concerns`: understood with possible or confirmed problems
- `unclear`: not understood sufficiently to judge
- `deferred`: intentionally revisit later
- `pending`: no explicit disposition yet

Do not silently interpret viewing a chapter as approval. Pause after giving the model's opinion and let the reviewer respond.

## Prepare and publish feedback

After every chapter has an explicit non-pending outcome, ask for the PR-level decision: approve, request changes, or comment only. Distill only confirmed, actionable feedback into concise comments written in the reviewer's voice. Preserve exact code locations for inline comments; keep cross-cutting feedback in the review body.

Load the proposed draft with `cmux-review draft`, then show the exact `cmux-review summary`. The reviewer must be able to edit, remove, or reposition every comment. Do not publish unless the reviewer has seen the final wording and explicitly approves that exact draft. Record the checkpoint with `cmux-review summary --ack`; only then may `cmux-review publish --confirm` be used.

Publishing is an external mutation and is never implied by starting or completing the walkthrough.
