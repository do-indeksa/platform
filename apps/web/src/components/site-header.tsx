import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HeaderUser } from "@/components/header-user";

const sections = [
  { href: "/prep", key: "prep" },
  { href: "/tasks", key: "tasks" },
  { href: "/simulation", key: "simulation" },
  { href: "/calculator", key: "calculator" },
] as const;

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/" className="font-bold">
          Do indeksa
        </Link>
        <nav className="flex gap-4 text-sm text-zinc-600">
          {sections.map(({ href, key }) => (
            <Link key={href} href={href} className="hover:text-zinc-900">
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <HeaderUser />
        </div>
      </div>
    </header>
  );
}
