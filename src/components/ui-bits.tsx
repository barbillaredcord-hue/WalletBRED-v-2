import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  QrCode,
  Repeat,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Transaction } from "@/lib/mock-data";

export function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

const icons: Record<Transaction["type"], LucideIcon> = {
  in: ArrowDownLeft,
  out: ArrowUpRight,
};

const categoryIcon: Partial<Record<Transaction["category"], LucideIcon>> = {
  deposit: CircleDollarSign,
  exchange: Repeat,
  qr: QrCode,
  vip: Sparkles,
};

export function TxRow({ tx }: { tx: Transaction }) {
  const Icon = categoryIcon[tx.category] ?? icons[tx.type];
  const isIn = tx.type === "in";
  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isIn ? "bg-success/15 text-success" : "bg-muted text-foreground/80"}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tx.title}</p>
        <p className="truncate text-xs text-muted-foreground" title={tx.recipient ?? undefined}>
          {tx.subtitle} · {tx.date}
        </p>
      </div>
      <div
        className={`text-right text-sm font-semibold ${isIn ? "text-success" : "text-foreground"}`}
      >
        {isIn ? "+" : "−"}
        {fmt(tx.amount, tx.currency)}
      </div>
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-3xl glass p-5 shadow-card ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
