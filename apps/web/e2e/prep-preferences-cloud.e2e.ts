import type { Route } from "@playwright/test";
import { expect, test, type Page } from "./test";

const USER_ID = "39ec4650-762d-437f-9917-c31ab167cb99";
const STORAGE_KEY = `do-indeksa-prep-settings-v2:user:${USER_ID}`;

test("a fresh device restores the same server-owned plan preferences", async ({
  browser,
  page,
}) => {
  const cloud = prepPreferencesCloud(serverRecord(1, 42, "2028-07-01"));
  await installSignedInPrepPage(page, cloud);
  await page.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          state: { goalPoints: 35, examDate: "2027-06-28" },
        }),
      ),
    { key: STORAGE_KEY },
  );

  await page.goto("/en/prep");
  await expectReadyWithGoal(page, "42/60 points");
  await expect(readLocalPreferences(page)).resolves.toEqual({
    version: 1,
    state: { goalPoints: 42, examDate: "2028-07-01" },
  });

  await savePreferences(page, "50", "2029-08-02");
  await expect.poll(() => cloud.record()?.goalPoints).toBe(50);
  await expect.poll(() => cloud.record()?.version).toBe(2);

  const freshContext = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  try {
    const freshPage = await freshContext.newPage();
    await installSignedInPrepPage(freshPage, cloud);
    await freshPage.goto("/en/prep");
    await expectReadyWithGoal(freshPage, "50/60 points");
    await expect(readLocalPreferences(freshPage)).resolves.toEqual({
      version: 1,
      state: { goalPoints: 50, examDate: "2029-08-02" },
    });
  } finally {
    await freshContext.close();
  }
});

test("an empty server is seeded once from this account cache", async ({
  page,
}) => {
  const cloud = prepPreferencesCloud(null);
  await installSignedInPrepPage(page, cloud);
  await page.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          state: { goalPoints: 42, examDate: "2028-07-01" },
        }),
      ),
    { key: STORAGE_KEY },
  );

  await page.goto("/en/prep");
  await expectReadyWithGoal(page, "42/60 points");
  await expect.poll(() => cloud.record()?.version).toBe(1);
  expect(cloud.saveCalls()).toEqual([
    { expectedVersion: 0, goalPoints: 42, examDate: "2028-07-01" },
  ]);

  await page.reload();
  await expectReadyWithGoal(page, "42/60 points");
  expect(cloud.saveCalls()).toHaveLength(1);
});

test("a stale write conflict replaces optimistic local data with the server winner", async ({
  page,
}) => {
  const cloud = prepPreferencesCloud(serverRecord(1, 42, "2028-07-01"));
  cloud.conflictNextSaveWith(serverRecord(2, 50, "2029-08-02"));
  await installSignedInPrepPage(page, cloud);

  await page.goto("/en/prep");
  await expectReadyWithGoal(page, "42/60 points");
  await submitPreferences(page, "35", "2027-06-28");

  await expectReadyWithGoal(page, "50/60 points");
  await expect(readLocalPreferences(page)).resolves.toEqual({
    version: 1,
    state: { goalPoints: 50, examDate: "2029-08-02" },
  });
  expect(cloud.queryCalls()).toBe(2);
});

type ServerRecord = {
  goalPoints: number;
  examDate: string;
  version: number;
  updatedAt: string;
};

type SaveInput = {
  expectedVersion: number;
  goalPoints: number;
  examDate: string;
};

function prepPreferencesCloud(initial: ServerRecord | null) {
  let stored = initial;
  let conflictWinner: ServerRecord | null = null;
  let reads = 0;
  const writes: SaveInput[] = [];

  return {
    async fulfill(page: Page) {
      await page.route("**/graphql", async (route) => {
        const body = route.request().postDataJSON() as {
          operationName?: string;
          variables?: { input?: SaveInput };
        };
        if (body.operationName === "PrepPreferences") {
          reads += 1;
          await route.fulfill({ json: { data: { prepPreferences: stored } } });
          return;
        }
        if (body.operationName === "SavePrepPreferences") {
          const input = body.variables?.input;
          if (input === undefined) {
            await route.fulfill({ status: 400, body: "" });
            return;
          }
          writes.push(input);
          if (conflictWinner !== null) {
            stored = conflictWinner;
            conflictWinner = null;
            await fulfillConflict(route);
            return;
          }
          if (
            (stored === null && input.expectedVersion !== 0) ||
            (stored !== null && input.expectedVersion !== stored.version)
          ) {
            await fulfillConflict(route);
            return;
          }
          stored = serverRecord(
            (stored?.version ?? 0) + 1,
            input.goalPoints,
            input.examDate,
          );
          await route.fulfill({
            json: { data: { savePrepPreferences: stored } },
          });
          return;
        }
        await route.fulfill({ status: 503, body: "" });
      });
    },
    record: () => stored,
    queryCalls: () => reads,
    saveCalls: () => [...writes],
    conflictNextSaveWith(winner: ServerRecord) {
      conflictWinner = winner;
    },
  };
}

async function installSignedInPrepPage(
  page: Page,
  cloud: ReturnType<typeof prepPreferencesCloud>,
) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: USER_ID,
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await cloud.fulfill(page);
}

async function expectReadyWithGoal(page: Page, goal: string) {
  await expect(page.getByTestId("prep-plan")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.getByTestId("prep-plan-summary")).toContainText(goal);
}

async function savePreferences(page: Page, goal: string, examDate: string) {
  await submitPreferences(page, goal, examDate);
  await expect(
    page.getByText(`${goal}/60 points`, { exact: true }),
  ).toBeVisible();
}

async function submitPreferences(page: Page, goal: string, examDate: string) {
  await page.getByRole("button", { name: "Edit plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Goal and exam date" });
  await dialog.getByLabel("Target score").fill(goal);
  await dialog.getByLabel("Exam date").fill(examDate);
  await dialog.getByRole("button", { name: "Save" }).click();
}

async function readLocalPreferences(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, STORAGE_KEY);
}

function serverRecord(
  version: number,
  goalPoints: number,
  examDate: string,
): ServerRecord {
  return {
    goalPoints,
    examDate,
    version,
    updatedAt: "2026-08-16T12:00:00Z",
  };
}

async function fulfillConflict(route: Route) {
  await route.fulfill({
    json: {
      data: null,
      errors: [{ message: "write conflict", extensions: { code: "CONFLICT" } }],
    },
  });
}
