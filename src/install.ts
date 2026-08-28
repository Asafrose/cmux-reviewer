import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export async function installSkill(skillsDir?: string): Promise<string> {
  const source = resolve(import.meta.dir, "..", "skills", "narrated-code-review");
  const root = resolve(skillsDir || process.env.CODEX_HOME || resolve(homedir(), ".codex"), skillsDir ? "" : "skills");
  const target = resolve(root, "narrated-code-review");
  await mkdir(dirname(target), { recursive: true });
  try {
    const existing = await lstat(target);
    if (existing.isSymbolicLink() && resolve(dirname(target), await readlink(target)) === source) return target;
    throw new Error(`Refusing to replace existing skill at ${target}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await symlink(source, target, "dir");
      return target;
    }
    throw error;
  }
}
