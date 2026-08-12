import { expect, test } from "./test";

const variants = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 880 },
  { name: "desktop", width: 1440, height: 930 },
] as const;

const locales = [
  { locale: "sr", path: "/calculator", profileName: "Polina" },
  { locale: "en", path: "/en/calculator", profileName: "Polina" },
  { locale: "ru", path: "/ru/calculator", profileName: "Полина" },
] as const;

for (const locale of locales) {
  for (const variant of variants) {
    test.describe(`${locale.locale}-${variant.name}`, () => {
      test.use({ viewport: variant });

      test("canonical app header", async ({ page }) => {
        await page.route("**/api/v1/me", (route) =>
          route.fulfill({
            json: {
              id: "00000000-0000-4000-8000-000000000152",
              email: "polina@example.test",
              name: locale.profileName,
            },
          }),
        );
        await page.route("**/graphql", (route) =>
          route.fulfill({
            json: { data: { attempts: [], completedSimulationRuns: [] } },
          }),
        );

        await page.goto(locale.path, { waitUntil: "networkidle" });
        const header = page.getByTestId("site-header");
        await expect(header).toBeVisible();
        const indicator = header.getByTestId("app-header-indicator");
        await expect(indicator).toHaveAttribute(
          "src",
          "/app-header/indicator.svg",
        );
        await expect
          .poll(() =>
            indicator.evaluate(
              (element) =>
                element instanceof HTMLImageElement &&
                element.complete &&
                element.naturalWidth === 36 &&
                element.naturalHeight === 36,
            ),
          )
          .toBe(true);
        if (variant.name !== "mobile") {
          const profileName = header
            .locator("summary")
            .getByText(locale.profileName, { exact: true })
            .last();
          await expect(profileName).toBeVisible();
          await expect
            .poll(() =>
              profileName.evaluate(
                (element) => element.scrollWidth <= element.clientWidth,
              ),
            )
            .toBe(true);
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        await expect(header).toHaveScreenshot(
          `app-header-${locale.locale}-${variant.name}.png`,
        );
      });
    });
  }
}
