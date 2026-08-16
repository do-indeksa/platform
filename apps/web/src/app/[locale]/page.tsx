import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Landing } from "@/components/landing";
import { LandingHeader } from "@/components/landing-header";
import { hasAuthSessionHint } from "@/lib/auth-session-hint";
import { getTaskSummaries } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";
import { getFtnP1Programs } from "@/lib/guide";
import { buildLandingProgramGroups } from "@/lib/landing";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function Home() {
  const [tasks, blueprint, programGuide, hasSessionHint] = await Promise.all([
    getTaskSummaries(),
    getP1Blueprint(),
    getFtnP1Programs(),
    hasAuthSessionHint(),
  ]);

  return (
    <>
      <LandingHeader hasSessionHint={hasSessionHint} />
      <Landing
        exam={{
          taskCount: blueprint.taskCount,
          durationMinutes: blueprint.durationMinutes,
          maxPoints: blueprint.maxPoints,
        }}
        publishedTaskCount={tasks.length}
        programGroups={buildLandingProgramGroups(programGuide.programs)}
        programSourceDate={programGuide.retrievedAt}
      />
    </>
  );
}
