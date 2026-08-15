import { expect, test, type Page } from "./test";
import { preparePrepPlanVisual } from "./prep-plan-visual-fixture";

const FIXED_TIME = new Date("2026-08-12T10:00:00.000+02:00");

const viewports = [
  { name: "mobile", width: 390, height: 1988 },
  { name: "tablet", width: 1024, height: 1220 },
  { name: "desktop", width: 1440, height: 1220 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-000000000172",
        email: "polina@example.test",
        name: "Полина",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/graphql", (route) =>
    route.fulfill({
      json: { data: { attempts: [], completedSimulationRuns: [] } },
    }),
  );
  await preparePrepPlanVisual(page);
});

for (const viewport of viewports) {
  test(`matches the ${viewport.name} Study Plan composition`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/ru/prep", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "План подготовки", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("prep-plan-summary")).toContainText(
      "48/60 баллов",
    );
    await expect(page.getByTestId("prep-position-10")).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });

    await assertGeometry(page, viewport.name);
    await expect(page).toHaveScreenshot(`prep-plan-${viewport.name}.png`);
  });
}

async function assertGeometry(
  page: Page,
  viewport: (typeof viewports)[number]["name"],
) {
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing ${selector}`);
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      plan: rect('[data-testid="prep-plan"]'),
      summary: rect('[data-testid="prep-plan-summary"]'),
      summaryChildren: Array.from(
        document.querySelector('[data-testid="prep-plan-summary"]')?.children ??
          [],
      ).map((element) => {
        const box = element.getBoundingClientRect();
        return { x: Math.round(box.x), width: Math.round(box.width) };
      }),
      firstPosition: rect('[data-testid="prep-position-1"]'),
      firstPositionCells: [
        '[data-testid="prep-position-1"] [data-plan-cell="number"]',
        '[data-testid="prep-position-1"] [role="progressbar"]',
        '[data-testid="prep-position-1"] [data-plan-cell="arrow"]',
      ].map(rect),
      facts: rect('[data-testid="prep-plan-facts"]'),
      copyCollisions: Array.from(
        document.querySelectorAll<HTMLElement>('[data-plan-cell="copy"]'),
      ).flatMap((copy, index) => {
        if (window.innerWidth >= 1024) return [];
        const row = copy.closest("li");
        const bottom = row?.querySelector<HTMLElement>(
          '[data-plan-cell="bottom"]',
        );
        const lastLine = copy.lastElementChild;
        if (!(bottom && lastLine instanceof HTMLElement)) {
          return [`${index + 1}:missing`];
        }
        const textBottom = Math.round(lastLine.getBoundingClientRect().bottom);
        const bottomTop = Math.round(bottom.getBoundingClientRect().top);
        return textBottom > bottomTop
          ? [`${index + 1}:${textBottom}>${bottomTop}`]
          : [];
      }),
    };
  });

  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.copyCollisions).toEqual([]);
  if (viewport === "mobile") {
    expect(layout.plan.x).toBe(0);
    expect(layout.plan.width).toBe(390);
    expect(layout.summary).toMatchObject({
      x: 16,
      y: 148,
      width: 358,
      height: 252,
    });
    expect(layout.firstPosition).toMatchObject({
      x: 16,
      y: 476,
      width: 358,
      height: 124,
    });
    expect(layout.facts).toMatchObject({
      x: 16,
      y: 1730,
      width: 358,
      height: 210,
    });
    return;
  }
  if (viewport === "desktop") {
    expect(layout.summary).toMatchObject({
      x: 100,
      y: 178,
      width: 1240,
      height: 116,
    });
    expect(layout.firstPosition).toMatchObject({
      x: 100,
      y: 424,
      width: 1240,
      height: 66,
    });
    expect(layout.facts).toMatchObject({
      x: 100,
      y: 1100,
      width: 1240,
      height: 86,
    });
    expect(layout.summaryChildren.map(({ x }) => x)).toEqual([
      118, 466, 704, 942, 1132,
    ]);
    expect(layout.firstPositionCells.map(({ x }) => x)).toEqual([
      118, 1042, 1317,
    ]);
    return;
  }
  expect(layout.plan).toMatchObject({ x: 0, width: 1024 });
  expect(layout.summary).toMatchObject({ x: 32, width: 960, height: 116 });
  expect(layout.firstPosition).toMatchObject({
    x: 32,
    width: 960,
    height: 66,
  });
  expect(layout.facts).toMatchObject({ x: 32, width: 960, height: 86 });
}
