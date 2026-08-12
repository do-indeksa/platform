"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

export function TaskWorkspace({
  taskId,
  slot,
  taskRevision,
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
}: TaskWorkspaceProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [statementVisible, setStatementVisible] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkerUnavailable, setCheckerUnavailable] = useState(false);
  const [state, setState, draftReady] = useTaskCheckState(
    taskId,
    check.length,
    hintsHtml.length,
    t("unsavedExit"),
    practiceId,
  );
  const historyEntryId = useRef<string | null>(null);
  const attemptStartedAt = useRef<number | null>(null);
  const sequenceKey = useMemo(
    () => sequence.map(({ id }) => id).join(","),
    [sequence],
  );
  const elapsedSeconds = usePracticeElapsedSeconds(
    practiceId ? `practice:${practiceId}` : `sequence:${sequenceKey}`,
  );
  const storedStatuses = useStoredTaskStatuses(
    sequence,
    practiceId,
    `${state.attempted}:${state.solved}:${state.burned}:${state.view}`,
  );
  const storedDurations = useStoredTaskDurations(
    sequence,
    practiceId,
    `${state.activeDurationMs ?? ""}:${state.view}`,
  );
  const statuses: Readonly<Record<string, TaskWorkspaceStatus>> = {
    ...storedStatuses,
    [taskId]: currentStatus(state),
  };
  const previous =
    sequence.length > 1
      ? sequence[(taskIndex - 1 + sequence.length) % sequence.length]
      : null;
  const next =
    sequence.length > 1 ? sequence[(taskIndex + 1) % sequence.length] : null;

  useEffect(() => {
    attemptStartedAt.current = Date.now();
  }, [taskId]);

  const recordJournalAttempt = (
    outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
    helpLevel: number,
  ): number => {
    const submittedAt = Date.now();
    const startedAt = attemptStartedAt.current ?? submittedAt;
    const activeDurationMs = Math.max(0, submittedAt - startedAt);
    recordPracticeAttempt({
      taskId,
      slot,
      taskRevision,
      startedAt: new Date(startedAt).toISOString(),
      submittedAt: new Date(submittedAt).toISOString(),
      activeDurationMs,
      answer: JSON.stringify(state.answers),
      outcome,
      helpLevel,
    });
    attemptStartedAt.current = submittedAt;
    return activeDurationMs;
  };

  const verify = async () => {
    if (!draftReady || checking) return;
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
    let activeDurationMs: number | null = null;
    if (!state.solved && !state.burned) {
      activeDurationMs = recordJournalAttempt("SKIPPED", 3);
      recordHistoryHelp(3);
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
    if (!state.solved && !state.burned) {
      const activeDurationMs = recordJournalAttempt(
        "SKIPPED",
        state.hintsShown,
      );
      recordHistoryHelp(state.hintsShown);
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
      writeTaskDraftSession(taskId, practiceId, skipped);
    }
    router.push(next?.href ?? returnTo);
  };

  const recordHistoryHelp = (helpLevel: number) => {
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
          outcome: "incorrect",
          answers: state.answers,
          helpLevel,
        },
      ])[0]?.id ?? null;
  };

  return (
    <main
      data-testid="task-workspace"
      data-draft-state={draftReady ? "ready" : "loading"}
      aria-busy={!draftReady}
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
          />
          <QuestionPanel
            ordinal={taskIndex + 1}
            statementHtml={statementHtml}
            statementVisible={statementVisible}
            source={source}
            check={check}
            state={state}
            draftReady={draftReady}
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
