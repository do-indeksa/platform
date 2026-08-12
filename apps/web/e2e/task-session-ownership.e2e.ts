import { expect, test, type Page } from "./test";

const FIXED_TIME = new Date("2026-08-12T10:00:00.000Z");
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PRACTICE_ID = "00000000-0000-4000-8000-000000000186";
const TASK_URL =
  "/tasks/kvadratna-jednacina/kv-001?returnTo=%2Ftasks" +
  `&set=kb-001%2Ckv-001&practice=${PRACTICE_ID}`;

test("task drafts, rail status, and clock stay in their owner scope", async ({
  page,
}) => {
  await page.clock.setFixedTime(FIXED_TIME);
  page.on("dialog", (dialog) => void dialog.accept());
  const auth = await installMutableAuth(page);
  await page.addInitScript(
    ({ practiceId, currentDraft, railDraft, startedAt }) => {
      sessionStorage.setItem(
        `do-indeksa-task-draft-v1:${practiceId}:kv-001`,
        JSON.stringify(currentDraft),
      );
      sessionStorage.setItem(
        `do-indeksa-task-draft-v1:${practiceId}:kb-001`,
        JSON.stringify(railDraft),
      );
      sessionStorage.setItem(
        `do-indeksa-practice-clock-v1:practice:${practiceId}`,
        String(startedAt),
      );
    },
    {
      practiceId: PRACTICE_ID,
      currentDraft: taskDraft("LEGACY_UNOWNED"),
      railDraft: {
        ...taskDraft(""),
        answers: Array<string>(4).fill(""),
        view: "solution",
        attempted: true,
        burned: true,
        dirty: false,
      },
      startedAt: FIXED_TIME.getTime() - 300_000,
    },
  );

  await page.goto(TASK_URL);
  await expectReadyWithAnswer(page, "");
  await expect(page.getByLabel("Proteklo vreme")).toContainText("00:00");
  await expect(
    page.getByRole("link", { name: "Zadatak 1: Nije rešeno", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox").fill("SECRET_ACCOUNT_A");
  await page.evaluate(
    ({ clockKey, startedAt }) =>
      sessionStorage.setItem(clockKey, String(startedAt)),
    {
      clockKey: ownerClockKey(USER_A),
      startedAt: FIXED_TIME.getTime() - 300_000,
    },
  );
  await page.evaluate(
    ({ draftKey, draft }) => {
      sessionStorage.setItem(draftKey, JSON.stringify(draft));
    },
    {
      draftKey: ownerDraftKey(USER_A, "kb-001"),
      draft: {
        ...taskDraft(""),
        answers: Array<string>(4).fill(""),
        view: "solution",
        attempted: true,
        burned: true,
        dirty: false,
      },
    },
  );
  await page.reload();
  await expectReadyWithAnswer(page, "SECRET_ACCOUNT_A");
  await expect(page.getByLabel("Proteklo vreme")).toContainText("05:00");
  await expect(
    page.getByRole("link", { name: "Zadatak 1: Preskočeno", exact: true }),
  ).toBeVisible();

  const releaseUserB = auth.blockNext(USER_B);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-draft-state",
    "loading",
  );
  await expect(page.getByRole("textbox")).toHaveValue("");
  await expect(page.getByRole("textbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preskoči" })).toBeDisabled();
  expect(await readAnswer(page, ownerDraftKey(USER_B, "kv-001"))).toBeNull();
  expect(await readSession(page, ownerClockKey(USER_B))).toBeNull();
  releaseUserB();

  await expectReadyWithAnswer(page, "");
  await expect(page.getByLabel("Proteklo vreme")).toContainText("00:00");
  await expect(
    page.getByRole("link", { name: "Zadatak 1: Nije rešeno", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox").fill("SECRET_ACCOUNT_B");
  await expect
    .poll(() => readAnswer(page, ownerDraftKey(USER_B, "kv-001")))
    .toBe("SECRET_ACCOUNT_B");

  auth.useGuest();
  await page.reload();
  await expectReadyWithAnswer(page, "");
  await page.getByRole("textbox").fill("GUEST_DRAFT");
  await expect
    .poll(() => readAnswer(page, ownerDraftKey(null, "kv-001")))
    .toBe("GUEST_DRAFT");

  auth.useUser(USER_A);
  await page.reload();
  await expectReadyWithAnswer(page, "SECRET_ACCOUNT_A");
  await expect(page.getByLabel("Proteklo vreme")).toContainText("05:00");
  await expect(
    page.getByRole("link", { name: "Zadatak 1: Preskočeno", exact: true }),
  ).toBeVisible();
  expect(await readAnswer(page, ownerDraftKey(USER_B, "kv-001"))).toBe(
    "SECRET_ACCOUNT_B",
  );
  expect(await readAnswer(page, ownerDraftKey(null, "kv-001"))).toBe(
    "GUEST_DRAFT",
  );
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
  await page.route("**/graphql", (route) => route.fulfill({ status: 503 }));

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

async function expectReadyWithAnswer(page: Page, answer: string) {
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-draft-state",
    "ready",
  );
  await expect(page.getByRole("textbox")).toHaveValue(answer);
}

async function readAnswer(page: Page, key: string) {
  return page.evaluate((storageKey) => {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw).answers[0] : null;
  }, key);
}

async function readSession(page: Page, key: string) {
  return page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
}

function ownerDraftKey(ownerId: string | null, taskId: string): string {
  return `do-indeksa-task-draft-v2:${ownerScope(ownerId)}:practice:${PRACTICE_ID}:task:${taskId}`;
}

function ownerClockKey(ownerId: string | null): string {
  return `do-indeksa-practice-clock-v2:${ownerScope(ownerId)}:practice:${PRACTICE_ID}`;
}

function ownerScope(ownerId: string | null): string {
  return ownerId === null ? "guest" : `user:${ownerId}`;
}

function taskDraft(answer: string) {
  return {
    answers: [answer],
    view: "form",
    attempted: false,
    hintsShown: 0,
    solved: false,
    burned: false,
    dirty: answer.length > 0,
  };
}
