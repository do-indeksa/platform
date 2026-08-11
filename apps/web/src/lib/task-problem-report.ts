const TASK_REPORT_FORM_URL =
  "https://github.com/do-indeksa/platform/issues/new";
const TASK_REPORT_TEMPLATE = "content_report.yml";

export type TaskProblemReportContext = {
  taskId: string;
  taskRevision: string;
  topic: string;
  locale: string;
};

export function buildTaskProblemReportUrl({
  taskId,
  taskRevision,
  topic,
  locale,
}: TaskProblemReportContext): string {
  const url = new URL(TASK_REPORT_FORM_URL);
  url.searchParams.set("template", TASK_REPORT_TEMPLATE);
  url.searchParams.set("title", `[Content] ${taskId}`);
  url.searchParams.set("task", taskId);
  url.searchParams.set("revision", taskRevision);
  url.searchParams.set("locale", locale);
  url.searchParams.set("path", canonicalTaskPath(locale, topic, taskId));
  return url.toString();
}

export function canonicalTaskPath(
  locale: string,
  topic: string,
  taskId: string,
): string {
  const localePrefix = locale === "sr" ? "" : `/${encodeSegment(locale)}`;
  return `${localePrefix}/tasks/${encodeSegment(topic)}/${encodeSegment(taskId)}`;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}
