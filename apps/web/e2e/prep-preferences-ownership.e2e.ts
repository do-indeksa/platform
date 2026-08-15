import { expect, test, type Page } from "./test";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const STORAGE_PREFIX = "do-indeksa-prep-settings-v2:";
const LEGACY_STORAGE_KEY = "do-indeksa-prep-settings";

test("Study Plan preferences stay in their owner scope", async ({ page }) => {
  const auth = await installMutableAuth(page);
  await page.addInitScript(
    ({ legacyKey, legacyPreferences, storagePrefix }) => {
      const originalGetItem = Storage.prototype.getItem;
      const testWindow = window as typeof window & {
        __prepPreferenceReads: string[];
      };
      testWindow.__prepPreferenceReads = [];
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (key.startsWith(storagePrefix)) {
          testWindow.__prepPreferenceReads.push(key);
        }
        return originalGetItem.call(this, key);
      };
      localStorage.setItem(legacyKey, JSON.stringify(legacyPreferences));
    },
    {
      legacyKey: LEGACY_STORAGE_KEY,
      storagePrefix: STORAGE_PREFIX,
      legacyPreferences: {
        version: 1,
        state: { goalPoints: 59, examDate: "2026-12-19" },
      },
    },
  );

  await page.goto("/en/prep");
  await expectReadyWithGoal(page, "Not set");
  await expect(page.getByText("59/60 points", { exact: true })).toHaveCount(0);
  await savePreferences(page, "42", "2026-10-11");
  await expect(readPreferences(page, ownerKey(USER_A))).resolves.toEqual({
    version: 1,
    state: { goalPoints: 42, examDate: "2026-10-11" },
  });

  const releaseUserB = auth.blockNext(USER_B);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("prep-plan")).toHaveAttribute(
    "data-state",
    "loading",
  );
  await expect(page.getByTestId("prep-plan-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit plan" })).toHaveCount(0);
  expect(await readPreferenceReads(page)).toEqual([]);
  expect(await readPreferences(page, ownerKey(USER_B))).toBeNull();
  releaseUserB();

  await expectReadyWithGoal(page, "Not set");
  await expect(page.getByText("42/60 points", { exact: true })).toHaveCount(0);
  await savePreferences(page, "35", "2026-11-12");
  await expect(readPreferences(page, ownerKey(USER_B))).resolves.toEqual({
    version: 1,
    state: { goalPoints: 35, examDate: "2026-11-12" },
  });
  await expect.poll(() => auth.prepOperationCount()).toBeGreaterThanOrEqual(4);

  const prepCallsBeforeGuest = auth.prepOperationCount();
  auth.useGuest();
  await page.reload();
  await expectReadyWithGoal(page, "Not set");
  await savePreferences(page, "50", "2026-12-13");
  await expect(readPreferences(page, ownerKey(null))).resolves.toEqual({
    version: 1,
    state: { goalPoints: 50, examDate: "2026-12-13" },
  });
  expect(auth.prepOperationCount()).toBe(prepCallsBeforeGuest);

  auth.useUser(USER_A);
  await page.reload();
  await expectReadyWithGoal(page, "42/60 points");
  expect(await readPreferences(page, ownerKey(USER_B))).toEqual({
    version: 1,
    state: { goalPoints: 35, examDate: "2026-11-12" },
  });
  expect(await readPreferences(page, ownerKey(null))).toEqual({
    version: 1,
    state: { goalPoints: 50, examDate: "2026-12-13" },
  });
  expect(await readStorage(page, LEGACY_STORAGE_KEY)).not.toBeNull();
});

async function installMutableAuth(page: Page) {
  let owner: string | null = USER_A;
  let nextGate: Promise<void> | null = null;
  const prepOperations: string[] = [];

  await page.route("**/api/v1/me", async (route) => {
    const gate = nextGate;
    nextGate = null;
    if (gate) await gate;
    if (owner === null) {
      await route.fulfill({ status: 401, body: "" });
      return;
    }
    await route.fulfill({
      json: {
        id: owner,
        email: `${owner === USER_A ? "account-a" : "account-b"}@example.test`,
        name: owner === USER_A ? "Account A" : "Account B",
      },
    });
  });
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string };
    if (
      body.operationName === "PrepPreferences" ||
      body.operationName === "SavePrepPreferences"
    ) {
      prepOperations.push(body.operationName);
    }
    await route.fulfill({ status: 503, body: "" });
  });

  return {
    blockNext(nextOwner: string) {
      owner = nextOwner;
      let release = () => {};
      nextGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    useGuest() {
      owner = null;
    },
    useUser(nextOwner: string) {
      owner = nextOwner;
    },
    prepOperationCount() {
      return prepOperations.length;
    },
  };
}

async function expectReadyWithGoal(page: Page, goal: string) {
  await expect(page.getByTestId("prep-plan")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.getByTestId("prep-plan-summary")).toContainText(goal);
}

async function savePreferences(page: Page, goal: string, examDate: string) {
  await page.getByRole("button", { name: "Edit plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Goal and exam date" });
  await dialog.getByLabel("Target score").fill(goal);
  await dialog.getByLabel("Exam date").fill(examDate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText(`${goal}/60 points`, { exact: true }),
  ).toBeVisible();
}

async function readPreferences(page: Page, key: string) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

async function readStorage(page: Page, key: string) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function readPreferenceReads(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __prepPreferenceReads: string[];
        }
      ).__prepPreferenceReads,
  );
}

function ownerKey(ownerId: string | null): string {
  return `${STORAGE_PREFIX}${ownerId === null ? "guest" : `user:${ownerId}`}`;
}
