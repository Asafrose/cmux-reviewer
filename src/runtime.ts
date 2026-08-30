import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { z } from "zod";

const RuntimeSchema = z.object({
  pid: z.number().int().positive(),
  pane: z.string().min(1),
  surface: z.string().min(1),
  workspace: z.string().min(1),
  agentSurface: z.string().min(1),
  agentWorkspace: z.string().min(1),
});

export interface CompanionRuntime {
  pid: number;
  pane: string;
  surface: string;
  workspace: string;
  agentSurface: string;
  agentWorkspace: string;
}

export function runtimePath(sessionPath: string, workspace: string): string {
  const id = basename(sessionPath, ".json");
  const workspaceKey = workspace.replaceAll(/[^a-zA-Z0-9_-]/gu, "-");
  return resolve(dirname(sessionPath), "..", "runtime", `${id}-${workspaceKey}.json`);
}

export async function readRuntime(
  sessionPath: string,
  workspace: string,
): Promise<CompanionRuntime | undefined> {
  try {
    return RuntimeSchema.parse(JSON.parse(await readFile(runtimePath(sessionPath, workspace), "utf8")));
  } catch {
    return undefined;
  }
}

export async function writeRuntime(sessionPath: string, runtime: CompanionRuntime): Promise<void> {
  const path = runtimePath(sessionPath, runtime.workspace);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(RuntimeSchema.parse(runtime), null, 2)}\n`, "utf8");
}

export async function clearRuntime(sessionPath: string, workspace: string, pid: number): Promise<void> {
  const runtime = await readRuntime(sessionPath, workspace);
  if (runtime?.pid !== pid) return;
  try {
    await unlink(runtimePath(sessionPath, workspace));
  } catch {
    // The runtime marker may already have been removed by a stale-session cleanup.
  }
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
