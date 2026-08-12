"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function CabinetLoadingState() {
  const t = useTranslations("cabinet");

  return (
    <section
      data-testid="cabinet-loading"
      data-design-status="provisional"
      aria-labelledby="cabinet-loading-status"
      className="relative flex h-[642px] flex-col overflow-hidden rounded-[20px] bg-subtle p-6 md:h-[390px] md:flex-row md:p-8 lg:h-[322px]"
    >
      <p id="cabinet-loading-status" role="status" className="sr-only">
        {t("loading")}
      </p>

      <div
        data-testid="cabinet-loading-content"
        aria-hidden="true"
        className="flex min-w-0 flex-1 animate-pulse flex-col md:max-w-[340px] lg:max-w-[520px] xl:max-w-[560px]"
      >
        <span className="h-3 w-28 rounded bg-brand/15" />
        <span className="mt-4 h-9 w-[min(100%,340px)] rounded-lg bg-brand/15" />
        <span className="mt-3 h-4 w-[min(88%,420px)] rounded bg-brand/10" />
        <span className="mt-2 h-4 w-[min(62%,290px)] rounded bg-brand/10" />

        <div className="mt-7 flex items-center gap-4">
          <span className="h-1 flex-1 rounded-full bg-[#d9efe9]" />
          <span className="h-4 w-10 rounded bg-brand/10" />
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <span className="h-9 rounded-[10px] bg-surface" />
          <span className="h-9 rounded-[10px] bg-surface" />
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[180px_230px]">
          <span className="h-12 rounded-[11px] bg-brand/15 md:h-[46px]" />
          <span className="h-12 rounded-[11px] bg-surface md:h-[46px]" />
        </div>
      </div>

      <div
        data-testid="cabinet-loading-artwork"
        aria-hidden="true"
        className="mt-auto flex min-h-0 flex-1 items-end justify-center pt-5 md:absolute md:inset-y-0 md:right-4 md:w-[240px] md:items-center md:pt-0 lg:right-8 lg:w-[360px] xl:right-14 xl:w-[380px]"
      >
        <Image
          data-testid="cabinet-loading-image"
          src="/cabinet/preparation-book.png"
          alt=""
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 767px) 260px, 360px"
          className="h-auto w-[260px] object-contain opacity-70 md:w-[230px] lg:w-[330px] xl:w-[360px]"
        />
      </div>
    </section>
  );
}
