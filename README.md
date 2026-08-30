# cmux-reviewer

A persistent, chapter-based GitHub code-review walkthrough for cmux. The agent remains conversational in one pane while one OpenTUI companion presents the current chapter, diagram, and chapter-scoped diff together. It separates understanding a change from judging it, keeps the model's opinion behind an optional **LLM Lens**, and requires an exact summary checkpoint before publishing review comments.

## Current MVP

- Versioned JSON review sessions that survive terminal and cmux restarts
- Intent clarity score with known, inferred, and unknown evidence
- Small, logically ordered chapters with explicit outcomes
- Responsive OpenTUI layout with rendered diagrams and syntax-highlighted diffs
- Bidirectional cmux bridge: agent changes update the companion, and companion actions message the agent
- Optional LLM Lens, conversation notes, and exact chapter outcomes
- One scrollable chapter walkthrough with explanations and related diffs interleaved
- Exact editable review draft and guarded GitHub publication

## Run locally

```bash
bun link
cmux-review install-skill
cmux-review init --manifest /path/to/review-manifest.json
cmux-review launch
```

Run `bun install` once. The companion uses OpenTUI, and persisted JSON is validated with Zod.

The narrated workflow is defined in [`skills/narrated-code-review/SKILL.md`](skills/narrated-code-review/SKILL.md). The manifest and draft formats are documented in [`skills/narrated-code-review/references/session-protocol.md`](skills/narrated-code-review/references/session-protocol.md).

The agent and companion share the persisted session. The companion updates in place as the agent advances:

```bash
cmux-review chapter --select request-flow --open
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

Inside the companion, use `[`/`]` for chapters, `j`/`k` to move through the walkthrough, and `l` to reveal the LLM Lens. `a`, `c`, `u`, and `d` record an explicit chapter outcome. Chapter navigation and outcomes are sent to the originating agent pane as user messages, so the narration continues without switching panes manually.

## Development checks

```bash
bun run fmt
bun run check
```

`check` runs Oxfmt, strict type-aware Oxlint, an AST-level ban on TypeScript assertions, `tsc`, and the test suite.
