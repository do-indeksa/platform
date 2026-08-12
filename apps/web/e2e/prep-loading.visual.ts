import { expect, test, type Page } from "@playwright/test";
import { installAuthBootstrapGate } from "./auth-bootstrap-fixture";

const viewports = [
  { name: "mobile", width: 390, height: 1988 },
  { name: "tablet", width: 1024, height: 1220 },
  { name: "desktop", width: 1440, height: 1220 },
] as const;

for (const viewport of viewports) {
  test.describe(`prep-loading-${viewport.name}`, () => {
    test.use({ viewport });

    test("preserves the Study Plan slots without claiming progress", async ({
      page,
    }) => {
      const releaseAuth = await installAuthBootstrapGate(page);
      await page.goto("/ru/prep", { waitUntil: "domcontentloaded" });

      const plan = page.getByTestId("prep-plan");
      await expect(plan).toHaveAttribute("data-state", "loading");
      await expect(plan).toHaveAttribute("aria-busy", "true");
      await expect(plan).toHaveAttribute("data-design-status", "provisional");
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await expect(page.getByTestId("next-action")).toHaveCount(0);
      await expect(page.getByTestId("prep-loading-position-10")).toContainText(
        "Комбинаторика",
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });

      await assertLoadingGeometry(page, viewport.name);
      await expect(page).toHaveScreenshot(`prep-loading-${viewport.name}.png`);

      releaseAuth();
      await expect(plan).toHaveAttribute("data-state", "ready");
    });
  });
}

async function assertLoadingGeometry(
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
      summary: rect('[data-testid="prep-loading-summary"]'),
      firstPosition: rect('[data-testid="prep-loading-position-1"]'),
      facts: rect('[data-testid="prep-loading-facts"]'),
    };
  });

  expect(layout.documentWidth).toBe(layout.viewportWidth);
  if (viewport === "mobile") {
    expect(layout.plan).toMatchObject({ x: 0, width: 390 });
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
    return;
  }
  expect(layout.plan).toMatchObject({ x: 0, width: 1024 });
  expect(layout.summary).toMatchObject({ x: 32, width: 960, height: 116 });
  expect(layout.firstPosition).toMatchObject({ x: 32, width: 960, height: 66 });
  expect(layout.facts).toMatchObject({ x: 32, width: 960, height: 86 });
}
