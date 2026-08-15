import { expect, test } from "./test";
import { installAuthBootstrapGate } from "./auth-bootstrap-fixture";

const DAY_MS = 24 * 60 * 60 * 1000;

const localizedLoadingStates = [
  {
    path: "/prep",
    status: "Sastavljamo tvoj plan...",
    title: "Plan pripreme",
    position: "Kombinatorika",
    readyAction: "Uradi kratku dijagnostiku",
  },
  {
    path: "/en/prep",
    status: "Building your plan...",
    title: "Preparation plan",
    position: "Combinatorics",
    readyAction: "Take the short diagnostic",
  },
  {
    path: "/ru/prep",
    status: "Собираем ваш план...",
    title: "План подготовки",
    position: "Комбинаторика",
    readyAction: "Пройти короткую диагностику",
  },
] as const;

for (const locale of localizedLoadingStates) {
  test(`${locale.path} keeps plan facts neutral until bootstrap completes`, async ({
    page,
  }) => {
    const releaseAuth = await installAuthBootstrapGate(page);
    await page.goto(locale.path, { waitUntil: "domcontentloaded" });

    const plan = page.getByTestId("prep-plan");
    await expect(plan).toHaveAttribute("data-state", "loading");
    await expect(plan).toHaveAttribute("aria-busy", "true");
    await expect(plan).toHaveAttribute(
      "aria-describedby",
      "prep-loading-status",
    );
    await expect(plan).toHaveAttribute("data-design-status", "provisional");
    await expect(
      page.getByRole("heading", { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(locale.position, { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("prep-loading-status")).toHaveText(
      locale.status,
    );
    await expect(page.getByTestId("prep-plan-summary")).toHaveCount(0);
    await expect(page.getByTestId("prep-position-list")).toHaveCount(0);
    await expect(page.getByTestId("next-action")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);

    const navigationCount = await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    );
    releaseAuth();

    await expect(plan).toHaveAttribute("data-state", "ready");
    await expect(plan).toHaveAttribute("aria-busy", "false");
    await expect(plan).not.toHaveAttribute("data-design-status", /.*/);
    await expect(page.getByTestId("prep-loading-status")).toHaveCount(0);
    await expect(page.getByTestId("prep-plan-summary")).toBeVisible();
    await expect(page.getByTestId("next-action")).toContainText(
      locale.readyAction,
    );
    expect(
      await page.evaluate(
        () => performance.getEntriesByType("navigation").length,
      ),
    ).toBe(navigationCount);
  });
}

test("an empty mobile plan has a concrete start and persists honest settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/prep");

  await expect(
    page.getByRole("heading", { name: "Preparation plan" }),
  ).toBeVisible();
  await expect(page.getByTestId("next-action")).toContainText(
    "Take the short diagnostic",
  );
  await expect(
    page.getByRole("progressbar", { name: "Practice readiness" }),
  ).toHaveAttribute("aria-valuenow", "0");
  const positionsTab = page.getByRole("tab", { name: "By position" });
  await positionsTab.focus();
  await positionsTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "This week" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Sync completed answers" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "This week" }).press("End");
  await expect(page.getByRole("tab", { name: "By topic" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("prep-position-list")).toHaveAttribute(
    "data-design-status",
    "provisional",
  );
  await page.getByRole("tab", { name: "This week" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const examDate = new Date(Date.now() + 60 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  await page.getByRole("button", { name: "Edit plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Goal and exam date" });
  await dialog.getByLabel("Target score").fill("42");
  await dialog.getByLabel("Exam date").fill(examDate);
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("42/60 points", { exact: true })).toBeVisible();
  await expect(page.getByTestId("prep-action-settings")).toContainText("Done");
  const persisted = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("do-indeksa-prep-settings-v2:guest") ?? "null",
    ),
  );
  expect(persisted).toEqual({
    state: { goalPoints: 42, examDate },
    version: 1,
  });
});

test("a fresh signed-in device continues after an all-skipped cloud diagnostic", async ({
  page,
}) => {
  const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
  const submittedAt = new Date().toISOString();
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as { operationName: string };
    if (call.operationName === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: [] } } });
      return;
    }
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({
        json: {
          data: {
            runs: [],
            latestSubmittedDiagnosticRun: { id: runId, submittedAt },
          },
        },
      });
      return;
    }
    if (call.operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    if (call.operationName === "PracticeRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    await route.fulfill({ status: 503, body: "" });
  });

  await page.goto("/en/prep");

  await expect(page.getByTestId("prep-plan")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.getByTestId("next-action")).toContainText(
    "Solve 3 tasks from position 1",
  );
  await expect(page.getByTestId("next-action")).not.toContainText(
    "Take the short diagnostic",
  );
  await page.getByRole("tab", { name: "This week" }).click();
  await expect(page.getByTestId("prep-action-diagnostic")).toContainText(
    "Done",
  );
});

