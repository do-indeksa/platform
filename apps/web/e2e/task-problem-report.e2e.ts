import { expect, test } from "@playwright/test";

const task = {
  id: "kv-001",
  topic: "kvadratna-jednacina",
};

const locales = [
  {
    locale: "sr",
    prefix: "",
    label: "Prijavi grešku",
    accessibleLabel:
      "Prijavi grešku u zadatku kv-001 na GitHubu (otvara se u novoj kartici)",
  },
  {
    locale: "en",
    prefix: "/en",
    label: "Report a problem",
    accessibleLabel:
      "Report a problem with task kv-001 on GitHub (opens in a new tab)",
  },
  {
    locale: "ru",
    prefix: "/ru",
    label: "Сообщить об ошибке",
    accessibleLabel:
      "Сообщить об ошибке в задании kv-001 на GitHub (откроется в новой вкладке)",
  },
] as const;

test("task reports carry localized content context without practice state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });

  for (const locale of locales) {
    const canonicalPath = `${locale.prefix}/tasks/${task.topic}/${task.id}`;
    await page.goto(
      `${canonicalPath}?returnTo=%2Ftasks%3Fq%3Dprivate&set=kv-001%2Clog-001&practice=private-run`,
    );

    const reportLink = page.getByTestId("task-problem-report");
    await expect(reportLink).toBeVisible();
    await expect(reportLink).toHaveText(locale.label);
    await expect(reportLink).toHaveAttribute(
      "aria-label",
      locale.accessibleLabel,
    );
    await expect(reportLink).toHaveAttribute("target", "_blank");
    await expect(reportLink).toHaveAttribute("rel", "noopener noreferrer");

    const href = await reportLink.getAttribute("href");
    expect(href).not.toBeNull();
    const report = new URL(href!);
    expect(`${report.origin}${report.pathname}`).toBe(
      "https://github.com/do-indeksa/platform/issues/new",
    );
    expect(Object.fromEntries(report.searchParams)).toMatchObject({
      template: "content_report.yml",
      title: `[Content] ${task.id}`,
      task: task.id,
      locale: locale.locale,
      path: canonicalPath,
    });
    expect(report.searchParams.get("revision")).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(href).not.toContain("private-run");
    expect(href).not.toContain("returnTo");
    expect(href).not.toContain("set=");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
