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

Create the chapter plan once before beginning. The first chapter establishes the goal, architecture, tradeoffs, scope, and unresolved intent. Remaining chapters are the smallest units a person can understand and approve independently, ordered as a coherent learning path rather than by filename. Within each chapter, order evidence as a walkthrough and name the repository paths each explanation applies to in its `source`; the companion interleaves that explanation with those diffs in one scroll. Modify the plan later only when discovery makes the original structure misleading.

Score intent clarity from 0–100. Explain the score, list missing context, and tag evidence as `known`, `inferred`, or `unknown`. Add a compact Mermaid or ASCII diagram automatically when it materially clarifies a relationship or flow; the companion renders Mermaid source as a terminal-native diagram.

Read [references/session-protocol.md](references/session-protocol.md) before creating or changing a review session. Initialize the session with `cmux-review init`, then use `cmux-review launch` to open the single OpenTUI companion beside the agent pane. The companion owns one scrollable chapter walkthrough containing narrative, rendered diagrams, and every chapter-scoped diff; it is not a separate story pane plus file viewer. Keep the collaborative conversation and questions in the agent pane. Do not open Hunk, a cmux diff surface, markdown viewer, or another narration TUI.

Treat messages beginning with `Narrated review:` as direct reviewer interaction from the bound companion pane. Respond naturally and continue the same walkthrough; do not ask the reviewer to repeat the action in the agent pane. Agent-side CLI session changes flow back into the companion automatically.

## Walk through each chapter

Briefly introduce the chapter in conversation, then let the companion present its purpose and evidence without revealing the model's verdict. Put analysis, risks, opinion, and suggested questions in the collapsed LLM Lens so the reviewer decides when to open it with `l`.

When advancing from the agent pane, run `cmux-review chapter --select <id>` to persist the active chapter; the existing companion reloads automatically. Use `--open` only when the companion needs to be opened or focused.

Invite both conversational feedback and line-specific diff notes. Record decisions and notes in the session as they occur. A chapter outcome is one of:

- `approved`: understood and acceptable
- `concerns`: understood with possible or confirmed problems
- `unclear`: not understood sufficiently to judge
- `deferred`: intentionally revisit later
- `pending`: no explicit disposition yet

Do not silently interpret viewing a chapter as approval. The reviewer may record an outcome in the companion or conversationally. Pause after giving the model's opinion and let the reviewer respond.

## Prepare and publish feedback

After every chapter has an explicit non-pending outcome, ask for the PR-level decision: approve, request changes, or comment only. Distill only confirmed, actionable feedback into concise comments written in the reviewer's voice. Preserve exact code locations for inline comments; keep cross-cutting feedback in the review body.

Load the proposed draft with `cmux-review draft`, then show the exact `cmux-review summary`. The reviewer must be able to edit, remove, or reposition every comment. Do not publish unless the reviewer has seen the final wording and explicitly approves that exact draft. Record the checkpoint with `cmux-review summary --ack`; only then may `cmux-review publish --confirm` be used.

Publishing is an external mutation and is never implied by starting or completing the walkthrough.
