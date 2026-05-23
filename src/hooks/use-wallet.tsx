import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { transactions, user, type Transaction } from "@/lib/mock-data";
import { getWalletSnapshot } from "@/lib/wallet.functions";

export type WalletSnapshot = {
  user: {
    id: string;
    name: string;
    handle: string;
    avatar: string;
  };
  balance: number;
  currency: string;
  change24h: number;
  stats: {
    sent: number;
    received: number;
    movements: number;
  };
  transactions: Transaction[];
};

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";
}

export function demoWalletSnapshot(): WalletSnapshot {
  return {
    user: { id: "demo", name: user.name, handle: user.handle, avatar: user.avatar },
    balance: user.balance,
    currency: user.currency,
    change24h: user.change24h,
    stats: { sent: 42, received: 68, movements: transactions.length },
    transactions,
  };
}

export function useWalletSnapshot() {
  const loadSnapshot = useServerFn(getWalletSnapshot);
  const demo = isDemoMode();
  const initial = useMemo(() => (demo ? demoWalletSnapshot() : null), [demo]);
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (demo) {
      setSnapshot(demoWalletSnapshot());
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    loadSnapshot()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar wallet.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [demo, loadSnapshot, version]);

  return {
    snapshot: snapshot ?? emptyWalletSnapshot(),
    loading,
    error,
    refresh: () => setVersion((current) => current + 1),
  };
}

function emptyWalletSnapshot(): WalletSnapshot {
  return {
    user: { id: "web", name: "WalletBRED Web", handle: "WEB", avatar: "WB" },
    balance: 0,
    currency: user.currency,
    change24h: 0,
    stats: { sent: 0, received: 0, movements: 0 },
    transactions: [],
  };
}
