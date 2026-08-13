import type { Route } from "@playwright/test";
import { expect, test, type Page } from "./test";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const STORAGE_PREFIX = "do-indeksa-prep-settings-v2:";
const LEGACY_STORAGE_KEY = "do-indeksa-prep-settings";
const DATE_A = "2099-10-11";
const DATE_A_REMOTE = "2099-11-12";
const DATE_A_FINAL = "2099-12-13";
const DATE_B = "2098-08-14";
const DATE_GUEST = "2097-07-15";

test("Study Plan preferences sync by owner across devices", async ({
  baseURL,
  browser,
  page,
}) => {
  const server = new PrepPreferenceServer();
  const auth = await installMutableAuth(page, server, USER_A);
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
        state: { goalPoints: 59, examDate: "2096-12-19" },
      },
    },
  );

  await page.goto("/en/prep");
  await expectReadyWithGoal(page, "Not set");
  await expect(page.getByText("59/60 points", { exact: true })).toHaveCount(0);
  await savePreferences(page, "42", DATE_A);
  expect(server.read(USER_A)).toEqual({
    goalPoints: 42,
    examDate: DATE_A,
    version: 1,
  });
  await expect(readPreferences(page, ownerKey(USER_A))).resolves.toEqual({
    version: 1,
    state: { goalPoints: 42, examDate: DATE_A },
  });

  const secondContext = await browser.newContext({ baseURL });
  try {
    const secondPage = await secondContext.newPage();
    await installMutableAuth(secondPage, server, USER_A);
    await secondPage.goto("/en/prep");
    await expectReadyWithGoal(secondPage, "42/60 points");
    await expect(
      readPreferences(secondPage, ownerKey(USER_A)),
    ).resolves.toEqual({
      version: 1,
      state: { goalPoints: 42, examDate: DATE_A },
    });
    await savePreferences(secondPage, "47", DATE_A_REMOTE);
    expect(server.read(USER_A)).toEqual({
      goalPoints: 47,
      examDate: DATE_A_REMOTE,
      version: 2,
    });
  } finally {
    await secondContext.close();
  }

  await page.getByRole("button", { name: "Edit plan" }).click();
  const staleDialog = page.getByRole("dialog", {
    name: "Goal and exam date",
  });
  await staleDialog.getByLabel("Target score").fill("45");
  await staleDialog.getByLabel("Exam date").fill(DATE_A_FINAL);
  await staleDialog.getByRole("button", { name: "Save" }).click();
  await expect(
    staleDialog.getByText(
      "This plan changed on another device. Review the current values and save again.",
    ),
  ).toBeVisible();
  await expect(staleDialog.getByLabel("Target score")).toHaveValue("47");
  await expect(staleDialog.getByLabel("Exam date")).toHaveValue(DATE_A_REMOTE);
  expect(server.read(USER_A)).toEqual({
    goalPoints: 47,
    examDate: DATE_A_REMOTE,
    version: 2,
  });

  await staleDialog.getByLabel("Target score").fill("45");
  await staleDialog.getByLabel("Exam date").fill(DATE_A_FINAL);
  await staleDialog.getByRole("button", { name: "Save" }).click();
  await expect(staleDialog).toBeHidden();
  await expectReadyWithGoal(page, "45/60 points");
  expect(server.read(USER_A)).toEqual({
    goalPoints: 45,
    examDate: DATE_A_FINAL,
    version: 3,
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
  await writePreferences(page, ownerKey(USER_B), {
    goalPoints: 35,
    examDate: DATE_B,
  });
  releaseUserB();

  await expectReadyWithGoal(page, "35/60 points");
  await expect(page.getByText("45/60 points", { exact: true })).toHaveCount(0);
  expect(server.read(USER_B)).toEqual({
    goalPoints: 35,
    examDate: DATE_B,
    version: 1,
  });

  auth.useGuest();
  await page.reload();
  await expectReadyWithGoal(page, "Not set");
  await savePreferences(page, "50", DATE_GUEST);
  await expect(readPreferences(page, ownerKey(null))).resolves.toEqual({
    version: 1,
    state: { goalPoints: 50, examDate: DATE_GUEST },
  });

  await writePreferences(page, ownerKey(USER_A), {
    goalPoints: 58,
    examDate: "2095-06-16",
  });
  auth.useUser(USER_A);
  await page.reload();
  await expectReadyWithGoal(page, "45/60 points");
  expect(await readPreferences(page, ownerKey(USER_A))).toEqual({
    version: 1,
    state: { goalPoints: 45, examDate: DATE_A_FINAL },
  });
  expect(await readPreferences(page, ownerKey(USER_B))).toEqual({
    version: 1,
    state: { goalPoints: 35, examDate: DATE_B },
  });
  expect(await readPreferences(page, ownerKey(null))).toEqual({
    version: 1,
    state: { goalPoints: 50, examDate: DATE_GUEST },
  });
  expect(await readStorage(page, LEGACY_STORAGE_KEY)).not.toBeNull();
  expect(server.operationCount("SavePrepPreferences", null)).toBe(0);
});

