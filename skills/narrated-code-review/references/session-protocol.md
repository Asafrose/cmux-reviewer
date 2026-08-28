# Session protocol

`cmux-review` stores the current session at `.cmux-review/sessions/<id>.json` and points `.cmux-review/current` to it. The TUI and agent communicate through this versioned file via CLI commands. Do not scrape pane contents as state.

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

Every chapter needs a stable kebab-case `id`. `files` contains repository-relative paths used to construct that chapter's cmux diff. An empty file list opens the complete PR diff. `diagram` is optional and accepts plain Mermaid or ASCII source for display.

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

When the chapter diff is open in Hunk, the reviewer can attach comments directly to lines. Import new human-authored notes into the active chapter with:

```bash
cmux-review sync-hunk --chapter request-flow
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
