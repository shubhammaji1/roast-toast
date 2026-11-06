"use client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { Check, ArrowRight } from "lucide-react";
import { api, authClient, type Me } from "@/lib/api";
import { Modal } from "./ui";

type Context = {
  me: Me | undefined;
  loading: boolean;
  openAuth: () => void;
  guard: (fn: () => void | Promise<void>) => void;
  toast: (message: string) => void;
};
const AppContext = createContext<Context | null>(null);
export const useApp = () => useContext(AppContext)!;
function AppProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [adminOpen, setAdminOpen] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: me, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/visitor-session"),
    retry: 1,
  });
  const toast = (value: string) => {
    setMessage(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 5000);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const guard = (fn: () => void | Promise<void>) => {
    void (async () => {
      try {
        if (!me?.user)
          await client.fetchQuery({
            queryKey: ["me"],
            queryFn: () => api<Me>("/visitor-session"),
          });
        await fn();
      } catch (error) {
        toast((error as Error).message);
      }
    })();
  };
  return (
    <AppContext.Provider
      value={{
        me,
        loading: isPending,
        openAuth: () => setAdminOpen(true),
        guard,
        toast,
      }}
    >
      {children}
      <ModeratorSignIn open={adminOpen} close={() => setAdminOpen(false)} />
      <div
        className={`toast ${message ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message && (
          <>
            <Check size={17} />
            {message}
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );
}

function ModeratorSignIn({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && close()}
      title="Moderator sign-in"
      description="This is only for the moderation team. Posting and participating never require an account."
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(event.currentTarget);
          try {
            const result = await authClient.signIn.email({
              email: String(data.get("email")),
              password: String(data.get("password")),
            });
            if (result.error) throw new Error(result.error.message);
            const current = await api<Me>("/visitor-session");
            if (current.profile?.role !== "admin") {
              await authClient.signOut();
              throw new Error("This account does not have moderator access.");
            }
            await client.invalidateQueries();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Moderator email
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Checking…" : "Sign in to moderation"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
