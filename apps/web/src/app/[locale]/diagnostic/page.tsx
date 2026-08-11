import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DiagnosticEntry } from "@/components/diagnostic";
import { getDiagnosticCloudCatalog } from "@/lib/diagnostic-cloud-catalog";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { generateVariant } from "@/lib/variant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("diagnostic");
  return { title: t("title"), description: t("description") };
}

export default async function DiagnosticPage() {
  const [variant, diagnosticCatalog] = await Promise.all([
    generateVariant(),
    getDiagnosticCloudCatalog(),
  ]);
  const freshStartHref = diagnosticRunHref(
    "/diagnostic/new",
    crypto.randomUUID(),
    variant.tasks.map(({ task }) => task.id),
  );

  return (
    <DiagnosticEntry
      freshStartHref={freshStartHref}
      diagnosticCatalog={diagnosticCatalog}
    />
  );
}
