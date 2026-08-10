import type { Page } from "@playwright/test";

export type AnalyticsEvent = {
  event: string;
  data?: Record<string, string | number | boolean>;
};

export async function installAnalyticsSpy(page: Page) {
  await page.addInitScript(() => {
    const target = window as Window & {
      __doIndeksaAnalyticsEvents?: AnalyticsEvent[];
      umami?: {
        track: (
          event: string,
          data?: Record<string, string | number | boolean>,
        ) => void;
      };
    };
    target.__doIndeksaAnalyticsEvents = [];
    target.umami = {
      track: (event, data) => {
        target.__doIndeksaAnalyticsEvents?.push({ event, data });
      },
    };
  });
}

export async function analyticsEvents(page: Page): Promise<AnalyticsEvent[]> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __doIndeksaAnalyticsEvents?: AnalyticsEvent[];
        }
      ).__doIndeksaAnalyticsEvents ?? [],
  );
}
