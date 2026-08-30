import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import {
  BoxRenderable,
  CliRenderEvents,
  DiffRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
} from "@opentui/core";

import { renderDiagram } from "./diagram";
import { loadChapterPatches, type FilePatch } from "./diff";
import { clearRuntime, type CompanionRuntime, readRuntime, writeRuntime } from "./runtime";
import { loadSession, saveSession } from "./session";
import type { Chapter, ChapterOutcome, ReviewSession } from "./types";

const palette = {
  bg: "#101419",
  panel: "#151b22",
  border: "#334155",
  bright: "#e5e7eb",
  muted: "#94a3b8",
  blue: "#60a5fa",
  cyan: "#22d3ee",
  green: "#4ade80",
  yellow: "#facc15",
  red: "#fb7185",
  purple: "#c084fc",
};

export async function runCompanion(
  sessionPath: string,
  location?: Omit<CompanionRuntime, "pid">,
): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    backgroundColor: palette.bg,
    consoleMode: "disabled",
  });
  const session = await loadSession(sessionPath);
  const app = new Companion(renderer, sessionPath, session, location);
  await app.start();
}

class Companion {
  private patches: FilePatch[] = [];
  private story?: ScrollBoxRenderable;
  private lastModified = 0;
  private watcher?: ReturnType<typeof setInterval>;
  private loading = false;
  private bridgeStatus: "connected" | "disconnected";
  private readonly syntaxStyle = SyntaxStyle.fromStyles({
    keyword: { fg: palette.purple, bold: true },
    string: { fg: "#a7f3d0" },
    comment: { fg: "#64748b", italic: true },
    number: { fg: "#fbbf24" },
    type: { fg: palette.cyan },
    function: { fg: palette.blue },
    variable: { fg: palette.bright },
  });

  constructor(
    private readonly renderer: CliRenderer,
    private readonly sessionPath: string,
    private session: ReviewSession,
    private readonly location?: Omit<CompanionRuntime, "pid">,
  ) {
    this.bridgeStatus = location === undefined ? "disconnected" : "connected";
  }

  async start(): Promise<void> {
    if (this.location !== undefined) {
      await writeRuntime(this.sessionPath, { ...this.location, pid: process.pid });
    }
    await this.reload(true);
    this.renderer.keyInput.on("keypress", (key) => void this.onKey(key.name, key.ctrl));
    this.renderer.on(CliRenderEvents.RESIZE, () => this.render());
    this.renderer.on(CliRenderEvents.DESTROY, () => {
      if (this.watcher) clearInterval(this.watcher);
      this.syntaxStyle.destroy();
      if (this.location !== undefined) {
        clearRuntime(this.sessionPath, this.location.workspace, process.pid).catch(() => {});
      }
    });
    this.watcher = setInterval(() => void this.reload(false), 600);
  }

