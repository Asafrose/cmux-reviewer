import { spawnSync } from "node:child_process";

interface CmuxIdentity {
  caller?: { workspace_ref?: string } | null;
  focused?: { workspace_ref?: string } | null;
}

export function resolveCmuxWorkspace(): string | undefined {
  if (process.env.CMUX_WORKSPACE_ID) return process.env.CMUX_WORKSPACE_ID;
  const result = spawnSync("cmux", ["identify"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  try {
    const identity = JSON.parse(result.stdout) as CmuxIdentity;
    return identity.caller?.workspace_ref || identity.focused?.workspace_ref;
  } catch {
    return undefined;
  }
}

export function withWorkspace(args: string[]): string[] {
  const workspace = resolveCmuxWorkspace();
  return workspace ? [...args, "--workspace", workspace] : args;
}
