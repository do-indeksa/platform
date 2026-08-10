"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "@/i18n/navigation";
import type { components } from "@/lib/api/schema";
import { clearLocalAttempts, syncAttempts } from "@/lib/attempts-store";
import { clearProgressSync, syncProgress } from "@/lib/progress-sync";

type User = components["schemas"]["User"];

type UserContextValue = {
  user: User | null;
  loading: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  signingOut: false,
  signOut: async () => {},
});

export function useUser(): UserContextValue {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => setUser(data))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setUser(null);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    let current = true;
    void syncAttempts(user !== null).then(() => {
      if (current) return syncProgress(user?.id ?? null);
    });
    return () => {
      current = false;
    };
  }, [user]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (res.ok) {
        clearLocalAttempts();
        clearProgressSync();
        setUser(null);
        router.refresh();
      }
    } catch {
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  return (
    <UserContext
      value={{
        user: user ?? null,
        loading: user === undefined,
        signingOut,
        signOut,
      }}
    >
      {children}
    </UserContext>
  );
}
