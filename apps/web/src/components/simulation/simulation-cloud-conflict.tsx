"use client";

import { CloudAlert, CloudDownload, Laptop, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  chooseCloudSimulationVersion,
  keepLocalSimulationVersion,
  useSimulationCloud,
} from "@/lib/simulation-cloud-sync";
import { simulationRunHref } from "@/lib/simulation-run";
import { useSimulation } from "@/lib/simulation-store";

export function SimulationCloudConflictNotice() {
  const t = useTranslations("simulation");
  const router = useRouter();
  const conflict = useSimulationCloud((state) => state.conflict);
  const recoveryFailed = useSimulationCloud((state) => state.recoveryFailed);
  const [working, setWorking] = useState<"cloud" | "local" | null>(null);

  const continueWith = async (choice: "cloud" | "local") => {
    if (working !== null) return;
    const remote = conflict?.remote ?? null;
    setWorking(choice);
    const resolved =
      choice === "cloud"
        ? await chooseCloudSimulationVersion()
        : await keepLocalSimulationVersion();
    setWorking(null);
    if (!resolved) return;
    if (choice === "cloud" && remote !== null) {
      router.replace(
        simulationRunHref("/simulation/new", {
          runId: remote.runtime.runId,
          blueprintVersion: remote.runtime.blueprintVersion,
          taskIds: remote.runtime.tasks.map((task) => task.id),
        }),
      );
      return;
    }
    const state = useSimulation.getState();
    if (state.runId && state.blueprintVersion && state.tasks.length > 0) {
      router.replace(
        simulationRunHref("/simulation/new", {
          runId: state.runId,
          blueprintVersion: state.blueprintVersion,
          taskIds: state.tasks.map((task) => task.id),
        }),
      );
    }
  };

  return (
    <section
      aria-labelledby="simulation-cloud-conflict-title"
      className="w-full max-w-xl border-y border-line py-8"
    >
      <CloudAlert aria-hidden className="h-9 w-9 text-amber-700" />
      <h1
        id="simulation-cloud-conflict-title"
        className="mt-5 text-2xl font-bold"
      >
        {t("cloudConflictTitle")}
      </h1>
      <p className="mt-3 leading-7 text-muted">{t("cloudConflictBody")}</p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {conflict?.remote && (
          <button
            type="button"
            disabled={working !== null}
            onClick={() => void continueWith("cloud")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-60"
          >
            {working === "cloud" ? (
              <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
            ) : (
              <CloudDownload aria-hidden className="h-5 w-5" />
            )}
            {t("useCloudVersion")}
          </button>
        )}
        <button
          type="button"
          disabled={working !== null}
          onClick={() => void continueWith("local")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-brand px-5 py-3 font-semibold text-brand-ink hover:bg-subtle disabled:opacity-60"
        >
          {working === "local" ? (
            <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
          ) : (
            <Laptop aria-hidden className="h-5 w-5" />
          )}
          {t("keepDeviceVersion")}
        </button>
      </div>
      {recoveryFailed && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {t("cloudRecoveryFailed")}
        </p>
      )}
    </section>
  );
}
