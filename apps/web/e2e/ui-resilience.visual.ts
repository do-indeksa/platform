import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  installCabinetConflictVisualFixture,
  installHistoryDegradedVisualFixture,
} from "./ui-resilience-visual-fixture";

const FIXED_TIME = new Date("2026-08-11T10:00:00.000Z");
const LONG_SERBIAN_TASK_PATH = "/tasks/kombinatorika/komb-003";

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    test("cabinet cloud conflict remains usable", async ({ page }) => {
      await installCabinetConflictVisualFixture(page);
      await page.goto("/cabinet", { waitUntil: "networkidle" });

      const card = page.getByTestId("continue-run");
      await expect(card).toHaveAttribute("data-design-status", "provisional");
      await expect(
        card.getByRole("heading", {
          name: "Provera nivoa ima dve verzije",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        card.getByRole("link", { name: "Pregledaj verzije", exact: true }),
      ).toBeVisible();
      await assertNoPageOverflow(page);
      await assertInside(card, page.getByRole("main"));
      await assertCardContentClear(page, viewport.width);
      await stabilize(page);

      await expect(page).toHaveScreenshot(
        `cabinet-conflict-${viewport.name}.png`,
        { fullPage: true },
      );
    });

    test("degraded history keeps available activity visible", async ({
      page,
    }) => {
      await installHistoryDegradedVisualFixture(page);
      await page.goto("/history", { waitUntil: "networkidle" });

      const history = page.getByTestId("history-page");
      await expect(history).toHaveAttribute("data-sync-status", "degraded");
      await expect(history).toHaveAttribute(
        "data-design-status",
        "provisional",
      );
      await expect(
        page.getByText(
          "Sinhronizacija naloga još nije ažurna. Ispravna aktivnost sačuvana na ovom uređaju ostaje vidljiva.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByTestId("history-feed").locator(":scope > li"),
      ).not.toHaveCount(0);
      await assertNoPageOverflow(page);
      await stabilize(page);

      await expect(page).toHaveScreenshot(
        `history-degraded-${viewport.name}.png`,
        { fullPage: true },
      );
    });

    test("the longest verified Serbian task copy fits the workspace", async ({
      page,
    }) => {
      await page.route("**/api/v1/me", (route) =>
        route.fulfill({ status: 401, body: "" }),
      );
      await page.goto(LONG_SERBIAN_TASK_PATH, { waitUntil: "networkidle" });

      await expect(
        page.getByRole("heading", {
          name: "Vežbanje · Pozicija 10 · Kombinatorika",
          exact: true,
        }),
      ).toBeVisible();
      const question = page.getByTestId("task-question-panel");
      await expect(question).toContainText("bar jedna devojka");
      await expect(question).toContainText("redosled sabiraka");
      await expect(question).toContainText("cifre se mogu ponavljati");
      await assertWorkspaceOrder(page, viewport.width);
      await assertNoPageOverflow(page);
      await stabilize(page);

      await expect(page).toHaveScreenshot(
        `task-long-serbian-${viewport.name}.png`,
        { fullPage: true },
      );
    });
  });
}

async function assertWorkspaceOrder(page: Page, width: number): Promise<void> {
  const rail = page.getByTestId("task-workspace-rail");
  const question = page.getByTestId("task-question-panel");
  const help = page.getByTestId("task-help-panel");
  const [railBox, questionBox, helpBox] = await Promise.all([
    rail.boundingBox(),
    question.boundingBox(),
    help.boundingBox(),
  ]);
  expect(railBox).not.toBeNull();
  expect(questionBox).not.toBeNull();
  expect(helpBox).not.toBeNull();
  if (!railBox || !questionBox || !helpBox) return;

  if (width >= 1280) {
    expect(railBox.x + railBox.width).toBeLessThanOrEqual(questionBox.x);
    expect(questionBox.x + questionBox.width).toBeLessThanOrEqual(helpBox.x);
    return;
  }
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(questionBox.y);
  expect(questionBox.y + questionBox.height).toBeLessThanOrEqual(helpBox.y);
}

async function assertCardContentClear(
  page: Page,
  width: number,
): Promise<void> {
  if (width >= 1024) return;
  const content = await page.getByTestId("continue-run-content").boundingBox();
  const artwork = await page.getByTestId("continue-run-artwork").boundingBox();
  expect(content).not.toBeNull();
  expect(artwork).not.toBeNull();
  if (!content || !artwork) return;

  if (width >= 768) {
    expect(content.x + content.width).toBeLessThanOrEqual(artwork.x);
    return;
  }
  expect(content.y + content.height).toBeLessThanOrEqual(artwork.y);
}

async function assertInside(child: Locator, parent: Locator): Promise<void> {
  const [childBox, parentBox] = await Promise.all([
    child.boundingBox(),
    parent.boundingBox(),
  ]);
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  if (!childBox || !parentBox) return;
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width,
  );
}

async function assertNoPageOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function stabilize(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}
