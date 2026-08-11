import { describe, expect, it } from "vitest";
import {
  buildTaskProblemReportUrl,
  canonicalTaskPath,
} from "./task-problem-report";

describe("task problem reports", () => {
  it("prefills only the allowlisted content context", () => {
    const report = new URL(
      buildTaskProblemReportUrl({
        taskId: "kv-001",
        taskRevision: "sha256:abc123",
        topic: "kvadratna-jednacina",
        locale: "en",
      }),
    );

    expect(`${report.origin}${report.pathname}`).toBe(
      "https://github.com/do-indeksa/platform/issues/new",
    );
    expect([...report.searchParams.keys()]).toEqual([
      "template",
      "title",
      "task",
      "revision",
      "locale",
      "path",
    ]);
    expect(Object.fromEntries(report.searchParams)).toEqual({
      template: "content_report.yml",
      title: "[Content] kv-001",
      task: "kv-001",
      revision: "sha256:abc123",
      locale: "en",
      path: "/en/tasks/kvadratna-jednacina/kv-001",
    });
  });

  it("uses the unprefixed canonical path for the default Serbian locale", () => {
    expect(canonicalTaskPath("sr", "logaritmi", "log-001")).toBe(
      "/tasks/logaritmi/log-001",
    );
    expect(canonicalTaskPath("ru", "logaritmi", "log-001")).toBe(
      "/ru/tasks/logaritmi/log-001",
    );
  });

  it("keeps path-like values inside their encoded fields", () => {
    const report = new URL(
      buildTaskProblemReportUrl({
        taskId: "task?owner=private",
        taskRevision: "rev&answer=secret",
        topic: "../topic",
        locale: "en/../../ru",
      }),
    );

    expect(report.pathname).toBe("/do-indeksa/platform/issues/new");
    expect(report.searchParams.get("owner")).toBeNull();
    expect(report.searchParams.get("answer")).toBeNull();
    expect(report.searchParams.get("task")).toBe("task?owner=private");
    expect(report.searchParams.get("revision")).toBe("rev&answer=secret");
    expect(report.searchParams.get("path")).toBe(
      "/en%2F..%2F..%2Fru/tasks/..%2Ftopic/task%3Fowner%3Dprivate",
    );
  });
});
