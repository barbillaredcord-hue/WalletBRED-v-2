import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2 } from "lucide-react";
import { ConnectOnboardingCard } from "@/components/ConnectOnboardingCard";
import { PageHeader, Card, fmt } from "@/components/ui-bits";
import { isDemoMode, useWalletSnapshot } from "@/hooks/use-wallet";
import { createWalletMovement } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_app/transfers")({
  component: TransfersPage,
});

const currencies = ["USD", "MXN", "EUR", "GBP", "JPY", "BRL", "INR"];

function TransfersPage() {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amount, setAmount] = useState("100");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { snapshot, refresh } = useWalletSnapshot();
  const createMovement = useServerFn(createWalletMovement);
  const rate = 0.92;
  const out = (parseFloat(amount || "0") * rate).toFixed(2);
  const available =
    snapshot.balances.find((balance) => balance.currency === from)?.amount ??
    (snapshot.currency === from ? snapshot.balance : 0);
  const sentTransfers = snapshot.transactions.filter(
    (tx) => tx.type === "out" && tx.category === "transfer",
  );

  async function submitTransfer() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus("Escribe un monto valido.");
      return;
    }
    if (!recipient.trim()) {
      setStatus("Selecciona o escribe un destinatario.");
      return;
    }
    if (parsedAmount > available) {
      setStatus(`Saldo insuficiente. Disponible: ${fmt(available, from)}.`);
      return;
    }
    if (isDemoMode()) {
      setStatus("En demo no se guardan transferencias reales. Abre desde Telegram.");
      return;
    }

    setPending(true);
    setStatus(null);
    try {
      await createMovement({
        data: {
          kind: "transfer",
          amount: parsedAmount,
          currency: from,
          recipient,
        },
      });
      setStatus(`Transferencia a @${recipient.replace(/^@+/, "")} registrada.`);
      refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "No se pudo registrar la transferencia.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader title="Transfers" subtitle={`Disponible: ${fmt(available, from)}`} />

      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Recipient</p>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="@usuario"
            className="mb-5 w-full rounded-2xl bg-muted/50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />

          <p className="text-xs uppercase tracking-widest text-muted-foreground">You send</p>
          <div className="mt-2 flex items-center gap-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full bg-transparent font-display text-3xl font-bold focus:outline-none"
            />
            <CurrencyPick value={from} onChange={setFrom} />
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <button
              onClick={() => {
                const tmp = from;
                setFrom(to);
                setTo(tmp);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-primary-foreground glow"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="text-xs uppercase tracking-widest text-muted-foreground">Recipient gets</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="w-full font-display text-3xl font-bold text-gradient">{out}</p>
            <CurrencyPick value={to} onChange={setTo} />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span>Rate</span>
            <span className="font-semibold text-foreground">
              1 {from} = {rate} {to}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs text-muted-foreground">
            <span>Fee</span>
            <span className="font-semibold text-success">Free</span>
          </div>

          {status && <p className="mt-4 text-center text-xs text-muted-foreground">{status}</p>}

          <button
            onClick={() => void submitTransfer()}
            disabled={pending}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-4 text-sm font-semibold text-primary-foreground glow disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue transfer
          </button>
        </Card>

        <section>
          <ConnectOnboardingCard
            returnPath="/transfers"
            compact
            title="Configurar retiros"
            description="Crea tu cuenta Stripe Connect desde aqui si quieres retirar saldo o ganancias despues de revision."
          />

          <h2 className="mb-3 mt-4 font-display text-base font-semibold">
            Ultimos destinos reales
          </h2>
          <div className="rounded-3xl glass p-2 shadow-card">
            {sentTransfers.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aun no hay transferencias salientes. Escribe el destinatario manualmente.
              </p>
            ) : (
              sentTransfers.slice(0, 5).map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => tx.recipient && setRecipient(tx.recipient)}
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tx.recipient ?? tx.title}</p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                  <span className="ml-3 shrink-0 font-semibold">{fmt(tx.amount, tx.currency)}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CurrencyPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full bg-muted px-3 py-2 text-sm font-semibold focus:outline-none"
    >
      {currencies.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
