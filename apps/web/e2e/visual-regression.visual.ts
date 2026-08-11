import { expect, test, type Page } from "@playwright/test";
import {
  completeSimulationRubricReview,
  diagnosticResultPath,
  prepareDiagnosticResult,
  prepareSimulationRubricReview,
  simulationRunPath,
} from "./visual-regression-fixture";

const FIXED_TIME = new Date("2026-08-11T10:00:00.000Z");

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const surfaces: readonly VisualSurface[] = [
  {
    name: "overview",
    path: "/cabinet",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Priprema za P1 iz matematike",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("daily-task")
          .getByRole("link", { name: "Reši zadatak", exact: true }),
      ).toBeVisible();
    },
  },
  {
    name: "task",
    path: "/tasks/kompleksni-brojevi/kb-001",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Zadatak kb-001", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Proveri", exact: true }),
      ).toBeVisible();
    },
  },
  {
    name: "plan-empty",
    path: "/prep",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Plan pripreme", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("next-action")).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Sinhronizuj završene odgovore",
          exact: true,
        }),
      ).toBeVisible();
    },
  },
  {
    name: "history-empty",
    path: "/history",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Istorija", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Još nema pokušaja zadataka",
          exact: true,
        }),
      ).toBeVisible();
    },
  },
  {
    name: "diagnostic-result",
    path: diagnosticResultPath,
    prepare: prepareDiagnosticResult,
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Tvoj početni nivo", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Sigurno", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Počni ovde", exact: true }),
      ).toBeVisible();
    },
  },
  {
    name: "rubric-review",
    path: simulationRunPath,
    prepare: prepareSimulationRubricReview,
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Kriterijumi bodovanja",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("group", {
          name: "Potkrepljeni bodovi za postupak",
          exact: true,
        }),
      ).toBeVisible();
    },
  },
  {
    name: "simulation-result",
    path: simulationRunPath,
    prepare: async (page) => {
      await prepareSimulationRubricReview(page);
      await completeSimulationRubricReview(page);
    },
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Tvoj rezultat", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Vežbaj slabe pozicije", exact: true }),
      ).toBeVisible();
    },
  },
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
});

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    for (const surface of surfaces) {
      test(surface.name, async ({ page }) => {
        await page.goto(surface.path, { waitUntil: "networkidle" });
        await surface.prepare?.(page);
        await surface.ready(page);
        await page.evaluate(async () => {
          await document.fonts.ready;
          window.scrollTo(0, 0);
        });

        await expect(page).toHaveScreenshot(
          `${surface.name}-${viewport.name}.png`,
        );
      });
    }
  });
}

type VisualSurface = {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
};
