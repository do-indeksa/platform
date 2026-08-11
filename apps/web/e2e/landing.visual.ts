import { expect, test, type Page } from "@playwright/test";

const variants = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 880 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const variant of variants) {
  test.describe(`landing-${variant.name}`, () => {
    test.use({ viewport: variant });

    test("canonical SR guest landing", async ({ page }) => {
      await installGuestFixture(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", {
          name: "Spremi P1 za siguran upis",
          exact: true,
        }),
      ).toBeVisible();
      const ctaImage = page.locator("#start img");
      await ctaImage.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          ctaImage.evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        )
        .toBe(true);
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });

      await expect(page).toHaveScreenshot(`landing-sr-${variant.name}.png`, {
        fullPage: true,
      });
    });
  });
}

async function installGuestFixture(page: Page) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
}
