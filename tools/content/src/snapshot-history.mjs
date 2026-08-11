import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const basePattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/;

export async function assertSnapshotHistoryIsAppendOnly(
  repoRoot,
  base,
  snapshotsPath = "content/snapshots/tasks",
) {
  if (!basePattern.test(base)) throw new Error("invalid snapshot history base");
  const { stdout } = await execFileAsync(
    "git",
    [
      "diff",
      "--name-status",
      "--find-renames",
      "--diff-filter=DMRT",
      `${base}...HEAD`,
      "--",
      snapshotsPath,
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  const changes = stdout.trim();
  if (changes) {
    throw new Error(`task snapshots are append-only:\n${changes}`);
  }
  return { base };
}
