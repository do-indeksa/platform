import type { Page } from "@playwright/test";
import {
  cloudFixture,
  installCloudRoutes,
  localDiagnosticState,
} from "./diagnostic-cloud-fixture";
import { installHistoryDegradedVisualFixture } from "./history-visual-fixture";
import { installCabinetAuthGate } from "./cabinet-loading-fixture";

const DIAGNOSTIC_STORAGE_KEY = "do-indeksa-diagnostic";

export async function installCabinetConflictVisualFixture(
  page: Page,
): Promise<void> {
  const fixture = await cloudFixture({
    completed: 0,
    draft: ["remote", "", "", ""],
    checkpointVersion: 2,
  });
  const local = localDiagnosticState(fixture, ["local", "", "", ""]);
  await page.addInitScript(
    ({ storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify({ version: 3, state }));
    },
    { storageKey: DIAGNOSTIC_STORAGE_KEY, state: local },
  );
  await installCloudRoutes(page, fixture, []);
}

export { installHistoryDegradedVisualFixture };
export { installCabinetAuthGate };