  private async reload(force: boolean): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const modified = (await stat(this.sessionPath)).mtimeMs;
      if (!force && modified === this.lastModified) return;
      const previousChapter = this.session?.chapters[this.session.currentChapter]?.id;
      this.session = await loadSession(this.sessionPath);
      this.lastModified = modified;
      if (previousChapter !== this.chapter.id) this.story?.scrollTo(0);
      this.patches = loadChapterPatches(this.session, this.chapter);
      this.render();
    } finally {
      this.loading = false;
    }
  }

  private get chapter(): Chapter {
    const chapter = this.session.chapters[this.session.currentChapter];
    if (chapter === undefined) throw new Error("Current chapter is outside the chapter list");
    return chapter;
  }

  private render(): void {
    const previousScroll = this.story?.scrollTop ?? 0;
    for (const child of this.renderer.root.getChildren()) {
      this.renderer.root.remove(child);
      child.destroyRecursively();
    }

    const root = new BoxRenderable(this.renderer, {
      id: "app",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: palette.bg,
    });
    root.add(this.buildHeader());
    const body = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      flexGrow: 1,
      paddingX: 1,
    });
    this.story = this.buildWalkthrough();
    body.add(this.story);
    root.add(body);
    root.add(this.buildFooter());
    this.renderer.root.add(root);
    this.story.scrollTop = previousScroll;
    this.renderer.requestRender();
  }

  private buildHeader(): BoxRenderable {
    const header = new BoxRenderable(this.renderer, {
      height: 4,
      flexDirection: "column",
      paddingX: 2,
      paddingTop: 1,
      backgroundColor: "#111827",
      border: ["bottom"],
      borderColor: palette.border,
    });
    header.add(
      new TextRenderable(this.renderer, {
        height: 1,
        content: `${this.session.pr.owner}/${this.session.pr.repo}  PR #${this.session.pr.number}  ${this.session.pr.title}`,
        fg: palette.bright,
        attributes: 1,
        truncate: true,
      }),
    );
    const clarity = this.session.intent.clarity.score;
    header.add(
      new TextRenderable(this.renderer, {
        height: 1,
        content: `Chapter ${this.session.currentChapter + 1}/${this.session.chapters.length}  ${progress(this.session.currentChapter, this.session.chapters.length)}   Intent clarity ${clarity}/100  ${clarityBar(clarity)}   ${this.chapter.outcome.toUpperCase()}`,
        fg: outcomeColor(this.chapter.outcome),
        truncate: true,
      }),
    );
    return header;
  }

  private buildWalkthrough(): ScrollBoxRenderable {
    const story = new ScrollBoxRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      flexShrink: 0,
      border: true,
      borderColor: palette.border,
      focusedBorderColor: palette.cyan,
      title: ` Chapter ${this.session.currentChapter + 1} · Walkthrough `,
      titleColor: palette.cyan,
      padding: 1,
      scrollY: true,
      scrollX: false,
      verticalScrollbarOptions: { showArrows: false },
    });
    addSection(story, this.renderer, this.chapter.title, this.chapter.purpose, palette.bright);

    const diagram = renderDiagram(this.chapter.diagram);
    if (diagram !== undefined && diagram !== "") {
      const panel = new BoxRenderable(this.renderer, {
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: palette.blue,
        title: " Diagram ",
        titleColor: palette.blue,
        marginTop: 1,
        padding: 1,
        height: diagram.split("\n").length + 3,
      });
      panel.add(
        new TextRenderable(this.renderer, { content: diagram, fg: palette.bright, wrapMode: "word" }),
      );
      story.add(panel);
    }

    const renderedPaths = new Set<string>();
    if (this.chapter.evidence.length === 0) {
      addSection(story, this.renderer, "Evidence", "No evidence recorded for this chapter.", palette.muted);
    }
    for (const evidence of this.chapter.evidence) {
      addSection(
        story,
        this.renderer,
        `${evidenceMark(evidence.confidence)} ${evidence.confidence.toUpperCase()}`,
        `${evidence.detail}\n${evidence.source}`,
        evidenceColor(evidence.confidence),
      );
      const referencedPatches = this.patches
        .map((patch) => ({ patch, sourceIndex: evidencePathIndex(evidence.source, patch.path) }))
        .filter(({ patch, sourceIndex }) => !renderedPaths.has(patch.path) && sourceIndex >= 0)
        .toSorted((left, right) => left.sourceIndex - right.sourceIndex);
      for (const { patch } of referencedPatches) {
        story.add(this.buildPatchCard(patch));
        renderedPaths.add(patch.path);
      }
    }

    for (const patch of this.patches) {
      if (!renderedPaths.has(patch.path)) story.add(this.buildPatchCard(patch));
    }

    const lens = this.chapter.lensRevealed
      ? formatLens(this.chapter)
      : "▸ Hidden. Press l when you want the model's analysis and opinion.";
    addSection(
      story,
      this.renderer,
      "LLM Lens",
      lens,
      this.chapter.lensRevealed ? palette.purple : palette.muted,
    );

    const notes =
      this.chapter.notes.length > 0
        ? this.chapter.notes
            .map(
              (note) =>
                `• ${note.body}${note.path === undefined ? "" : `  (${note.path}${note.line === undefined ? "" : `:${note.line}`})`}`,
            )
            .join("\n")
        : "No reviewer notes yet. Ask the agent or add an inline note.";
    addSection(story, this.renderer, "Your notes", notes, palette.yellow);
    return story;
  }

  private buildPatchCard(patch: FilePatch): BoxRenderable {
    const diffHeight = Math.max(8, patch.patch.split("\n").length + 2);
    const panel = new BoxRenderable(this.renderer, {
      height: diffHeight + 2,
      flexDirection: "column",
      border: true,
      borderColor: palette.border,
      title: ` Code · ${patch.path} `,
      titleColor: palette.green,
      padding: 1,
      marginTop: 1,
    });
    panel.add(
      new DiffRenderable(this.renderer, {
        diff: patch.patch,
        filetype: patch.filetype,
        syntaxStyle: this.syntaxStyle,
        view: "unified",
        flexGrow: 1,
        wrapMode: "none",
        showLineNumbers: true,
        fg: palette.bright,
        addedBg: "#123524",
        removedBg: "#3b1820",
        contextBg: palette.panel,
        addedSignColor: palette.green,
        removedSignColor: palette.red,
        lineNumberFg: palette.muted,
        lineNumberBg: "#0f172a",
      }),
    );
    return panel;
  }

  private buildFooter(): TextRenderable {
    const bridge = this.bridgeStatus === "connected" ? "↔ agent connected" : "↔ agent disconnected";
    return new TextRenderable(this.renderer, {
      height: 2,
      paddingLeft: 2,
      paddingTop: 1,
      bg: "#111827",
      fg: palette.muted,
      content: `${bridge}   [ / ] chapter   j/k scroll   l LLM Lens   a approve   c concerns   u unclear   d defer   q quit`,
      truncate: true,
    });
  }

  private async onKey(name: string, ctrl: boolean): Promise<void> {
    if (name === "q" || (ctrl && name === "c")) return this.quit();
    if (name === "j" || name === "down") return this.story?.scrollBy(2);
    if (name === "k" || name === "up") return this.story?.scrollBy(-2);
    if (name === "[") return void this.changeChapter(-1);
    if (name === "]") return void this.changeChapter(1);
    if (name === "l") {
      this.chapter.lensRevealed = !this.chapter.lensRevealed;
      await this.persist();
      return;
    }
    const outcomes: Record<string, ChapterOutcome> = {
      a: "approved",
      c: "concerns",
      u: "unclear",
      d: "deferred",
    };
    const outcome = outcomes[name];
    if (outcome !== undefined) {
      this.chapter.outcome = outcome;
      await this.persist();
      await this.notifyAgent(outcomeMessage(this.chapter, outcome));
    }
  }

  private quit(): void {
    this.renderer.destroy();
    if (this.location === undefined) return;
    spawnSync(
      "cmux",
      ["close-surface", "--surface", this.location.surface, "--workspace", this.location.workspace],
      { encoding: "utf8" },
    );
  }

  private async changeChapter(delta: number): Promise<void> {
    const next = this.session.currentChapter + delta;
    if (next < 0 || next >= this.session.chapters.length) return;
    this.session.currentChapter = next;
    this.story?.scrollTo(0);
    this.patches = loadChapterPatches(this.session, this.chapter);
    await this.persist();
    await this.notifyAgent(
      `I moved to chapter ${next + 1}/${this.session.chapters.length}, “${this.chapter.title}”. Walk me through it and wait for my response.`,
    );
  }

  private async persist(): Promise<void> {
    await saveSession(this.sessionPath, this.session);
    this.lastModified = (await stat(this.sessionPath)).mtimeMs;
    this.render();
  }

  private async notifyAgent(message: string): Promise<void> {
    const workspace = this.location?.workspace;
    if (workspace === undefined) {
      this.bridgeStatus = "disconnected";
      this.render();
      return;
    }
    const runtime = await readRuntime(this.sessionPath, workspace);
    if (runtime === undefined) {
      this.bridgeStatus = "disconnected";
      this.render();
      return;
    }
    const sent = spawnSync(
      "cmux",
      [
        "send",
        "--surface",
        runtime.agentSurface,
        "--workspace",
        runtime.agentWorkspace,
        `Narrated review: ${message}`,
      ],
      { encoding: "utf8" },
    );
    const submitted =
      sent.status === 0
        ? spawnSync(
            "cmux",
            ["send-key", "--surface", runtime.agentSurface, "--workspace", runtime.agentWorkspace, "enter"],
            { encoding: "utf8" },
          )
        : undefined;
    this.bridgeStatus = sent.status === 0 && submitted?.status === 0 ? "connected" : "disconnected";
    this.render();
  }
}

