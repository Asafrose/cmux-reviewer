# cmux-reviewer

A persistent, chapter-based GitHub code-review walkthrough for cmux. The agent narrates in one pane while Hunk or cmux shows the current chapter in one adjacent review pane. It separates understanding a change from judging it, keeps the model's opinion behind an optional **LLM Lens**, and requires an exact summary checkpoint before publishing review comments.

## Current MVP

- Versioned JSON review sessions that survive terminal and cmux restarts
- Intent clarity score with known, inferred, and unknown evidence
- Small, logically ordered chapters with explicit outcomes
- Optional LLM Lens, automatic diagrams, conversation notes, and inline notes
- Chapter-scoped Hunk diffs with inline-note sync; cmux native diff is the fallback
- Exact editable review draft and guarded GitHub publication

## Run locally

```bash
bun link
cmux-review install-skill
cmux-review init --manifest /path/to/review-manifest.json
cmux-review launch
```

The runtime has no package dependencies. Run `bun install` only when you want the optional TypeScript development tooling.

The narrated workflow is defined in [`skills/narrated-code-review/SKILL.md`](skills/narrated-code-review/SKILL.md). The manifest and draft formats are documented in [`skills/narrated-code-review/references/session-protocol.md`](skills/narrated-code-review/references/session-protocol.md).

The agent advances the single review pane chapter by chapter:

```bash
cmux-review chapter --select request-flow --open
cmux-review sync-hunk --chapter request-flow
cmux-review outcome --chapter request-flow --set approved
```

Publication is deliberately separate:

```bash
cmux-review draft --file /path/to/draft.json
cmux-review summary
cmux-review summary --ack
cmux-review publish --confirm
```

`publish` submits one GitHub pull-request review containing the selected review event and all inline comments. Every `gh` invocation is executed without `GITHUB_TOKEN`, allowing the GitHub CLI to use its configured credential store.

When [Hunk](https://github.com/modem-dev/hunk) is installed, `launch` opens or reloads a live Hunk chapter diff in one cmux pane. Add comments directly in Hunk, then let the agent import them with `sync-hunk`. Without Hunk, the same command opens cmux's native diff surface.
