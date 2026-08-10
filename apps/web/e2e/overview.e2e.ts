import { expect, test } from "@playwright/test";

const localizedOverviews = [
  {
    path: "/",
    heading: "Priprema za P1 iz matematike",
    start: "Počni vežbanje",
    check: "Proveri nivo",
    position: /^Pozicija 1:/,
    difficulty: "Težina",
  },
  {
    path: "/en",
    heading: "Prepare for the P1 mathematics exam",
    start: "Start practice",
    check: "Check your level",
    position: /^Position 1:/,
    difficulty: "Difficulty",
  },
  {
    path: "/ru",
    heading: "Подготовка к P1 по математике",
    start: "Начать практику",
    check: "Проверить уровень",
    position: /^Позиция 1:/,
    difficulty: "Сложность",
  },
] as const;

for (const locale of localizedOverviews) {
  test(`${locale.path} exposes the P1 actions and builder in the mobile viewport`, async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      ) {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("response", (response) => {
      const { pathname } = new URL(response.url());
      if (response.status() >= 400 && pathname !== "/api/v1/me") {
        browserErrors.push(`${response.status()} ${pathname}`);
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(locale.path);

    await expect(
      page.getByRole("heading", { name: locale.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: locale.start, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: locale.check, exact: true }),
    ).toBeVisible();
    const firstPosition = page.getByRole("button", {
      name: locale.position,
    });
    await expect(firstPosition).toBeVisible();
    expect((await firstPosition.boundingBox())?.y).toBeLessThan(844);
    const difficulty = await page.getByLabel(locale.difficulty).boundingBox();
    const mobileNavigation = await page
      .getByTestId("mobile-navigation")
      .boundingBox();
    expect(
      (difficulty?.y ?? 0) + (difficulty?.height ?? 0),
    ).toBeLessThanOrEqual(mobileNavigation?.y ?? 844);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByTestId("continue-run")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });
}

test("quick builder starts a balanced bounded practice set", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");

  await expect(
    page.getByRole("button", { name: "Choose a position", exact: true }),
  ).toBeDisabled();
  const firstPosition = page.getByRole("button", { name: /^Position 1:/ });
  const secondPosition = page.getByRole("button", { name: /^Position 2:/ });
  await firstPosition.click();
  await expect(firstPosition).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Start 3 tasks" }),
  ).toBeEnabled();
  await firstPosition.click();
  await expect(firstPosition).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Choose a position", exact: true }),
  ).toBeDisabled();
  await firstPosition.click();
  await secondPosition.click();

  const start = page.getByRole("button", { name: "Start 5 tasks" });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page.getByText("Task 1 of 5", { exact: true })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe("/en/tasks/kompleksni-brojevi/kb-001");
  expect(url.searchParams.get("set")?.split(",")).toEqual([
    "kb-001",
    "kv-001",
    "kb-002",
    "kv-002",
    "kb-003",
  ]);
  expect(url.searchParams.get("practice")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("position cards use the current blueprint and local progress", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "do-indeksa-attempts",
      JSON.stringify({
        version: 1,
        attempts: ["kb-001", "kb-002", "kb-003"].map((taskId, index) => ({
          taskId,
          slot: 1,
          correct: true,
          source: "practice",
          helpLevel: 0,
          at: `2026-08-0${index + 1}T12:00:00.000Z`,
        })),
      }),
    );
  });
  await page.goto("/en");

  const first = page.getByRole("link", {
    name: /^Open position 1:/,
  });
  await expect(first.getByText("Confident", { exact: true })).toBeVisible();
  await expect(first.getByText("100%", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open position 3: Exponential equations and inequalities",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open position 4: Logarithms" }),
  ).toBeVisible();
});

test("an unfinished diagnostic is resumable from the overview", async ({
  page,
}) => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const taskIds = [
    "kb-001",
    "kv-001",
    "eks-001",
    "log-001",
    "trig-001",
    "vek-001",
    "plan-001",
    "ster-001",
    "fun-001",
    "komb-001",
  ];
  await page.addInitScript(
    ({ runId, taskIds }) => {
      localStorage.setItem(
        "do-indeksa-diagnostic",
        JSON.stringify({
          version: 1,
          state: {
            runId,
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
            phase: "running",
            currentIndex: 2,
            startedAt: 1_786_300_000_000,
          },
        }),
      );
    },
    { runId, taskIds },
  );
  await page.goto("/en");

  const continuation = page.getByTestId("continue-run");
  await expect(
    continuation.getByRole("heading", { name: "Unfinished level check" }),
  ).toBeVisible();
  await expect(continuation.getByText("Task 3 of 10")).toBeVisible();
  const resume = continuation.getByRole("link", {
    name: "Continue",
    exact: true,
  });
  await expect(resume).toHaveAttribute("href", new RegExp(`run=${runId}`));
});
