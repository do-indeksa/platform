import { expect, test, type Page } from "./test";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const STORAGE_PREFIX = "do-indeksa-training-builder-v2:";
const LEGACY_STORAGE_KEY = "do-indeksa-training-builder";

test("saved training drafts stay in their owner scope", async ({ page }) => {
  const auth = await installMutableAuth(page);
  await page.addInitScript(
    ({ legacyKey, legacyDraft, storagePrefix }) => {
      const originalGetItem = Storage.prototype.getItem;
      const testWindow = window as typeof window & {
        __trainingDraftReads: string[];
      };
      testWindow.__trainingDraftReads = [];
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (key.startsWith(storagePrefix)) {
          testWindow.__trainingDraftReads.push(key);
        }
        return originalGetItem.call(this, key);
      };
      localStorage.setItem(legacyKey, JSON.stringify(legacyDraft));
    },
    {
      legacyKey: LEGACY_STORAGE_KEY,
      storagePrefix: STORAGE_PREFIX,
      legacyDraft: {
        version: 1,
        blueprintVersion: "2026.1",
        quantities: { 1: 1 },
        difficulty: "advanced",
        onlyNew: false,
        shuffle: false,
        prioritizeMistakes: true,
      },
    },
  );

  await page.goto("/en/training/new");
  await expectReadyWithTotal(page, "5");
  await expectDifficulty(page, "Balanced");
  await expect(
    page.getByRole("button", { name: "Local draft restored" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("switch", { name: "Only new tasks" }).click();
  await saveDraft(page);
  await expect(readDraft(page, ownerKey(USER_A))).resolves.toMatchObject({
    difficulty: "advanced",
    onlyNew: false,
    quantities: { 1: 2, 4: 2 },
  });

  const releaseUserB = auth.blockNext(USER_B);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("training-builder")).toHaveAttribute(
    "data-draft-state",
    "loading",
  );
  await expect(page.getByTestId("training-total")).toHaveText("5");
  await expectDifficulty(page, "Balanced");
  await expectMutatingControlsDisabled(page);
  expect(await readDraftReads(page)).toEqual([]);
  expect(await readDraft(page, ownerKey(USER_B))).toBeNull();
  releaseUserB();

  await expectReadyWithTotal(page, "5");
  await expectDifficulty(page, "Balanced");
  await expect(
    page.getByRole("button", { name: "Local draft restored" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await saveDraft(page);
  await expect(readDraft(page, ownerKey(USER_B))).resolves.toMatchObject({
    difficulty: "foundation",
    quantities: { 1: 1, 4: 2 },
  });

  auth.useGuest();
  await page.reload();
  await expectReadyWithTotal(page, "5");
  await expectDifficulty(page, "Balanced");
  await page.getByRole("button", { name: "All positions" }).click();
  await expect(page.getByTestId("training-total")).toHaveText("10");
  await saveDraft(page);
  await expect(readDraft(page, ownerKey(null))).resolves.toMatchObject({
    difficulty: "balanced",
    quantities: {
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      5: 1,
      6: 1,
      7: 1,
      8: 1,
      9: 1,
      10: 1,
    },
  });

  auth.useUser(USER_A);
  await page.reload();
  await expectReadyWithTotal(page, "4");
  await expectDifficulty(page, "Advanced");
  await expect(
    page.getByRole("switch", { name: "Only new tasks" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("button", { name: "Local draft restored" }),
  ).toBeVisible();
  expect(await readDraft(page, ownerKey(USER_B))).toMatchObject({
    difficulty: "foundation",
    quantities: { 1: 1, 4: 2 },
  });
  expect(await readDraft(page, ownerKey(null))).toMatchObject({
    difficulty: "balanced",
  });
  expect(await readStorage(page, LEGACY_STORAGE_KEY)).not.toBeNull();
});

async function installMutableAuth(page: Page) {
  let owner: string | null = USER_A;
  let nextGate: Promise<void> | null = null;

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
  await page.route("**/graphql", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );

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
  };
}

async function expectReadyWithTotal(page: Page, total: string) {
  await expect(page.getByTestId("training-builder")).toHaveAttribute(
    "data-draft-state",
    "ready",
  );
  await expect(page.getByTestId("training-total")).toHaveText(total);
}

async function expectDifficulty(page: Page, name: string) {
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function expectMutatingControlsDisabled(page: Page) {
  await expect(
    page.getByRole("button", { name: "Save local draft" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save on this device" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "All positions" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Select position 1" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove one task from position 1" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Advanced", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "Only new tasks" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: /^(Preparing your history|Start 5-task practice)/,
    }),
  ).toBeDisabled();
}

async function saveDraft(page: Page) {
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
}

async function readDraft(page: Page, key: string) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

async function readStorage(page: Page, key: string) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function readDraftReads(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __trainingDraftReads: string[];
        }
      ).__trainingDraftReads,
  );
}

function ownerKey(ownerId: string | null): string {
  return `${STORAGE_PREFIX}${ownerId === null ? "guest" : `user:${ownerId}`}`;
}
