import { spawnSync } from "node:child_process";

import { z } from "zod";

interface CmuxTarget {
  workspace_ref?: string;
  surface_ref?: string;
}

interface CmuxIdentity {
  caller?: CmuxTarget | null;
  focused?: CmuxTarget | null;
}

export interface CmuxBinding {
  workspace: string;
  surface: string;
}

const TargetSchema = z.object({
  workspace_ref: z.string().optional(),
  surface_ref: z.string().optional(),
});
const CmuxIdentitySchema = z.object({
  caller: TargetSchema.nullish(),
  focused: TargetSchema.nullish(),
});

export function resolveCmuxBinding(): CmuxBinding | undefined {
  const result = spawnSync("cmux", ["identify"], { encoding: "utf8" });
  if (result.status === 0) {
    try {
      return selectCmuxBinding(
        CmuxIdentitySchema.parse(JSON.parse(result.stdout)),
        process.env.CMUX_WORKSPACE_ID,
        process.env.CMUX_SURFACE_ID,
      );
    } catch {
      // Fall back to inherited cmux references when identify is unavailable or malformed.
    }
  }
  return bindingFrom(process.env.CMUX_WORKSPACE_ID, process.env.CMUX_SURFACE_ID);
}

export function selectCmuxBinding(
  identity: CmuxIdentity,
  inheritedWorkspace?: string,
  inheritedSurface?: string,
): CmuxBinding | undefined {
  return (
    bindingFrom(identity.caller?.workspace_ref, identity.caller?.surface_ref) ??
    bindingFrom(identity.focused?.workspace_ref, identity.focused?.surface_ref) ??
    bindingFrom(inheritedWorkspace, inheritedSurface)
  );
}

export function resolveCmuxWorkspace(): string | undefined {
  return resolveCmuxBinding()?.workspace ?? process.env.CMUX_WORKSPACE_ID;
}

export function withWorkspace(args: string[]): string[] {
  const workspace = resolveCmuxWorkspace();
  return workspace === undefined || workspace === "" ? args : [...args, "--workspace", workspace];
}

function bindingFrom(workspace: string | undefined, surface: string | undefined): CmuxBinding | undefined {
  if (workspace === undefined || workspace === "" || surface === undefined || surface === "")
    return undefined;
  return { workspace, surface };
}
