import { useTranslations } from "next-intl";
import type { PrepAction, PrepActionKind } from "@/lib/prep-plan";

export type PrepTranslation = ReturnType<typeof useTranslations<"prep">>;

export function actionTitle(t: PrepTranslation, action: PrepAction): string {
  switch (action.kind) {
    case "diagnostic":
      return t("actionDiagnostic");
    case "practice":
      return t("actionPractice", {
        count: action.count,
        position: action.position ?? 1,
      });
    case "review":
      return t("actionReview", { count: action.count });
    case "check":
      return t("actionCheck", { count: action.count });
    case "settings":
      return action.completed ? t("actionSettingsDone") : t("actionSettings");
  }
}

export function actionReason(t: PrepTranslation, action: PrepAction): string {
  switch (action.reason) {
    case "noData":
      return t("reasonNoData");
    case "missingBaseline":
      return t("reasonMissingBaseline");
    case "errors":
      return t("reasonErrors", {
        count: action.reasonCount,
        position: action.position ?? 1,
      });
    case "hints":
      return t("reasonHints", {
        count: action.reasonCount,
        position: action.position ?? 1,
      });
    case "untested":
      return t("reasonUntested", { position: action.position ?? 1 });
    case "lowEvidence":
      return t("reasonLowEvidence", {
        count: action.reasonCount,
        position: action.position ?? 1,
      });
    case "stale":
      return t("reasonStale", { position: action.position ?? 1 });
    case "maintain":
      return t("reasonMaintain");
    case "recentErrors":
      return t("reasonRecentErrors", { count: action.reasonCount });
    case "preferences":
      return t("reasonPreferences");
  }
}

export function actionType(t: PrepTranslation, kind: PrepActionKind): string {
  switch (kind) {
    case "diagnostic":
      return t("actionType.diagnostic");
    case "practice":
      return t("actionType.practice");
    case "review":
      return t("actionType.review");
    case "check":
      return t("actionType.check");
    case "settings":
      return t("actionType.settings");
  }
}

export function actionVolume(t: PrepTranslation, action: PrepAction): string {
  return action.kind === "settings"
    ? t("fieldsVolume", { count: action.count })
    : t("tasksVolume", { count: action.count });
}