function outcomeMessage(chapter: Chapter, outcome: ChapterOutcome): string {
  if (outcome === "approved") return `I approve “${chapter.title}”. Please acknowledge it and continue.`;
  if (outcome === "concerns")
    return `I marked “${chapter.title}” as concerns. Let's discuss them before moving on.`;
  if (outcome === "unclear")
    return `I marked “${chapter.title}” as unclear. Help me understand it before moving on.`;
  return `I deferred “${chapter.title}”. Please keep it open for us to revisit.`;
}

function addSection(
  parent: ScrollBoxRenderable,
  renderer: CliRenderer,
  title: string,
  body: string,
  color: string,
): void {
  parent.add(
    new TextRenderable(renderer, {
      content: title,
      fg: color,
      attributes: 1,
      height: Math.max(1, Math.ceil(title.length / 30)),
      marginTop: parent.getChildrenCount() > 0 ? 1 : 0,
      truncate: true,
    }),
  );
  parent.add(
    new TextRenderable(renderer, {
      content: body,
      fg: color,
      wrapMode: "word",
      minHeight: Math.max(1, body.split("\n").length),
      marginTop: 1,
    }),
  );
}

function formatLens(chapter: Chapter): string {
  if (chapter.lens === undefined) return "No model analysis recorded.";
  const sections = [chapter.lens.summary];
  if (chapter.lens.opinion !== undefined && chapter.lens.opinion !== "")
    sections.push(`Opinion\n${chapter.lens.opinion}`);
  if (chapter.lens.risks.length > 0)
    sections.push(`Risks\n${chapter.lens.risks.map((risk) => `• ${risk}`).join("\n")}`);
  if (chapter.lens.questions.length > 0)
    sections.push(`Questions\n${chapter.lens.questions.map((question) => `• ${question}`).join("\n")}`);
  return sections.join("\n\n");
}

function evidenceMark(confidence: string): string {
  return confidence === "known" ? "●" : confidence === "inferred" ? "◐" : "○";
}

function evidenceColor(confidence: string): string {
  if (confidence === "known") return palette.blue;
  if (confidence === "inferred") return palette.yellow;
  return palette.muted;
}

function evidencePathIndex(source: string, path: string): number {
  const normalizedSource = source.toLowerCase();
  const fullPathIndex = normalizedSource.indexOf(path.toLowerCase());
  if (fullPathIndex >= 0) return fullPathIndex;
  return normalizedSource.indexOf(basename(path).toLowerCase());
}

function progress(index: number, total: number): string {
  return Array.from({ length: total }, (_, item) => (item < index ? "●" : item === index ? "◉" : "○")).join(
    "─",
  );
}

function clarityBar(score: number): string {
  const filled = Math.round(score / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
}

function outcomeColor(outcome: ChapterOutcome): string {
  if (outcome === "approved") return palette.green;
  if (outcome === "concerns") return palette.red;
  if (outcome === "unclear" || outcome === "deferred") return palette.yellow;
  return palette.muted;
}
