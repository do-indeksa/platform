import { expect, test } from "@playwright/test";

const locales = [
  {
    path: "/training/new",
    title: "Napravi vežbanje",
    p1: "Matematika (P1)",
    start: /Počni vežbanje/,
  },
  {
    path: "/en/training/new",
    title: "Create a practice set",
    p1: "Mathematics (P1)",
    start: /Start .* practice/,
  },
  {
    path: "/ru/training/new",
    title: "Создать тренировку",
    p1: "Математика (P1)",
    start: /Начать тренировку/,
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
});

for (const locale of locales) {
  test(`${locale.title} is a truthful localized P1 builder`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(locale.path);

    await expect(
      page.getByRole("heading", { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(locale.p1, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Physics|Физика|Fizika/i)).toHaveCount(0);
    await expect(page.getByText("P2", { exact: false })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: locale.start }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("builder controls produce a bounded practice and return to the draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/training/new");

  await expect(page.getByTestId("training-total")).toHaveText("5");
  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await expect(page.getByTestId("training-total")).toHaveText("4");
  await page.getByRole("switch", { name: "Only new tasks" }).click();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Local draft restored" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Advanced", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("switch", { name: "Only new tasks" }),
  ).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: /Start 4-task practice/ }).click();
  await expect(page).toHaveURL(
    /\/en\/tasks\/.+\?returnTo=%2Ftraining%2Fnew&set=.+&practice=[0-9a-f-]{36}$/,
  );
  await expect(page.getByText("1 of 4 tasks", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Back to practice/ }).click();
  await expect(page).toHaveURL(/\/en\/training\/new$/);
  await expect(
    page.getByRole("button", { name: "Local draft restored" }),
  ).toBeVisible();
});

test("invalid persisted input is ignored and all P1 positions stay reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "do-indeksa-training-builder",
      JSON.stringify({
        version: 1,
        blueprintVersion: "2025.1",
        quantities: { 99: 1000 },
        difficulty: "invented",
        onlyNew: "yes",
      }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ru/training/new");

  await expect(
    page.getByRole("button", { name: "Показать позиции 9–10" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Показать позиции 9–10" }).click();
  await expect(page.getByTestId("training-position-10")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Локальный черновик восстановлен" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("training-total")).toHaveText("5");
});

test("all controls stay bounded and an empty composition cannot start", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/training/new");
  await page.getByRole("button", { name: "All positions" }).click();

  await expect(page.getByTestId("training-total")).toHaveText("10");
  for (const button of await page
    .getByRole("button", { name: /^Add one task from position/ })
    .all()) {
    await expect(button).toBeDisabled();
  }
  await expect(
    page.getByRole("button", { name: /Start 10-task/ }),
  ).toBeEnabled();

  for (let position = 1; position <= 10; position += 1) {
    await page
      .getByRole("checkbox", {
        name: `Select position ${position}`,
        exact: true,
      })
      .uncheck();
  }
  await expect(page.getByTestId("training-total")).toHaveText("0");
  await expect(
    page.getByRole("button", { name: "No matching published tasks" }),
  ).toBeDisabled();
});

test("attempt-aware presets and settings affect the exact generated sequence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "do-indeksa-attempts",
      JSON.stringify({
        version: 1,
        attempts: [
          {
            taskId: "kb-001",
            slot: 1,
            correct: false,
            source: "practice",
            helpLevel: 0,
            at: "2026-08-10T10:00:00.000Z",
          },
        ],
      }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/training/new");

  await page.getByRole("button", { name: "Recent mistakes" }).click();
  await expect(page.getByTestId("training-total")).toHaveText("1");
  await page.getByRole("switch", { name: "Prioritize mistakes" }).click();
  await page.getByRole("switch", { name: "Shuffle positions" }).click();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("button", { name: /Start 1-task practice/ }).click();

  await expect(page).toHaveURL(/\/en\/tasks\/kompleksni-brojevi\/kb-002\?/);
});

test("an authenticated journal failure exposes a degraded but editable state", async ({
  page,
}) => {
  await page.unroute("**/api/v1/me");
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "student@example.invalid",
        name: "Student",
      },
    }),
  );
  await page.route("**/graphql", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/training/new");

  await expect(
    page.getByText(
      "Account sync is unavailable. This device's attempts are still used.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await expect(page.getByTestId("training-total")).toHaveText("4");
  await expect(
    page.getByRole("button", { name: /Start 4-task/ }),
  ).toBeEnabled();
});
