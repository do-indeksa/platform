"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AuthBootstrapError } from "@/components/auth-bootstrap-error";
import { useRouter } from "@/i18n/navigation";
import type { components } from "@/lib/api/schema";
import { fetchCurrentUser } from "@/lib/auth-bootstrap";
import { clearLocalAttempts, syncAttempts } from "@/lib/attempts-store";
import { prepareHistoryRuns, syncHistoryRuns } from "@/lib/history-run-store";
import { syncDiagnosticOwner } from "@/lib/diagnostic-store";
import { syncPracticeRuntimeOwner } from "@/lib/practice-runtime-store";
import { syncPracticeRuntimeRuns } from "@/lib/practice-runtime-sync";
import { clearProgressSync, syncProgress } from "@/lib/progress-sync";
import {
  prepareSimulationArchive,
  syncSimulationArchive,
} from "@/lib/simulation-archive-store";
import { syncSimulationOwner } from "@/lib/simulation-store";
import { syncTaskHistory } from "@/lib/task-history-store";

type User = components["schemas"]["User"];

type AuthState =
  { status: "loading" | "error" } | { status: "ready"; user: User | null };

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
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrentUser(controller.signal)
      .then((user) => {
        prepareLocalOwner(user?.id ?? null);
        setAuth({ status: "ready", user });
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setAuth({ status: "error" });
        }
      });
    return () => controller.abort();
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (auth.status !== "ready") return;
    const user = auth.user;
    let current = true;
    const practiceController = new AbortController();
    const sync = async () => {
      try {
        await syncAttempts(user?.id ?? null);
      } catch {}
      if (!current) return;
      try {
        await syncProgress(user?.id ?? null);
      } catch {}
      if (current) {
        await syncHistoryRuns(user?.id ?? null, {
          isCurrentOwner: () => current,
        });
      }
      if (!current) return;
      if (current) await syncSimulationArchive(user?.id ?? null);
    };
    const resumePractice = () => {
      if (current && user !== null) {
        void syncPracticeRuntimeRuns(user.id, {
          signal: practiceController.signal,
        });
      }
    };
    void sync();
    resumePractice();
    window.addEventListener("online", resumePractice);
    return () => {
      current = false;
      practiceController.abort();
      window.removeEventListener("online", resumePractice);
    };
  }, [auth]);

  const retryBootstrap = useCallback(() => {
    setAuth({ status: "loading" });
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (res.ok) {
        clearLocalAttempts();
        clearProgressSync();
        prepareLocalOwner(null);
        setAuth({ status: "ready", user: null });
        router.refresh();
      }
    } catch {
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  const user = auth.status === "ready" ? auth.user : null;

  return (
    <UserContext
      value={{
        user: user ?? null,
        loading: auth.status !== "ready",
        signingOut,
        signOut,
      }}
    >
      {children}
      {auth.status === "error" && <AuthBootstrapError retry={retryBootstrap} />}
    </UserContext>
  );
}

function prepareLocalOwner(userId: string | null): void {
  syncDiagnosticOwner(userId);
  syncPracticeRuntimeOwner(userId);
  syncSimulationOwner(userId);
  prepareSimulationArchive(userId);
  prepareHistoryRuns(userId);
  syncTaskHistory(userId);
}