test("an expired exam date is treated as incomplete", async ({ page }) => {
  const expiredDate = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  await page.addInitScript(
    ({ date }) =>
      localStorage.setItem(
        "do-indeksa-prep-settings-v2:guest",
        JSON.stringify({
          state: { goalPoints: 42, examDate: date },
          version: 1,
        }),
      ),
    { date: expiredDate },
  );
  await page.goto("/en/prep");

  await expect(
    page.getByText("Date has passed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "This week" }).click();
  await expect(page.getByTestId("prep-action-settings")).not.toContainText(
    "Done",
  );
});

test("the plan follows current P1 positions and keeps completed work visible", async ({
  page,
}) => {
  const baselineAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
  const baseline = [
    entry("kb-001", 1, true, baselineAt),
    entry("kv-001", 2, true, baselineAt),
    entry("eks-001", 4, false, baselineAt),
    entry("log-001", 3, true, baselineAt),
    entry("trig-001", 5, true, baselineAt),
    entry("vek-001", 6, true, baselineAt),
    entry("plan-001", 7, true, baselineAt),
    entry("ster-001", 8, true, baselineAt),
    entry("fun-001", 9, true, baselineAt),
    entry("komb-001", 10, true, baselineAt),
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/prep");
  await replaceAttempts(page, baseline);
  await page.reload();

  await expect(page.getByTestId("next-action")).toContainText(
    "Solve 3 tasks from position 3",
  );
  await expect(page.getByTestId("prep-position-3")).toContainText("1 mistake");
  const positionThree = page.getByRole("link", {
    name: /3 Exponential equations and inequalities/,
  });
  await expect(positionThree).toContainText("0/1");
  await expect(positionThree).toHaveAttribute(
    "href",
    "/en/tasks?topic=eksponencijalne",
  );

  await page.getByTestId("next-action").click();
  await expect(page).toHaveURL(/\/en\/tasks\/eksponencijalne\/eks-001\?/);
  await expect(page.getByText("1 of 3 tasks", { exact: true })).toBeVisible();

  const todayAt = new Date().toISOString();
  await page.evaluate(
    ({ attempts }) =>
      localStorage.setItem(
        "do-indeksa-attempts",
        JSON.stringify({ version: 1, attempts }),
      ),
    {
      attempts: [
        ...baseline,
        entry("eks-001", 4, true, todayAt, "practice"),
        entry("eks-002", 4, true, todayAt, "practice"),
        entry("eks-003", 4, true, todayAt, "practice"),
      ],
    },
  );
  await page.goto("/en/prep");

  await page.getByRole("tab", { name: "This week" }).click();
  await expect(page.getByTestId("prep-action-practice")).toContainText("Done");
  await expect(page.getByTestId("next-action")).not.toContainText(
    "Solve 3 tasks from position 3",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a low-intensity plan opens one stable 15-minute task assignment", async ({
  page,
}) => {
  const baselineAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
  const examDate = new Date(Date.now() + 90 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const baseline = [
    entry("kb-001", 1, true, baselineAt),
    entry("kv-001", 2, true, baselineAt),
    entry("eks-001", 4, false, baselineAt),
    entry("log-001", 3, true, baselineAt),
    entry("trig-001", 5, true, baselineAt),
    entry("vek-001", 6, true, baselineAt),
    entry("plan-001", 7, true, baselineAt),
    entry("ster-001", 8, true, baselineAt),
    entry("fun-001", 9, true, baselineAt),
    entry("komb-001", 10, true, baselineAt),
  ];
  await page.addInitScript(
    ({ attempts, date }) => {
      localStorage.setItem(
        "do-indeksa-attempts",
        JSON.stringify({ version: 1, attempts }),
      );
      localStorage.setItem(
        "do-indeksa-prep-settings-v2:guest",
        JSON.stringify({
          state: { goalPoints: 30, examDate: date },
          version: 1,
        }),
      );
    },
    { attempts: baseline, date: examDate },
  );
  await page.goto("/en/prep");

  const nextAction = page.getByTestId("next-action");
  await expect(nextAction).toContainText("Solve 3 tasks from position 3");
  await page.getByRole("tab", { name: "This week" }).click();
  await expect(page.getByTestId("prep-action-practice")).toContainText(
    "about 15 min",
  );
  const firstHref = await nextAction.getAttribute("href");
  if (firstHref === null) throw new Error("next action link is missing");
  const firstAssignment = new URL(
    firstHref,
    "http://localhost:3100",
  ).searchParams
    .get("set")
    ?.split(",");
  expect(firstAssignment).toHaveLength(3);
  expect(new Set(firstAssignment).size).toBe(3);

  await nextAction.click();
  await expect(page.getByText("1 of 3 tasks", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("set")?.split(",")).toEqual(
    firstAssignment,
  );

  await page.goto("/en/prep");
  await expect(page.getByTestId("next-action")).toHaveAttribute(
    "href",
    firstHref,
  );
});

type AttemptSeed = {
  taskId: string;
  slot: number;
  correct: boolean;
  source: "diagnostic" | "practice";
  helpLevel: number;
  at: string;
};

function entry(
  taskId: string,
  slot: number,
  correct: boolean,
  at: string,
  source: AttemptSeed["source"] = "diagnostic",
): AttemptSeed {
  return { taskId, slot, correct, source, helpLevel: 0, at };
}

async function replaceAttempts(
  page: import("@playwright/test").Page,
  attempts: AttemptSeed[],
) {
  await page.evaluate((seed) => {
    localStorage.setItem(
      "do-indeksa-attempts",
      JSON.stringify({ version: 1, attempts: seed }),
    );
  }, attempts);
}
