import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { assertSnapshotHistoryIsAppendOnly } from "../src/snapshot-history.mjs";
import { auditTaskSnapshots, writeTaskSnapshots } from "../src/snapshots.mjs";

const execFileAsync = promisify(execFile);

test("verified task snapshots are content-addressed and idempotent", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-snapshots-"),
  );
  const tasks = path.join(root, "tasks");
  const snapshots = path.join(root, "snapshots");
  try {
    await fs.mkdir(path.join(tasks, "tema"), { recursive: true });
    const raw = taskFile("a-001", "verified", "First version");
    await Promise.all([
      fs.writeFile(path.join(tasks, "tema", "a-001.md"), raw),
      fs.writeFile(
        path.join(tasks, "tema", "b-001.md"),
        taskFile("b-001", "review", "Review only"),
      ),
    ]);

    assert.deepEqual(await writeTaskSnapshots(tasks, snapshots), {
      createdCount: 1,
      existingCount: 0,
      verifiedTaskCount: 1,
    });
    assert.deepEqual(await writeTaskSnapshots(tasks, snapshots), {
      createdCount: 0,
      existingCount: 1,
      verifiedTaskCount: 1,
    });
    assert.deepEqual(await auditTaskSnapshots(tasks, snapshots), {
      currentTaskCount: 1,
      snapshotCount: 1,
    });
    assert.equal(
      await fs.readFile(
        path.join(snapshots, "a-001", `${digest(raw)}.md`),
        "utf8",
      ),
      raw,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a new task revision appends instead of replacing its snapshot", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-snapshots-"),
  );
  const tasks = path.join(root, "tasks");
  const snapshots = path.join(root, "snapshots");
  try {
    await fs.mkdir(path.join(tasks, "tema"), { recursive: true });
    const taskPath = path.join(tasks, "tema", "a-001.md");
    await fs.writeFile(
      taskPath,
      taskFile("a-001", "verified", "First version"),
    );
    await writeTaskSnapshots(tasks, snapshots);
    await fs.writeFile(
      taskPath,
      taskFile("a-001", "verified", "Second version"),
    );
    await assert.rejects(
      () => auditTaskSnapshots(tasks, snapshots),
      /verified task has no immutable snapshot/,
    );
    assert.deepEqual(await writeTaskSnapshots(tasks, snapshots), {
      createdCount: 1,
      existingCount: 0,
      verifiedTaskCount: 1,
    });
    assert.deepEqual(await auditTaskSnapshots(tasks, snapshots), {
      currentTaskCount: 1,
      snapshotCount: 2,
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("snapshot audit rejects changed bytes", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-snapshots-"),
  );
  const tasks = path.join(root, "tasks");
  const snapshots = path.join(root, "snapshots");
  try {
    await fs.mkdir(path.join(tasks, "tema"), { recursive: true });
    const raw = taskFile("a-001", "verified", "First version");
    await fs.writeFile(path.join(tasks, "tema", "a-001.md"), raw);
    await writeTaskSnapshots(tasks, snapshots);
    await fs.appendFile(
      path.join(snapshots, "a-001", `${digest(raw)}.md`),
      "\nchanged",
    );
    await assert.rejects(
      () => writeTaskSnapshots(tasks, snapshots),
      /snapshot content does not match/,
    );
    await assert.rejects(
      () => auditTaskSnapshots(tasks, snapshots),
      /snapshot hash does not match its filename/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("snapshot audit rejects mismatched task metadata", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-snapshots-"),
  );
  const tasks = path.join(root, "tasks");
  const snapshots = path.join(root, "snapshots");
  try {
    await fs.mkdir(path.join(tasks, "tema"), { recursive: true });
    const raw = taskFile("a-001", "verified", "First version");
    await fs.writeFile(path.join(tasks, "tema", "a-001.md"), raw);
    await writeTaskSnapshots(tasks, snapshots);

    const mismatched = taskFile("b-001", "verified", "Historical version");
    await fs.writeFile(
      path.join(snapshots, "a-001", `${digest(mismatched)}.md`),
      mismatched,
    );
    await assert.rejects(
      () => auditTaskSnapshots(tasks, snapshots),
      /snapshot task ID does not match its path/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("snapshot generation rejects invalid current task paths", async (t) => {
  const cases = [
    {
      name: "invalid ID",
      file: "invalid.md",
      raw: taskFile("invalid", "verified", "First version"),
      expected: /invalid task ID/,
    },
    {
      name: "filename mismatch",
      file: "b-001.md",
      raw: taskFile("a-001", "verified", "First version"),
      expected: /task ID does not match its filename/,
    },
    {
      name: "topic mismatch",
      file: "a-001.md",
      raw: taskFile("a-001", "verified", "First version", "druga-tema"),
      expected: /task topic does not match its directory/,
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "do-indeksa-snapshots-"),
      );
      const tasks = path.join(root, "tasks");
      try {
        await fs.mkdir(path.join(tasks, "tema"), { recursive: true });
        await fs.writeFile(path.join(tasks, "tema", fixture.file), fixture.raw);
        await assert.rejects(
          () => writeTaskSnapshots(tasks, path.join(root, "snapshots")),
          fixture.expected,
        );
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("snapshot generation rejects duplicate verified task identities", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "do-indeksa-snapshots-"),
  );
  const tasks = path.join(root, "tasks");
  try {
    await Promise.all([
      fs.mkdir(path.join(tasks, "prva-tema"), { recursive: true }),
      fs.mkdir(path.join(tasks, "druga-tema"), { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(
        path.join(tasks, "prva-tema", "a-001.md"),
        taskFile("a-001", "verified", "First version", "prva-tema"),
      ),
      fs.writeFile(
        path.join(tasks, "druga-tema", "a-001.md"),
        taskFile("a-001", "verified", "Second version", "druga-tema"),
      ),
    ]);

    await assert.rejects(
      () => writeTaskSnapshots(tasks, path.join(root, "snapshots")),
      /duplicate task ID a-001/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("snapshot history allows additions and rejects published mutations", async (t) => {
  await t.test("addition", async () => {
    const { root, base, snapshot } = await gitFixture();
    try {
      await fs.writeFile(path.join(path.dirname(snapshot), "new.md"), "new");
      await commitAll(root, "add snapshot");
      await assertSnapshotHistoryIsAppendOnly(root, base);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  for (const action of ["modify", "delete", "rename"]) {
    await t.test(action, async () => {
      const { root, base, snapshot } = await gitFixture();
      try {
        if (action === "modify") await fs.appendFile(snapshot, "changed");
        if (action === "delete") await fs.rm(snapshot);
        if (action === "rename") {
          await fs.rename(
            snapshot,
            path.join(path.dirname(snapshot), "renamed.md"),
          );
        }
        await commitAll(root, `${action} snapshot`);
        await assert.rejects(
          () => assertSnapshotHistoryIsAppendOnly(root, base),
          /task snapshots are append-only/,
        );
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
});

async function gitFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "do-indeksa-git-"));
  const directory = path.join(root, "content", "snapshots", "tasks", "a");
  const snapshot = path.join(directory, "old.md");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(snapshot, "old");
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Snapshot Test"], {
    cwd: root,
  });
  await execFileAsync(
    "git",
    ["config", "user.email", "snapshot@example.invalid"],
    {
      cwd: root,
    },
  );
  await commitAll(root, "seed snapshot");
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return { root, base: stdout.trim(), snapshot };
}

async function commitAll(root, message) {
  await execFileAsync("git", ["add", "--all"], { cwd: root });
  await execFileAsync("git", ["commit", "--quiet", "-m", message], {
    cwd: root,
  });
}

function taskFile(id, status, statement, topic = "tema") {
  return `---\nid: ${id}\ntopic: ${topic}\nstatus: ${status}\n---\n\n## Zadatak\n\n${statement}\n\n## Rešenje\n\nDone.\n`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
