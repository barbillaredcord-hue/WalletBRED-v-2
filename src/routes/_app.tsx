import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { verifyTelegramInitData } from "@/lib/telegram-auth.functions";

export const Route = createFileRoute("/_app")({
  component: AppGate,
});

type State = { status: "loading" } | { status: "ok" } | { status: "denied"; message: string };
type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
};
type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

function AppGate() {
  const [state, setState] = useState<State>({ status: "loading" });
  const router = useRouter();
  const verify = useServerFn(verifyTelegramInitData);
  const verifyRef = useRef(verify);
  verifyRef.current = verify;

  useEffect(() => {
    let cancelled = false;
    const tg =
      typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : undefined;
    const initData = tg?.initData;
    tg?.ready?.();

    if (!initData || !new URLSearchParams(initData).get("hash")) {
      setState({ status: "ok" });
      return;
    }

    verifyRef
      .current({ data: { initData } })
      .then(() => {
        if (!cancelled) setState({ status: "ok" });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            status: "denied",
            message: "Could not verify your Telegram session.",
          });
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Verifying Telegram session…
      </div>
    );
  }

  if (state.status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-lg font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
