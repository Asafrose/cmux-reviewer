import { spawnSync } from "node:child_process";

interface CmuxIdentity {
  caller?: { workspace_ref?: string } | null;
  focused?: { workspace_ref?: string } | null;
}

export function resolveCmuxWorkspace(): string | undefined {
  const result = spawnSync("cmux", ["identify"], { encoding: "utf8" });
  if (result.status === 0) {
    try {
      return selectCmuxWorkspace(JSON.parse(result.stdout) as CmuxIdentity, process.env.CMUX_WORKSPACE_ID);
    } catch {
      // Fall back to the inherited value when identify is unavailable or malformed.
    }
  }
  return process.env.CMUX_WORKSPACE_ID;
}

export function selectCmuxWorkspace(identity: CmuxIdentity, inherited?: string): string | undefined {
  return identity.caller?.workspace_ref || identity.focused?.workspace_ref || inherited;
}

export function withWorkspace(args: string[]): string[] {
  const workspace = resolveCmuxWorkspace();
  return workspace ? [...args, "--workspace", workspace] : args;
}
