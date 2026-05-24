import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, RefreshCw, Search } from "lucide-react";
import { ConnectOnboardingCard } from "@/components/ConnectOnboardingCard";
import { TxRow, PageHeader, Card, fmt } from "@/components/ui-bits";
import { isDemoMode, useWalletSnapshot } from "@/hooks/use-wallet";
import { createWalletMovement, startDepositCheckout } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_app/wallet")({
  component: WalletPage,
});

const tabs = ["All", "Income", "Spent", "Transfers"] as const;

function WalletPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("25");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { snapshot, loading, error, refresh } = useWalletSnapshot();
  const startDeposit = useServerFn(startDepositCheckout);
  const createMovement = useServerFn(createWalletMovement);
  const transactions = snapshot.transactions;
  const availableCurrencies = useMemo(
    () =>
      snapshot.balances.length
        ? snapshot.balances.map((balance) => balance.currency)
        : [snapshot.currency],
    [snapshot.balances, snapshot.currency],
  );
  const selectedBalance =
    snapshot.balances.find((balance) => balance.currency === currency)?.amount ??
    (snapshot.currency === currency ? snapshot.balance : 0);

  useEffect(() => {
    if (!availableCurrencies.includes(currency)) {
      setCurrency(availableCurrencies[0] ?? "USD");
    }
  }, [availableCurrencies, currency]);

  const filtered = transactions.filter((tx) => {
    if (tab === "Income" && tx.type !== "in") return false;
    if (tab === "Spent" && tx.type !== "out") return false;
    if (tab === "Transfers" && tx.category !== "transfer") return false;
    if (query && !tx.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function runAction(action: "deposit" | "withdraw" | "convert") {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus("Escribe un monto valido.");
      return;
    }
    if (isDemoMode()) {
      setStatus("En demo no se crean movimientos reales. Abre la Mini App desde Telegram.");
      return;
    }

    setPendingAction(action);
    setStatus(null);
    try {
      if (action === "deposit") {
        const response = await startDeposit({ data: { amount: parsedAmount, currency } });
        window.location.href = response.url;
        return;
      }

      if (parsedAmount > selectedBalance) {
        setStatus(`Saldo insuficiente. Disponible: ${fmt(selectedBalance, currency)}.`);
        return;
      }

      await createMovement({
        data: {
          kind: action === "withdraw" ? "withdraw" : "convert",
          amount: parsedAmount,
          currency,
          note: action === "convert" ? "EUR" : undefined,
        },
      });
      setStatus(action === "withdraw" ? "Retiro solicitado." : "Conversion registrada.");
      refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "No se pudo completar la accion.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Balance real, pagos y movimientos" />

      <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <Card className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Available</p>
          <h2 className="mt-1 font-display text-4xl font-bold">
            {loading ? "..." : fmt(selectedBalance, currency)}
          </h2>
          {snapshot.balances.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {snapshot.balances.map((balance) => (
                <button
                  key={balance.currency}
                  onClick={() => setCurrency(balance.currency)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    currency === balance.currency
                      ? "gradient-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {fmt(balance.amount, balance.currency)}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-2">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground outline-none"
            >
              {availableCurrencies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="min-w-0 flex-1 bg-transparent text-right font-display text-xl font-bold outline-none"
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <ActionBtn
              icon={<ArrowDownToLine className="h-4 w-4" />}
              label="Deposit"
              loading={pendingAction === "deposit"}
              onClick={() => void runAction("deposit")}
            />
            <ActionBtn
              icon={<ArrowUpFromLine className="h-4 w-4" />}
              label="Withdraw"
              loading={pendingAction === "withdraw"}
              onClick={() => void runAction("withdraw")}
            />
            <ActionBtn
              icon={<RefreshCw className="h-4 w-4" />}
              label="Convert"
              loading={pendingAction === "convert"}
              onClick={() => void runAction("convert")}
            />
          </div>
          {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
        </Card>

        <section>
          <ConnectOnboardingCard
            returnPath="/wallet"
            compact
            title="Retiro a cuenta propia"
            description="Activa Stripe Connect para preparar retiros reales. Despues de completar KYC, el admin puede aprobar salidas."
          />

          <div className="mt-3 flex items-center gap-2 rounded-2xl glass px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transactions"
              className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? "gradient-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-3xl glass px-4 shadow-card">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions</p>
            ) : (
              filtered.map((tx, i) => (
                <div key={tx.id} className={i !== 0 ? "border-t border-border" : ""}>
                  <TxRow tx={tx} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/5 py-3 transition-colors hover:bg-white/10 disabled:opacity-60"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-primary-foreground">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
