import type { Route } from "@playwright/test";
import { expect, test, type Page } from "./test";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const STORAGE_PREFIX = "do-indeksa-training-builder-v2:";
const LEGACY_STORAGE_KEY = "do-indeksa-training-builder";

test("explicit training drafts sync by owner across devices", async ({
  baseURL,
  browser,
  page,
}) => {
  const server = new TrainingDraftServer();
  const auth = await installMutableAuth(page, server, USER_A);
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
      legacyDraft: localDraft({
        quantities: { 1: 1 },
        difficulty: "advanced",
        onlyNew: false,
        shuffle: false,
        prioritizeMistakes: true,
      }),
    },
  );

  await page.goto("/en/training/new");
  await expectReadyWithTotal(page, "5");
  await expectDifficulty(page, "Balanced");
  await expect(
    page.getByRole("button", { name: "Account draft restored" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Remove one task from position 1" })
    .click();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("switch", { name: "Only new tasks" }).click();
  await saveAccountDraft(page);
  expect(server.read(USER_A)).toMatchObject({
    difficulty: "ADVANCED",
    onlyNew: false,
    quantities: [
      { examPosition: 1, quantity: 2 },
      { examPosition: 4, quantity: 2 },
    ],
    version: 1,
  });
  await expect(readDraft(page, ownerKey(USER_A))).resolves.toMatchObject({
    difficulty: "advanced",
    onlyNew: false,
    quantities: { 1: 2, 4: 2 },
  });

  const secondContext = await browser.newContext({ baseURL });
  try {
    const secondPage = await secondContext.newPage();
    await installMutableAuth(secondPage, server, USER_A);
    await secondPage.goto("/en/training/new");
    await expectReadyWithTotal(secondPage, "4");
    await expectDifficulty(secondPage, "Advanced");
    await expect(
      secondPage.getByRole("button", { name: "Account draft restored" }),
    ).toBeVisible();
    expect(await readDraft(secondPage, ownerKey(USER_A))).toMatchObject({
      difficulty: "advanced",
      quantities: { 1: 2, 4: 2 },
    });

    await secondPage
      .getByRole("button", { name: "Remove one task from position 1" })
      .click();
    await secondPage
      .getByRole("button", { name: "Foundation", exact: true })
      .click();
    await saveAccountDraft(secondPage);
    expect(server.read(USER_A)).toMatchObject({
      difficulty: "FOUNDATION",
      quantities: [
        { examPosition: 1, quantity: 1 },
        { examPosition: 4, quantity: 2 },
      ],
      version: 2,
    });
  } finally {
    await secondContext.close();
  }

  await page.getByRole("button", { name: "All positions" }).click();
  await expect(page.getByTestId("training-total")).toHaveText("10");
  await page.getByRole("button", { name: "Save to your account" }).click();
  await expect(
    page.getByRole("button", { name: "Review changes and save again" }),
  ).toBeVisible();
  await expectReadyWithTotal(page, "3");
  await expectDifficulty(page, "Foundation");
  expect(server.read(USER_A)).toMatchObject({ version: 2 });

  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove one task from position 4" })
    .click();
  await saveAccountDraft(page);
  expect(server.read(USER_A)).toMatchObject({
    difficulty: "ADVANCED",
    quantities: [
      { examPosition: 1, quantity: 1 },
      { examPosition: 4, quantity: 1 },
    ],
    version: 3,
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
  await writeDraft(
    page,
    ownerKey(USER_B),
    localDraft({
      quantities: { 1: 1, 4: 2 },
      difficulty: "foundation",
    }),
  );
  releaseUserB();

  await expectReadyWithTotal(page, "3");
  await expectDifficulty(page, "Foundation");
  expect(server.read(USER_B)).toMatchObject({
    difficulty: "FOUNDATION",
    quantities: [
      { examPosition: 1, quantity: 1 },
      { examPosition: 4, quantity: 2 },
    ],
    version: 1,
  });

  auth.useGuest();
  await page.reload();
  await expectReadyWithTotal(page, "5");
  await expectDifficulty(page, "Balanced");
  await page.getByRole("button", { name: "All positions" }).click();
  await expect(page.getByTestId("training-total")).toHaveText("10");
  await saveGuestDraft(page);
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
  expect(server.operationCount("SaveTrainingBuilderDraft", null)).toBe(0);

  await writeDraft(
    page,
    ownerKey(USER_A),
    localDraft({ quantities: { 1: 3 }, difficulty: "balanced" }),
  );
  auth.useUser(USER_A);
  await page.reload();
  await expectReadyWithTotal(page, "2");
  await expectDifficulty(page, "Advanced");
  expect(await readDraft(page, ownerKey(USER_A))).toMatchObject({
    quantities: { 1: 1, 4: 1 },
    difficulty: "advanced",
  });
  expect(await readDraft(page, ownerKey(USER_B))).toMatchObject({
    quantities: { 1: 1, 4: 2 },
    difficulty: "foundation",
  });
  expect(await readDraft(page, ownerKey(null))).toMatchObject({
    difficulty: "balanced",
  });
  expect(await readStorage(page, LEGACY_STORAGE_KEY)).not.toBeNull();
});

async function installMutableAuth(
  page: Page,
  server: TrainingDraftServer,
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

class TrainingDraftServer {
  private readonly records = new Map<string, ServerDraft>();
  private readonly operations: { name: string; owner: string | null }[] = [];

  async handle(route: Route, owner: string | null) {
    const call = route.request().postDataJSON() as GraphQLCall;
    const operationName = call.operationName ?? "";
    if (
      operationName !== "TrainingBuilderDraft" &&
      operationName !== "SaveTrainingBuilderDraft"
    ) {
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    this.operations.push({ name: operationName, owner });
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
    if (operationName === "TrainingBuilderDraft") {
      await route.fulfill({
        json: {
          data: { trainingBuilderDraft: this.records.get(owner) ?? null },
        },
      });
      return;
    }

    const input = call.variables?.input;
    if (!isRecord(input)) {
      await route.fulfill({ status: 400, body: "" });
      return;
    }
    const current = this.records.get(owner);
    const expectedCurrentVersion = current?.version ?? 0;
    if (input.expectedVersion !== expectedCurrentVersion) {
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
      typeof input.blueprintVersion !== "string" ||
      !Array.isArray(input.quantities) ||
      typeof input.difficulty !== "string" ||
      typeof input.onlyNew !== "boolean" ||
      typeof input.shuffle !== "boolean" ||
      typeof input.prioritizeMistakes !== "boolean"
    ) {
      await route.fulfill({ status: 400, body: "" });
      return;
    }
    const saved: ServerDraft = {
      blueprintVersion: input.blueprintVersion,
      quantities: input.quantities as ServerQuantity[],
      difficulty: input.difficulty,
      onlyNew: input.onlyNew,
      shuffle: input.shuffle,
      prioritizeMistakes: input.prioritizeMistakes,
      version: expectedCurrentVersion + 1,
    };
    this.records.set(owner, saved);
    await route.fulfill({
      json: { data: { saveTrainingBuilderDraft: saved } },
    });
  }

  read(owner: string): ServerDraft | null {
    return this.records.get(owner) ?? null;
  }

  operationCount(name: string, owner: string | null): number {
    return this.operations.filter(
      (operation) => operation.name === name && operation.owner === owner,
    ).length;
  }
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

async function saveAccountDraft(page: Page) {
  await page
    .getByRole("button", { name: "Save to your account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved to your account", exact: true }),
  ).toBeVisible();
}

async function saveGuestDraft(page: Page) {
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

async function writeDraft(page: Page, key: string, draft: LocalDraft) {
  await page.evaluate(
    ({ storageKey, value }) => {
      localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: key, value: draft },
  );
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

function localDraft(overrides: Partial<LocalDraft> = {}): LocalDraft {
  return {
    version: 1,
    blueprintVersion: "2026.1",
    quantities: { 1: 3, 4: 2 },
    difficulty: "balanced",
    onlyNew: true,
    shuffle: true,
    prioritizeMistakes: false,
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type LocalDraft = {
  version: 1;
  blueprintVersion: string;
  quantities: Record<number, number>;
  difficulty: "foundation" | "balanced" | "advanced";
  onlyNew: boolean;
  shuffle: boolean;
  prioritizeMistakes: boolean;
};

type ServerQuantity = {
  examPosition: number;
  quantity: number;
};

type ServerDraft = {
  blueprintVersion: string;
  quantities: ServerQuantity[];
  difficulty: string;
  onlyNew: boolean;
  shuffle: boolean;
  prioritizeMistakes: boolean;
  version: number;
};

type GraphQLCall = {
  operationName?: string;
  variables?: { input?: unknown };
};
