"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";
import { trackTaskSolved } from "@/lib/analytics";
import { recordPracticeAttempt } from "@/lib/attempts-store";
import {
  markTaskHistoryHelp,
  recordTaskHistory,
} from "@/lib/task-history-store";
import { useRouter } from "@/i18n/navigation";
import { useTaskCheckState } from "@/components/task-check/use-task-check-state";
import { HelpPanel } from "./help-panel";
import { QuestionPanel } from "./question-panel";
import { TaskNavigation } from "./task-navigation";
import { TaskRail } from "./task-rail";
import {
  usePracticeElapsedSeconds,
  useStoredTaskDurations,
  useStoredTaskStatuses,
  writeTaskDraftSession,
} from "./task-session";
import { TaskWorkspaceHeader } from "./task-workspace-header";
import type { TaskWorkspaceProps, TaskWorkspaceStatus } from "./types";
import { usePracticeWorkspaceRuntime } from "./use-practice-workspace-runtime";

export function TaskWorkspace({
  taskId,
  slot,
  taskRevision,
  taskTopic,
  topicName,
  source,
  statementHtml,
  check,
  hintsHtml,
  solutionHtml,
  sequence,
  taskIndex,
  returnTo,
  reportHref,
  reportAccessibleLabel,
  practiceId,
  runtimeRequired,
}: TaskWorkspaceProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const { user, loading: ownerLoading } = useUser();
  const ownerId = ownerLoading ? undefined : (user?.id ?? null);
  const [statementVisible, setStatementVisible] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkerUnavailable, setCheckerUnavailable] = useState(false);
  const practiceRuntime = usePracticeWorkspaceRuntime({
    practiceId,
    runtimeRequired,
    ownerId,
    taskId,
    taskRevision,
    taskSlot: slot,
    taskTopic,
    answerPartCount: check.length,
    maxHints: hintsHtml.length,
    taskIndex,
    sequence,
  });
  const {
    status: runtimeStatus,
    preferredDraft,
    taskStatuses: runtimeTaskStatuses,
    changeDraft: changeRuntimeDraft,
    recordAttempt: recordRuntimeAttempt,
    finish: finishRuntime,
  } = practiceRuntime;
  const workspaceOwnerId =
    runtimeStatus === "loading" || runtimeStatus === "mismatch"
      ? undefined
      : ownerId;
  const [state, setState, draftReady] = useTaskCheckState(
    taskId,
    check.length,
    hintsHtml.length,
    t("unsavedExit"),
    practiceId,
    workspaceOwnerId,
    preferredDraft,
  );
  const historyEntryId = useRef<string | null>(null);
  const sequenceKey = useMemo(
    () => sequence.map(({ id }) => id).join(","),
    [sequence],
  );
  const elapsedSeconds = usePracticeElapsedSeconds(
    practiceId ? `practice:${practiceId}` : `sequence:${sequenceKey}`,
    workspaceOwnerId,
  );
  const storedStatuses = useStoredTaskStatuses(
    sequence,
    practiceId,
    `${state.attempted}:${state.solved}:${state.burned}:${state.view}`,
    workspaceOwnerId,
  );
  const storedDurations = useStoredTaskDurations(
    sequence,
    practiceId,
    `${state.activeDurationMs ?? ""}:${state.view}`,
    workspaceOwnerId,
  );
  const workspaceReady = draftReady && runtimeStatus !== "mismatch";
  const statuses: Readonly<Record<string, TaskWorkspaceStatus>> = {
    ...storedStatuses,
    ...runtimeTaskStatuses,
    [taskId]: currentStatus(state),
  };
  const previous =
    sequence.length > 1
      ? sequence[(taskIndex - 1 + sequence.length) % sequence.length]
      : null;
  const next =
    sequence.length > 1 ? sequence[(taskIndex + 1) % sequence.length] : null;

  useEffect(() => {
    historyEntryId.current = null;
  }, [ownerId, taskId]);

  useEffect(() => {
    if (runtimeStatus === "mismatch") router.replace(returnTo);
  }, [runtimeStatus, returnTo, router]);

  useEffect(() => {
    if (!workspaceReady) return;
    changeRuntimeDraft({
      answers: state.answers,
      hintsShown: state.hintsShown,
    });
  }, [changeRuntimeDraft, state.answers, state.hintsShown, workspaceReady]);

  const recordJournalAttempt = (
    outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
    helpLevel: number,
  ): number | null => {
    const timing = recordRuntimeAttempt(
      outcome.toLowerCase() as "correct" | "incorrect" | "skipped",
      state.answers,
      helpLevel,
    );
    if (timing === null) return null;
    if (!timing.persistedInRun) {
      recordPracticeAttempt({
        taskId,
        slot,
        taskRevision,
        startedAt: new Date(timing.startedAt).toISOString(),
        submittedAt: new Date(timing.submittedAt).toISOString(),
        activeDurationMs: timing.activeDurationMs,
        answer: JSON.stringify(state.answers),
        outcome,
        helpLevel,
      });
    }
    return timing.activeDurationMs;
  };

  const verify = async () => {
    if (!workspaceReady || checking) return;
    setChecking(true);
    setCheckerUnavailable(false);
    try {
      const { checkAnswer } = await import("@/lib/answer");
      const results = check.map((part, index) =>
        checkAnswer(part, state.answers[index]),
      );
      if (results.some((result) => result === "invalid")) {
        setState((current) => ({ ...current, results }));
        return;
      }

      const correct = results.every((result) => result === "correct");
      const activeDurationMs = recordJournalAttempt(
        correct ? "CORRECT" : "INCORRECT",
        state.hintsShown,
      );
      if (activeDurationMs === null) return;
      historyEntryId.current =
        recordTaskHistory([
          {
            taskId,
            slot,
            source: "practice",
            outcome: correct ? "correct" : "incorrect",
            answers: state.answers,
            helpLevel: state.hintsShown,
          },
        ])[0]?.id ?? null;
      if (correct) {
        trackTaskSolved({
          source: "practice",
          position: slot,
          helpLevel: state.hintsShown,
        });
      }
      setState((current) => ({
        ...current,
        results,
        attempted: true,
        solved: correct,
        dirty: false,
        activeDurationMs: (current.activeDurationMs ?? 0) + activeDurationMs,
        view: correct ? "correct" : "incorrect",
      }));
    } catch {
      setCheckerUnavailable(true);
    } finally {
      setChecking(false);
    }
  };

  const showHint = () => {
    if (!workspaceReady) return;
    const helpLevel = Math.max(state.hintsShown, 1);
    if (historyEntryId.current) {
      markTaskHistoryHelp(historyEntryId.current, helpLevel);
    }
    setState((current) => ({
      ...current,
      hintsShown: Math.max(current.hintsShown, 1),
      results: null,
      view: "hint",
    }));
  };

  const showSolution = () => {
    if (!workspaceReady) return;
    let activeDurationMs: number | null = null;
    if (!state.solved && !state.burned) {
      activeDurationMs = recordJournalAttempt("SKIPPED", 3);
      if (activeDurationMs === null) return;
      recordSkippedHistory(3);
    }
    setState((current) => ({
      ...current,
      attempted: true,
      burned: current.solved ? false : true,
      dirty: false,
      ...(activeDurationMs === null
        ? {}
        : {
            activeDurationMs:
              (current.activeDurationMs ?? 0) + activeDurationMs,
          }),
      results: null,
      view: "solution",
    }));
  };

  const nextHelp = () => {
    if (!workspaceReady) return;
    if (state.hintsShown < hintsHtml.length) {
      const helpLevel = state.hintsShown + 1;
      if (historyEntryId.current) {
        markTaskHistoryHelp(historyEntryId.current, helpLevel);
      }
      setState((current) => ({
        ...current,
        hintsShown: current.hintsShown + 1,
      }));
      return;
    }
    showSolution();
  };

  const skipTask = () => {
    if (!workspaceReady || ownerId === undefined) return;
    if (!state.solved && !state.burned) {
      const activeDurationMs = recordJournalAttempt(
        "SKIPPED",
        state.hintsShown,
      );
      if (activeDurationMs === null) return;
      recordSkippedHistory(state.hintsShown);
      const skipped = {
        answers: state.answers,
        view: "solution" as const,
        attempted: true,
        hintsShown: state.hintsShown,
        solved: false,
        burned: true,
        dirty: false,
        activeDurationMs: (state.activeDurationMs ?? 0) + activeDurationMs,
      };
      writeTaskDraftSession(ownerId, taskId, practiceId, skipped);
    }
    router.push(next?.href ?? returnTo);
  };

  const finishPractice = () => {
    if (!workspaceReady || !finishRuntime()) return false;
    router.push(returnTo);
    return true;
  };

  const recordSkippedHistory = (helpLevel: number) => {
    if (historyEntryId.current) {
      markTaskHistoryHelp(historyEntryId.current, helpLevel);
      return;
    }
    historyEntryId.current =
      recordTaskHistory([
        {
          taskId,
          slot,
          source: "practice",
          outcome: "skipped",
          answers: state.answers,
          helpLevel,
        },
      ])[0]?.id ?? null;
  };

  return (
    <main
      data-testid="task-workspace"
      data-draft-state={workspaceReady ? "ready" : "loading"}
      data-runtime-state={runtimeStatus}
      aria-busy={!workspaceReady}
      className="mx-auto w-full max-w-[1440px] px-4 pt-5 pb-7 md:px-[60px] md:pt-[30px] md:pb-10"
    >
      <div className="flex w-full flex-col gap-4 md:gap-[22px]">
        <TaskWorkspaceHeader
          slot={slot}
          topicName={topicName}
          current={taskIndex + 1}
          total={sequence.length}
          elapsedSeconds={elapsedSeconds}
          statementVisible={statementVisible}
          returnTo={returnTo}
          onFinish={finishPractice}
          onToggleStatement={() => setStatementVisible((visible) => !visible)}
        />

        <div className="flex min-w-0 flex-col gap-4 md:gap-5 xl:grid xl:grid-cols-[250px_minmax(0,630px)_minmax(0,400px)] xl:items-start">
          <TaskRail
            items={sequence}
            currentTaskId={taskId}
            statuses={statuses}
            durations={{
              ...storedDurations,
              ...(state.activeDurationMs === undefined
                ? {}
                : { [taskId]: state.activeDurationMs }),
            }}
            returnTo={returnTo}
            onFinish={finishPractice}
          />
          <QuestionPanel
            ordinal={taskIndex + 1}
            statementHtml={statementHtml}
            statementVisible={statementVisible}
            source={source}
            check={check}
            state={state}
            draftReady={workspaceReady}
            checking={checking}
            checkerUnavailable={checkerUnavailable}
            reportHref={reportHref}
            reportAccessibleLabel={reportAccessibleLabel}
            onAnswerChange={(index, value) => {
              setState((current) => ({
                ...current,
                answers: current.answers.with(index, value),
                results: null,
                dirty: true,
                view: "form",
              }));
            }}
            onVerify={() => void verify()}
          />
          <HelpPanel
            state={state}
            hintsHtml={hintsHtml}
            solutionHtml={solutionHtml}
            onRetry={() =>
              setState((current) => ({ ...current, view: "form" }))
            }
            onShowHint={showHint}
            onNextHelp={nextHelp}
            onShowSolution={showSolution}
          />
        </div>

        <TaskNavigation
          previousHref={previous?.href ?? null}
          nextHref={next?.href ?? null}
          onSkip={skipTask}
          skipDisabled={!workspaceReady}
        />
      </div>
    </main>
  );
}

function currentStatus({
  solved,
  burned,
  attempted,
}: {
  solved: boolean;
  burned: boolean;
  attempted: boolean;
}): TaskWorkspaceStatus {
  if (solved) return "solved";
  if (burned) return "skipped";
  if (attempted) return "retry";
  return "active";
}
