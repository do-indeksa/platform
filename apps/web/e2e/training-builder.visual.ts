import { expect, test } from "./test";

const viewports = [
  { name: "mobile", width: 390, height: 2380 },
  { name: "tablet", width: 1024, height: 1100 },
  { name: "desktop", width: 1440, height: 1100 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
});

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    test("training-builder-sr", async ({ page }) => {
      await page.goto("/training/new", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "Napravi vežbanje", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("training-total")).toHaveText("5");
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });

      await expect(page).toHaveScreenshot(
        `training-builder-sr-${viewport.name}.png`,
        { fullPage: true },
      );
    });
  });
}
