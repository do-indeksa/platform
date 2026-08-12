import { expect, test, type Page } from "@playwright/test";
import {
  cloudFixture,
  installCloudRoutes,
  runId as remoteDiagnosticRunId,
  taskIds,
} from "./diagnostic-cloud-fixture";
import {
  installSimulationCloudRoutes,
  simulationCloudFixture,
  simulationRunId,
} from "./simulation-cloud-fixture";

const localizedCabinets = [
  {
    path: "/cabinet",
    heading: "Moj kabinet",
    subject: "P1 · Matematika",
    start: "Priprema još nije započeta",
    primary: "Počni prvi zadatak",
    secondary: "Pokreni dijagnostiku",
    programs: "Programi za P1",
  },
  {
    path: "/en/cabinet",
    heading: "My cabinet",
    subject: "P1 · Mathematics",
    start: "Preparation has not started yet",
    primary: "Start the first task",
    secondary: "Start level check",
    programs: "Programs using P1",
  },
  {
    path: "/ru/cabinet",
    heading: "Мой кабинет",
    subject: "P1 · Математика",
    start: "Подготовка ещё не начата",
    primary: "Начать первое задание",
    secondary: "Запустить диагностику",
    programs: "Программы с экзаменом P1",
  },
] as const;

for (const locale of localizedCabinets) {
  test(`${locale.path} renders the Figma empty state with a real P1 entry point`, async ({
    page,
  }) => {
    const browserErrors = monitorBrowserErrors(page);
    await guestSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(locale.path);

    const dashboard = page.getByTestId("cabinet-dashboard");
    await expect(dashboard).toHaveAttribute("data-state", "empty");
    await expect(
      page.getByRole("heading", { name: locale.heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(locale.subject, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: locale.start, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: locale.primary, exact: true }),
    ).toHaveAttribute("href", /\/tasks$/);
    await expect(
      page.getByRole("link", { name: locale.secondary, exact: true }),
    ).toHaveAttribute("href", /\/diagnostic$/);
    await expect(
      page.getByRole("heading", { name: locale.programs, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("cabinet-position-map")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-latest-results")).toHaveCount(0);
    await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);
    expect(await documentMetrics(page)).toEqual({
      widthFits: true,
      height: 1636,
    });
    expect(browserErrors).toEqual([]);
  });
}

test("local attempts populate the exact cabinet slots with real progress", async ({
  page,
}) => {
  await guestSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(seedPracticeProgress);
  await page.goto("/en/cabinet");

  const dashboard = page.getByTestId("cabinet-dashboard");
  await expect(dashboard).toHaveAttribute("data-state", "populated");
  const continuation = page.getByTestId("continue-run");
  await expect(
    continuation.getByRole("heading", {
      name: "Position 3 · Equations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    continuation.getByText("You completed 3 of 3 tasks"),
  ).toBeVisible();
  await expect(continuation.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cabinet-position-map")).toBeVisible();
  await expect(page.getByTestId("cabinet-latest-results")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open position 3: Equations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Latest practice", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  expect(await documentMetrics(page)).toEqual({
    widthFits: true,
    height: 2920,
  });
});

test("an unfinished diagnostic keeps its real resume URL in the Figma card", async ({
  page,
}) => {
  const runId = "11111111-1111-4111-8111-111111111111";
  await guestSession(page);
  await page.addInitScript(
    ({ runId, taskIds }) => {
      const startedAt = Date.now() - 10 * 60_000;
      localStorage.setItem(
        "do-indeksa-diagnostic",
        JSON.stringify({
          version: 3,
          state: {
            runId,
            runOwnerId: null,
            checkpointVersion: 0,
            taskIds,
            slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            answers: taskIds.map(() => [""]),
            outcomes: [
              "correct",
              "incorrect",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            completedAt: [
              startedAt + 60_000,
              startedAt + 120_000,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            phase: "running",
            currentIndex: 2,
            startedAt,
          },
        }),
      );
    },
    { runId, taskIds },
  );
  await page.goto("/en/cabinet");

  const continuation = page.getByTestId("continue-run");
  await expect(continuation).toHaveAttribute(
    "data-design-status",
    "provisional",
  );
  await expect(
    continuation.getByRole("heading", { name: "Unfinished level check" }),
  ).toBeVisible();
  await expect(continuation.getByText("Task 3 of 10 is next")).toBeVisible();
  await expect(
    continuation.getByRole("link", { name: "Continue check", exact: true }),
  ).toHaveAttribute("href", new RegExp(`run=${runId}`));
  await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
    "data-state",
    "populated",
  );
});

test("an authenticated cloud mock is resumable without demo timing", async ({
  page,
}) => {
  const fixture = await simulationCloudFixture({
    draft: ["1", "", "", ""],
    startedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  });
  await installSimulationCloudRoutes(page, fixture, []);
  await page.goto("/en/cabinet");

  const continuation = page.getByTestId("continue-run");
  await expect(continuation).toHaveAttribute("data-design-status", "figma");
  await expect(
    continuation.getByRole("heading", { name: "Unfinished mock exam" }),
  ).toBeVisible();
  await expect(
    continuation.getByText("You answered 1 of 10 tasks"),
  ).toBeVisible();
  await expect(
    continuation.getByRole("link", { name: "Continue exam", exact: true }),
  ).toHaveAttribute("href", new RegExp(`run=${simulationRunId}`));
  await expect(continuation.getByText(/remaining$/)).toBeVisible();
});

test("a cloud conflict is surfaced as a resolution action", async ({
  page,
}) => {
  const fixture = await cloudFixture({ completed: 2, draft: [] });
  await installCloudRoutes(page, fixture, []);
  await page.addInitScript(
    ({ taskIds, ownerId }) => {
      const startedAt = Date.now() - 10 * 60_000;
      localStorage.setItem(
        "do-indeksa-diagnostic",
        JSON.stringify({
          version: 3,
          state: {
            runId: "11111111-1111-4111-8111-111111111111",
            runOwnerId: ownerId,
            checkpointVersion: 0,
            taskIds,
            slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            answers: taskIds.map(() => [""]),
            outcomes: [
              "correct",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            completedAt: [
              startedAt + 60_000,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            phase: "running",
            currentIndex: 1,
            startedAt,
          },
        }),
      );
    },
    {
      taskIds,
      ownerId: "39ec4650-762d-437f-9917-c31ab167cb99",
    },
  );
  await page.goto("/en/cabinet");

  const continuation = page.getByTestId("continue-run");
  await expect(
    continuation.getByRole("heading", {
      name: "The level check has two versions",
    }),
  ).toBeVisible();
  await expect(
    continuation.getByRole("link", { name: "Review versions", exact: true }),
  ).toHaveAttribute("href", /\/diagnostic$/);
  await expect(continuation).toHaveAttribute(
    "data-design-status",
    "provisional",
  );
  expect(remoteDiagnosticRunId).not.toBe(
    "11111111-1111-4111-8111-111111111111",
  );
});

test("cloud degradation does not leave the cabinet in a loading state", async ({
  page,
}) => {
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
    const body = route.request().postDataJSON() as { operationName: string };
    if (body.operationName === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: [] } } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { errors: [{ message: "offline" }] },
    });
  });
  await page.goto("/en/cabinet");

  await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
    "data-state",
    "empty",
  );
  await expect(
    page.getByRole("heading", {
      name: "Preparation has not started yet",
      exact: true,
    }),
  ).toBeVisible();
});

async function guestSession(page: Page): Promise<void> {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
}

function seedPracticeProgress(): void {
  const attempts = ["eks-001", "eks-002", "eks-003"].map((taskId, index) => ({
    taskId,
    slot: 3,
    correct: index !== 1,
    source: "practice",
    helpLevel: 0,
    at: `2026-08-0${index + 1}T12:00:00.000Z`,
  }));
  localStorage.setItem(
    "do-indeksa-attempts",
    JSON.stringify({ version: 1, attempts }),
  );
  localStorage.setItem(
    "do-indeksa-task-history",
    JSON.stringify({
      version: 2,
      entries: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          taskId: "eks-003",
          slot: 3,
          source: "practice",
          outcome: "correct",
          answers: ["1"],
          helpLevel: 0,
          at: "2026-08-03T12:00:00.000Z",
          ownerId: null,
        },
      ],
    }),
  );
}

function monitorBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function documentMetrics(page: Page): Promise<{
  widthFits: boolean;
  height: number;
}> {
  return page.evaluate(() => ({
    widthFits: document.documentElement.scrollWidth <= window.innerWidth,
    height: document.documentElement.scrollHeight,
  }));
}
