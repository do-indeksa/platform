import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FacultyGuide } from "@/components/faculty-guide";
import { getFtnCatalog } from "@/lib/guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("facultyGuide");
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function FtnFacultyPage() {
  return <FacultyGuide catalog={await getFtnCatalog()} />;
}
