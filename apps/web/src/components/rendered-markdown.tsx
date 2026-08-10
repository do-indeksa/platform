"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type ZoomedImage = { src: string; alt: string };

export function RenderedMarkdown({
  html,
  openImageLabel,
  closeImageLabel,
  className = "",
}: {
  html: string;
  openImageLabel: string;
  closeImageLabel: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageTriggerRef = useRef<HTMLImageElement>(null);
  const [zoomed, setZoomed] = useState<ZoomedImage | null>(null);

  useEffect(() => {
    const images = containerRef.current?.querySelectorAll("img") ?? [];
    for (const image of images) {
      image.tabIndex = 0;
      image.role = "button";
      image.setAttribute(
        "aria-label",
        image.alt ? `${openImageLabel}: ${image.alt}` : openImageLabel,
      );
    }
  }, [html, openImageLabel]);

  useEffect(() => {
    if (!zoomed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(null);
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      imageTriggerRef.current?.focus();
    };
  }, [zoomed]);

  const openImage = (target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement)) return;
    imageTriggerRef.current = target;
    setZoomed({ src: target.currentSrc || target.src, alt: target.alt });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof HTMLImageElement)) return;
    event.preventDefault();
    openImage(event.target);
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`space-y-3 leading-relaxed [&_.katex]:inline-block [&_.katex]:max-w-full [&_.katex]:overflow-x-auto [&_.katex]:overflow-y-hidden [&_.katex]:align-middle [&_.katex-display]:block [&_.katex-display]:overflow-x-auto [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto ${className}`}
        onClick={(event) => openImage(event.target)}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={openImageLabel}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setZoomed(null);
          }}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label={closeImageLabel}
            onClick={() => setZoomed(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl text-zinc-900"
          >
            ×
          </button>
          {/* Content images have dynamic dimensions and may use authored origins. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed.src}
            alt={zoomed.alt}
            className="max-h-[calc(100dvh-2rem)] max-w-full object-contain"
          />
        </div>
      )}
    </>
  );
}
