import { expect, test, type Page } from "@playwright/test";

const variants = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 880 },
  { name: "desktop", width: 1440, height: 930 },
] as const;

for (const variant of variants) {
  test.describe(`task-bank-${variant.name}`, () => {
    test.use({ viewport: variant });

    test("canonical filtered task bank", async ({ page }) => {
      await installTaskBankFixture(page);
      await page.goto("/ru/tasks?position=1&position=2", {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("heading", { name: "Задания", exact: true }),
      ).toBeVisible();
      await waitForFonts(page);

      await expect(page).toHaveScreenshot(`task-bank-ru-${variant.name}.png`);
    });
  });
}

test.describe("task-bank-states", () => {
  test.use({ viewport: { width: 1024, height: 880 } });

  test("selected tasks", async ({ page }) => {
    await installTaskBankFixture(page);
    await page.goto(
      "/ru/tasks?selected=kb-001&selected=kb-002&selected=kb-003",
      { waitUntil: "networkidle" },
    );
    await expect(page.getByText("Выбрано: 3", { exact: true })).toBeVisible();
    await waitForFonts(page);

    await expect(page).toHaveScreenshot("task-bank-ru-selected-tablet.png");
  });

  test("empty results", async ({ page }) => {
    await installTaskBankFixture(page);
    await page.goto("/ru/tasks?topic=trigonometrija&difficulty=advanced", {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: "Ничего не найдено" }),
    ).toBeVisible();
    await waitForFonts(page);

    await expect(page).toHaveScreenshot("task-bank-ru-empty-tablet.png");
  });
});

async function installTaskBankFixture(page: Page) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-000000000154",
        email: "polina@example.test",
        name: "Полина",
      },
    }),
  );
  await page.route("**/graphql", (route) =>
    route.fulfill({
      json: { data: { attempts: [], completedSimulationRuns: [] } },
    }),
  );
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
