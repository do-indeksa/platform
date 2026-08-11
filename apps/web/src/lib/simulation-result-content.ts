import { simulationEntrySnapshot } from "./simulation-archive";
import type {
  SimulationHistoryEntry,
  SimulationTaskView,
} from "./simulation-types";

export type SimulationResultContentCandidate = {
  contentRevision: string;
  tasks: (SimulationTaskView | null)[];
};

export function alignSimulationResultAnswers(
  tasks: readonly Pick<SimulationTaskView, "fields">[],
  answers: readonly (readonly string[])[],
): string[][] {
  if (tasks.length !== answers.length) {
    throw new Error("simulation answers must match the selected task set");
  }
  return tasks.map((task, index) =>
    task.fields.map((_, part) => answers[index][part] ?? ""),
  );
}

export function selectSimulationResultContent(
  entry: Pick<
    SimulationHistoryEntry,
    "taskIds" | "archiveSnapshot" | "progress"
  >,
  currentContentRevision: string,
  current: SimulationTaskView[],
  candidate: SimulationResultContentCandidate | null,
): {
  tasks: SimulationTaskView[];
  isArchived: boolean;
  revisionMismatch: boolean;
} {
  const snapshot = simulationEntrySnapshot(entry);
  if (snapshot === undefined) {
    return { tasks: current, isArchived: false, revisionMismatch: false };
  }

  const currentMatches = taskSetMatches(
    entry.taskIds,
    snapshot.contentRevision,
    snapshot.taskRevisions,
    currentContentRevision,
    current,
  );
  if (candidate !== null && candidate.tasks.length === current.length) {
    const tasks = current.map((task, index) => candidate.tasks[index] ?? task);
    if (
      taskSetMatches(
        entry.taskIds,
        snapshot.contentRevision,
        snapshot.taskRevisions,
        candidate.contentRevision,
        tasks,
      )
    ) {
      return {
        tasks,
        isArchived: tasks.some(
          (task, index) => task.revision !== current[index].revision,
        ),
        revisionMismatch: false,
      };
    }
  }

  return {
    tasks: current,
    isArchived: false,
    revisionMismatch: !currentMatches,
  };
}

function taskSetMatches(
  entryTaskIds: readonly string[],
  entryContentRevision: string,
  entryTaskRevisions: readonly string[],
  contentRevision: string,
  tasks: readonly SimulationTaskView[],
): boolean {
  return (
    entryContentRevision === contentRevision &&
    entryTaskIds.length === tasks.length &&
    entryTaskRevisions.length === tasks.length &&
    tasks.every(
      (task, index) =>
        task.id === entryTaskIds[index] &&
        task.revision === entryTaskRevisions[index],
    )
  );
}
