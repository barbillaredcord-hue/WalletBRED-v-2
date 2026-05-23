import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  ArrowLeftRight,
  Eye,
  EyeOff,
  TrendingUp,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { TxRow, SectionHeader, fmt } from "@/components/ui-bits";
import { useWalletSnapshot } from "@/hooks/use-wallet";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const [hidden, setHidden] = useState(false);
  const { snapshot, loading } = useWalletSnapshot();
  const { user, transactions } = snapshot;
  const recentRecipients = transactions
    .filter((tx) => tx.type === "out" && tx.category === "transfer" && tx.recipient)
    .slice(0, 3);

  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">
            {user.avatar}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Welcome back</p>
            <p className="text-sm font-semibold">{user.name}</p>
          </div>
        </div>
        <button className="rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {user.handle}
        </button>
      </header>

      {/* Balance card */}
      <div className="relative overflow-hidden rounded-3xl gradient-card p-6 shadow-card">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Total balance</p>
            <button onClick={() => setHidden((h) => !h)} className="text-muted-foreground">
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <h2 className="font-display text-4xl font-bold tracking-tight">
              {hidden ? "•••••" : fmt(snapshot.balance, snapshot.currency)}
            </h2>
          </div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            <TrendingUp className="h-3 w-3" />{" "}
            {loading ? "Actualizando..." : `${snapshot.transactions.length} movimientos`}
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {[
              { to: "/wallet", label: "Add", icon: Plus },
              { to: "/transfers", label: "Send", icon: ArrowUpRight },
              { to: "/money", label: "Plus", icon: ArrowDownLeft },
              { to: "/qr", label: "Scan", icon: QrCode },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/5 py-3 backdrop-blur transition-colors hover:bg-white/10"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-primary-foreground">
                  <Icon className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <section>
          <SectionHeader title="Enviar" />
          <div className="rounded-3xl glass p-4 shadow-card">
            <Link
              to="/transfers"
              className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 transition-colors hover:bg-muted"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full gradient-primary text-primary-foreground">
                <ArrowUpRight className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Nueva transferencia</p>
                <p className="truncate text-xs text-muted-foreground">
                  Escribe el destinatario real manualmente.
                </p>
              </div>
            </Link>
            {recentRecipients.length > 0 && (
              <div className="mt-3 space-y-1">
                {recentRecipients.map((tx) => (
                  <Link
                    key={tx.id}
                    to="/transfers"
                    className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm hover:bg-white/5"
                  >
                    <span className="truncate text-muted-foreground">{tx.recipient}</span>
                    <span className="ml-3 shrink-0 font-semibold">
                      {fmt(tx.amount, tx.currency)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            to="/vip"
            className="mt-6 flex items-center gap-4 rounded-3xl gradient-vip p-4 text-primary-foreground shadow-card"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Unlock VIP content</p>
              <p className="text-xs opacity-80">Premium signals, drops & more</p>
            </div>
            <ArrowLeftRight className="h-4 w-4" />
          </Link>
        </section>

        <section>
          <SectionHeader
            title="Recent activity"
            action={
              <Link to="/wallet" className="text-xs text-primary">
                See all
              </Link>
            }
          />
          <div className="rounded-3xl glass px-4 shadow-card">
            {transactions.slice(0, 5).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aun no hay movimientos reales.
              </p>
            ) : (
              transactions.slice(0, 5).map((tx, i) => (
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
