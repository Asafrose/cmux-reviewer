import { spawnSync } from "node:child_process";

import { z } from "zod";

interface CmuxIdentity {
  caller?: { workspace_ref?: string } | null;
  focused?: { workspace_ref?: string } | null;
}

const CmuxIdentitySchema = z.object({
  caller: z.object({ workspace_ref: z.string().optional() }).nullish(),
  focused: z.object({ workspace_ref: z.string().optional() }).nullish(),
});

export function resolveCmuxWorkspace(): string | undefined {
  const result = spawnSync("cmux", ["identify"], { encoding: "utf8" });
  if (result.status === 0) {
    try {
      return selectCmuxWorkspace(
        CmuxIdentitySchema.parse(JSON.parse(result.stdout)),
        process.env.CMUX_WORKSPACE_ID,
      );
    } catch {
      // Fall back to the inherited value when identify is unavailable or malformed.
    }
  }
  return process.env.CMUX_WORKSPACE_ID;
}

export function selectCmuxWorkspace(identity: CmuxIdentity, inherited?: string): string | undefined {
  return identity.caller?.workspace_ref ?? identity.focused?.workspace_ref ?? inherited;
}

export function withWorkspace(args: string[]): string[] {
  const workspace = resolveCmuxWorkspace();
  return workspace === undefined || workspace === "" ? args : [...args, "--workspace", workspace];
}
