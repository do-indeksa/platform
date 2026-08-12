import { expect, test, type Page } from "@playwright/test";

const FIXED_TIME = new Date("2026-08-11T10:00:00.000Z");
const practiceId = "00000000-0000-4000-8000-000000000161";
const taskPath =
  "/tasks/logaritmi/log-001?returnTo=%2Ftasks&set=kb-001%2Ckv-001%2Clog-001%2Ceks-001%2Ctrig-001" +
  `&practice=${practiceId}`;

const viewports = [
  { name: "mobile", width: 390, height: 1455 },
  { name: "tablet", width: 1024, height: 1239 },
  { name: "desktop", width: 1440, height: 923 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, body: "" }),
  );
  await installWorkspaceSession(page);
});

for (const viewport of viewports) {
  test(`task workspace matches the ${viewport.name} Figma frame`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(taskPath, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", {
        name: "Vežbanje · Pozicija 3 · Logaritmi",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("3 od 5 zadataka", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("12:35", { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });

    await expect(page).toHaveScreenshot(
      `task-workspace-sr-${viewport.name}.png`,
    );
  });
}

async function installWorkspaceSession(page: Page) {
  await page.addInitScript(
    ({ practice, now }) => {
      const solvedDraft = (partCount: number) =>
        JSON.stringify({
          answers: Array<string>(partCount).fill(""),
          view: "correct",
          attempted: true,
          hintsShown: 0,
          solved: true,
          burned: false,
          dirty: false,
        });
      sessionStorage.setItem(
        `do-indeksa-task-draft-v1:${practice}:kb-001`,
        solvedDraft(4),
      );
      sessionStorage.setItem(
        `do-indeksa-task-draft-v1:${practice}:kv-001`,
        solvedDraft(1),
      );
      sessionStorage.setItem(
        `do-indeksa-practice-clock-v1:practice:${practice}`,
        String(now - 755_000),
      );
    },
    { practice: practiceId, now: FIXED_TIME.getTime() },
  );
}
