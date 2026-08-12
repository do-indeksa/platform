import { expect, test, type Page } from "./test";
import { installHistoryVisualFixture } from "./history-visual-fixture";

const FIXED_TIME = new Date("2026-08-11T13:00:00.000Z");

const viewports = [
  { name: "mobile", width: 390, height: 1050, contentX: 16, contentWidth: 358 },
  { name: "tablet", width: 1024, height: 900, contentX: 52, contentWidth: 920 },
  {
    name: "desktop",
    width: 1440,
    height: 900,
    contentX: 200,
    contentWidth: 1040,
  },
] as const;

const surfaces = [
  { name: "all", path: "/ru/history", rows: 6, empty: false },
  { name: "tasks", path: "/ru/history?tab=tasks", rows: 6, empty: false },
  {
    name: "trainings",
    path: "/ru/history?tab=trainings",
    rows: 5,
    empty: false,
  },
  { name: "mocks", path: "/ru/history?tab=mocks", rows: 4, empty: false },
  { name: "empty", path: "/ru/history", rows: 0, empty: true },
] as const;

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    for (const surface of surfaces) {
      test(surface.name, async ({ page }) => {
        await page.clock.setFixedTime(FIXED_TIME);
        await installHistoryVisualFixture(page, surface.empty);
        await page.goto(surface.path, { waitUntil: "networkidle" });
        await expect(page.getByTestId("history-page")).toHaveAttribute(
          "data-sync-status",
          "synced",
        );
        if (surface.rows === 0) {
          await expect(
            page.getByRole("heading", { name: "История пуста" }),
          ).toBeVisible();
        } else {
          await expect(
            page.getByTestId("history-feed").locator(":scope > li"),
          ).toHaveCount(surface.rows);
        }
        await assertHistoryGeometry(page, viewport);
        await page.evaluate(async () => {
          await document.fonts.ready;
          window.scrollTo(0, 0);
        });
        await expect(page).toHaveScreenshot(
          `history-${surface.name}-${viewport.name}.png`,
        );
      });
    }
  });
}

async function assertHistoryGeometry(
  page: Page,
  viewport: (typeof viewports)[number],
): Promise<void> {
  const content = await page.getByTestId("history-content").boundingBox();
  const tabs = await page.getByTestId("history-tabs").boundingBox();
  const filters = await page.getByTestId("history-filters").boundingBox();
  expect(content).not.toBeNull();
  expect(tabs).not.toBeNull();
  expect(filters).not.toBeNull();
  expect(content?.x).toBeCloseTo(viewport.contentX, 0);
  expect(content?.width).toBeCloseTo(viewport.contentWidth, 0);
  expect(tabs?.x).toBeCloseTo(viewport.contentX, 0);
  expect(filters?.x).toBeCloseTo(viewport.contentX, 0);
  expect(tabs?.height).toBe(viewport.name === "mobile" ? 38 : 42);
  expect(filters?.height).toBe(viewport.name === "mobile" ? 84 : 42);

  const tabSizes = await page
    .getByTestId("history-tabs")
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => ({
        width: link.getBoundingClientRect().width,
        height: link.getBoundingClientRect().height,
        fits: link.scrollWidth <= link.clientWidth,
      })),
    );
  expect(tabSizes).toEqual(
    (viewport.name === "mobile" ? [44, 68, 82, 125] : [60, 90, 110, 150]).map(
      (width) => ({
        width,
        height: viewport.name === "mobile" ? 36 : 40,
        fits: true,
      }),
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