async function installMutableAuth(
  page: Page,
  server: PrepPreferenceServer,
  initialOwner: string | null,
) {
  let activeOwner = initialOwner;
  let nextOwner = initialOwner;
  let nextGate: Promise<void> | null = null;

  await page.route("**/api/v1/me", async (route) => {
    const responseOwner = nextOwner;
    const gate = nextGate;
    nextGate = null;
    if (gate) await gate;
    activeOwner = responseOwner;
    if (responseOwner === null) {
      await route.fulfill({ status: 401, body: "" });
      return;
    }
    await route.fulfill({
      json: {
        id: responseOwner,
        email: `${responseOwner === USER_A ? "account-a" : "account-b"}@example.test`,
        name: responseOwner === USER_A ? "Account A" : "Account B",
      },
    });
  });
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", (route) => server.handle(route, activeOwner));

  return {
    blockNext(owner: string) {
      nextOwner = owner;
      let release = () => {};
      nextGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    useGuest() {
      nextOwner = null;
    },
    useUser(owner: string) {
      nextOwner = owner;
    },
  };
}

class PrepPreferenceServer {
  private readonly records = new Map<string, ServerPreferences>();
  private readonly operations: { name: string; owner: string | null }[] = [];

  async handle(route: Route, owner: string | null) {
    const call = route.request().postDataJSON() as GraphQLCall;
    const operationName = call.operationName ?? "";
    this.operations.push({ name: operationName, owner });
    if (
      operationName !== "PrepPreferences" &&
      operationName !== "SavePrepPreferences"
    ) {
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    if (owner === null) {
      await route.fulfill({
        json: {
          data: null,
          errors: [
            {
              message: "authentication required",
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        },
      });
      return;
    }
    if (operationName === "PrepPreferences") {
      await route.fulfill({
        json: { data: { prepPreferences: this.records.get(owner) ?? null } },
      });
      return;
    }

    const input = call.variables?.input;
    if (!isRecord(input)) {
      await route.fulfill({ status: 400, body: "" });
      return;
    }
    const current = this.records.get(owner);
    const expectedVersion = input.expectedVersion;
    const expectedCurrentVersion = current?.version ?? 0;
    if (expectedVersion !== expectedCurrentVersion) {
      await route.fulfill({
        json: {
          data: null,
          errors: [
            {
              message: "write conflicts with existing data",
              extensions: { code: "CONFLICT" },
            },
          ],
        },
      });
      return;
    }
    if (
      typeof input.goalPoints !== "number" ||
      typeof input.examDate !== "string"
    ) {
      await route.fulfill({ status: 400, body: "" });
      return;
    }
    const saved: ServerPreferences = {
      goalPoints: input.goalPoints,
      examDate: input.examDate,
      version: expectedCurrentVersion + 1,
    };
    this.records.set(owner, saved);
    await route.fulfill({
      json: { data: { savePrepPreferences: saved } },
    });
  }

  read(owner: string): ServerPreferences | null {
    return this.records.get(owner) ?? null;
  }

  operationCount(name: string, owner: string | null): number {
    return this.operations.filter(
      (operation) => operation.name === name && operation.owner === owner,
    ).length;
  }
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
  await expect(dialog).toBeHidden();
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

async function writePreferences(
  page: Page,
  key: string,
  preferences: { goalPoints: number; examDate: string },
) {
  await page.evaluate(
    ({ storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, state }));
    },
    { storageKey: key, state: preferences },
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type GraphQLCall = {
  operationName?: string;
  variables?: { input?: unknown };
};

type ServerPreferences = {
  goalPoints: number;
  examDate: string;
  version: number;
};
