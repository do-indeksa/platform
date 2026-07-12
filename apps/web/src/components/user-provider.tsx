"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { components } from "@/lib/api/schema";
import { syncAttempts } from "@/lib/attempts-store";

type User = components["schemas"]["User"];

type UserContextValue = {
  user: User | null;
  signingOut: boolean;
  signOut: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  signingOut: false,
  signOut: async () => {},
});

export function useUser(): UserContextValue {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => setUser(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void syncAttempts(user !== null);
  }, [user]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (res.ok) {
        setUser(null);
        router.refresh();
      }
    } catch {
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  return (
    <UserContext value={{ user, signingOut, signOut }}>{children}</UserContext>
  );
}
