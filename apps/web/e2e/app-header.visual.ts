import { expect, test, type Locator } from "./test";
import {
  runId as diagnosticRunId,
  taskIds as diagnosticTaskIds,
} from "./diagnostic-cloud-fixture";
import { simulationRunId, simulationTaskIds } from "./simulation-cloud-fixture";

const variants = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 880 },
  { name: "desktop", width: 1440, height: 930 },
] as const;

const locales = [
  { locale: "sr", prefix: "", profileName: "Polina" },
  { locale: "en", prefix: "/en", profileName: "Polina" },
  { locale: "ru", prefix: "/ru", profileName: "Полина" },
] as const;

const diagnosticResultPath = `/diagnostic/result?run=${diagnosticRunId}&set=${diagnosticTaskIds.join("%2C")}`;
const simulationResultPath = `/simulation/result?run=${simulationRunId}&version=2026.1&set=${simulationTaskIds.join("%2C")}`;

const canonicalApplicationPaths = [
  "/cabinet",
  "/calculator",
  "/diagnostic",
  diagnosticResultPath,
  "/exams",
  "/exams/ftn-p3",
  "/faculties/ftn",
  "/history",
  "/history/tasks/kompleksni-brojevi/kb-001",
  "/prep",
  "/simulation",
  simulationResultPath,
  "/training/new",
] as const;

const taskApplicationPaths = [
  "/tasks",
  "/tasks/kompleksni-brojevi",
  "/tasks/kompleksni-brojevi/kb-001",
] as const;

const immersivePaths = ["/diagnostic/new", "/simulation/new"] as const;

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

        for (const path of canonicalApplicationPaths) {
          await test.step(path, async () => {
            await page.goto(`${locale.prefix}${path}`, {
              waitUntil: "networkidle",
            });
            const header = page.getByTestId("site-header");
            await expectCanonicalHeader(
              header,
              locale.profileName,
              variant.name,
            );
            await expect(header).toHaveScreenshot(
              `app-header-${locale.locale}-${variant.name}.png`,
            );
          });
        }

        for (const path of taskApplicationPaths) {
          await test.step(path, async () => {
            await page.goto(`${locale.prefix}${path}`, {
              waitUntil: "networkidle",
            });
            const taskHeader = page.getByTestId("site-header");
            await expectCanonicalHeader(
              taskHeader,
              locale.profileName,
              variant.name,
            );
            await expect(taskHeader).toHaveScreenshot(
              variant.name === "mobile"
                ? `app-header-${locale.locale}-${variant.name}.png`
                : `app-header-${locale.locale}-tasks-${variant.name}.png`,
            );
          });
        }

        for (const path of immersivePaths) {
          await test.step(path, async () => {
            await page.goto(`${locale.prefix}${path}`);
            await expect(page.getByTestId("site-header")).toHaveCount(0);
          });
        }
      });
    });
  }
}

async function expectCanonicalHeader(
  header: Locator,
  profileName: string,
  variant: (typeof variants)[number]["name"],
) {
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute("data-placement", "application");
  const indicator = header.getByTestId("app-header-indicator");
  await expect(indicator).toHaveAttribute("src", "/app-header/indicator.svg");
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
  if (variant !== "mobile") {
    const name = header
      .locator("summary")
      .getByText(profileName, { exact: true })
      .last();
    await expect(name).toBeVisible();
    await expect
      .poll(() =>
        name.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
  }
  await header.page().evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const variant of variants) {
  test.describe(`sr-landing-${variant.name}`, () => {
    test.use({ viewport: variant });

    test("authenticated landing app header", async ({ context, page }) => {
      await context.addCookies([
        {
          name: "di_session",
          value: "opaque-session-hint",
          url: "http://localhost:3100",
        },
      ]);
      await page.route("**/api/v1/me", (route) =>
        route.fulfill({
          json: {
            id: "00000000-0000-4000-8000-000000000152",
            email: "polina@example.test",
            name: "Polina",
          },
        }),
      );
      await page.route("**/graphql", (route) =>
        route.fulfill({
          json: { data: { attempts: [], completedSimulationRuns: [] } },
        }),
      );

      await page.goto("/", { waitUntil: "networkidle" });
      const header = page.getByTestId("site-header");
      await expect(header).toBeVisible();
      await expect(header).toHaveAttribute("data-placement", "landing");
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      await expect(header).toHaveScreenshot(
        `app-header-sr-landing-${variant.name}.png`,
      );
    });
  });
}
