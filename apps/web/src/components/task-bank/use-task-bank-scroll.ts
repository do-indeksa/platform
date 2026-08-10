"use client";

import { useCallback, useEffect } from "react";

const STORAGE_PREFIX = "do-indeksa-task-bank-scroll-v1:";

export function useTaskBankScroll() {
  useEffect(() => {
    const saved = consumeScroll(currentKey());
    if (saved === null) return;
    requestAnimationFrame(() => window.scrollTo({ top: saved }));
  }, []);

  return useCallback(() => {
    try {
      sessionStorage.setItem(currentKey(), String(window.scrollY));
    } catch {}
  }, []);
}

function currentKey(): string {
  return `${STORAGE_PREFIX}${window.location.pathname}${window.location.search}`;
}

function consumeScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    sessionStorage.removeItem(key);
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}
