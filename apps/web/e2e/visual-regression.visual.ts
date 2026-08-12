import { expect, test, type Page } from "@playwright/test";
import {
  completeSimulationRubricReview,
  diagnosticResultPath,
  installCabinetVisualSession,
  prepareCabinetPopulated,
  prepareCabinetUnfinishedMock,
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
    name: "cabinet-empty",
    path: "/cabinet",
    beforeNavigate: installCabinetVisualSession,
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Priprema još nije započeta",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
        "data-state",
        "empty",
      );
    },
  },
  {
    name: "cabinet-populated",
    path: "/cabinet",
    beforeNavigate: installCabinetVisualSession,
    prepare: prepareCabinetPopulated,
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Pozicija 3 · Jednačine",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("cabinet-position-map")).toBeVisible();
      await expect(page.getByTestId("cabinet-latest-results")).toBeVisible();
    },
  },
  {
    name: "cabinet-unfinished",
    path: "/cabinet",
    beforeNavigate: installCabinetVisualSession,
    prepare: prepareCabinetUnfinishedMock,
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Nedovršen probni ispit",
          exact: true,
        }),
      ).toBeVisible();
    },
  },
  {
    name: "task",
    path: "/tasks/kompleksni-brojevi/kb-001",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: "Vežbanje · Pozicija 1 · Kompleksni brojevi",
          exact: true,
        }),
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
      await expect(page.getByTestId("prep-plan-summary")).toBeVisible();
      await expect(page.getByTestId("prep-position-10")).toBeVisible();
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
          name: "Istorija je prazna",
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
        await surface.beforeNavigate?.(page);
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

const figmaViewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const figmaCabinetStates = [
  {
    name: "empty",
    prepare: undefined,
    ready: async (page: Page) => {
      await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
        "data-state",
        "empty",
      );
    },
  },
  {
    name: "populated",
    prepare: prepareCabinetPopulated,
    ready: async (page: Page) => {
      await expect(page.getByTestId("cabinet-position-map")).toBeVisible();
    },
  },
  {
    name: "unfinished",
    prepare: prepareCabinetUnfinishedMock,
    ready: async (page: Page) => {
      await expect(
        page.getByRole("heading", {
          name: "Nedovršen probni ispit",
          exact: true,
        }),
      ).toBeVisible();
    },
  },
] as const;

for (const viewport of figmaViewports) {
  test.describe(`figma-${viewport.name}`, () => {
    test.use({ viewport });

    for (const state of figmaCabinetStates) {
      test(`cabinet-${state.name}`, async ({ page }) => {
        await installCabinetVisualSession(page);
        await page.goto("/cabinet", { waitUntil: "networkidle" });
        await state.prepare?.(page);
        await state.ready(page);
        await page.evaluate(async () => {
          await document.fonts.ready;
          window.scrollTo(0, 0);
        });
        await expect(page).toHaveScreenshot(
          `cabinet-${state.name}-${viewport.name}.png`,
          { fullPage: true },
        );
      });
    }
  });
}

type VisualSurface = {
  name: string;
  path: string;
  beforeNavigate?: (page: Page) => Promise<void>;
  prepare?: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
};
