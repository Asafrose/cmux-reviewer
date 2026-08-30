# Session protocol

`cmux-review` stores the current session at `.cmux-review/sessions/<id>.json` and points `.cmux-review/current` to it. Agent-to-companion state flows through this versioned file via CLI commands. Companion-to-agent actions use the originating cmux surface binding and arrive as messages prefixed with `Narrated review:`. Do not scrape pane contents as state.

## Create a session

Write a manifest JSON containing the shape below, then run:

```bash
cmux-review init --manifest /absolute/path/to/manifest.json
cmux-review launch
```

Required manifest shape:

```json
{
  "repoRoot": "/absolute/repository/path",
  "pr": {
    "owner": "owner",
    "repo": "repository",
    "number": 42,
    "title": "Pull request title",
    "url": "https://github.com/owner/repository/pull/42",
    "baseSha": "full base commit SHA",
    "headSha": "full head commit SHA"
  },
  "intent": {
    "goal": "Why this change exists",
    "architecture": "How the solution is arranged",
    "tradeoffs": ["A deliberate compromise"],
    "inScope": ["Behavior included by this PR"],
    "outOfScope": ["Related behavior intentionally excluded"],
    "clarity": {
      "score": 75,
      "rationale": "Why this score is warranted",
      "unknowns": ["Important unresolved intent"]
    }
  },
  "chapters": [
    {
      "id": "orientation",
      "title": "What this PR is trying to accomplish",
      "purpose": "Establish the goal, approach, and boundaries.",
      "files": [],
      "evidence": [
        {
          "source": "PR description",
          "detail": "The author states the intended outcome.",
          "confidence": "known"
        }
      ],
      "lens": {
        "summary": "Private model analysis for this chapter.",
        "opinion": "The model's current assessment.",
        "risks": [],
        "questions": []
      },
      "lensRevealed": false,
      "notes": [],
      "findings": [],
      "outcome": "pending"
    }
  ]
}
```

Every chapter needs a stable kebab-case `id`. `files` contains only the repository-relative paths relevant to that chapter. The companion renders every file diff in the chapter's single scroll. Evidence order defines the walkthrough order; put related repository paths in each evidence item's `source` so its explanation appears immediately before those diffs. Unreferenced chapter files appear afterward. An empty file list makes a story-only chapter; it never falls back to the complete PR diff. `diagram` is optional and accepts Mermaid flowchart or ASCII source for terminal rendering.

The base and head commits must exist locally for chapter diffs. Fetch missing commits without changing the reviewer's checked-out branch.

## Record interaction

Use the CLI so writes remain atomic:

```bash
cmux-review note --chapter request-flow --body "Reviewer note"
cmux-review note --chapter request-flow --body "Inline note" --path src/api.ts --line 81 --side RIGHT
cmux-review outcome --chapter request-flow --set approved
cmux-review show
```

Conversation notes can omit a location. Out-of-scope findings promoted into the current review use `--promote`.

Keep the agent conversation and one OpenTUI companion. Move it to another chapter with:

```bash
cmux-review chapter --select request-flow
```

The companion watches the session and updates in place. Use `--open` to open, focus, or rebind it to the current agent pane. Chapter navigation and outcome keys in the companion send reviewer messages back to the bound agent. Record conversational or line-specific notes through the CLI so they appear in the companion:

```bash
cmux-review note --chapter request-flow --body "This should handle the missing value" --path src/api.ts --line 81 --side RIGHT
```

## Prepare a GitHub draft

Write a draft JSON and load it with `cmux-review draft --file <path>`:

```json
{
  "event": "REQUEST_CHANGES",
  "body": "Concise overall review body.",
  "comments": [
    {
      "chapterId": "request-flow",
      "path": "src/api.ts",
      "line": 81,
      "side": "RIGHT",
      "body": "Concise actionable comment in the reviewer's voice."
    }
  ]
}
```

`event` is `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`. GitHub line comments use new-file line numbers with `RIGHT` and deleted-file line numbers with `LEFT`. Multi-line comments may add `startLine` and `startSide`.

Run `cmux-review summary` after every draft change. Only the user can authorize `summary --ack` and `publish --confirm`.
