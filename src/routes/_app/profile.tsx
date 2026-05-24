import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  ClipboardList,
  Shield,
  CreditCard,
  Globe2,
  HelpCircle,
  LogOut,
  ChevronRight,
  BadgeCheck,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Card, PageHeader } from "@/components/ui-bits";
import { useWalletSnapshot } from "@/hooks/use-wallet";
import { logoutWebWalletUser } from "@/lib/web-auth.functions";
import { clearWebSessionToken, getStoredWebSessionToken } from "@/lib/web-auth.shared";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { snapshot } = useWalletSnapshot();
  const logoutWeb = useServerFn(logoutWebWalletUser);
  const { user, stats } = snapshot;
  const [message, setMessage] = useState<string | null>(null);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setMessage("Este navegador no soporta notificaciones.");
      return;
    }
    const permission = await Notification.requestPermission();
    setMessage(
      permission === "granted" ? "Notificaciones activadas." : "Notificaciones no activadas.",
    );
  }

  async function signOut() {
    const sessionToken = getStoredWebSessionToken();
    if (sessionToken) {
      try {
        await logoutWeb({ data: { sessionToken } });
      } catch {
        // Local logout still clears the browser session if the server is unreachable.
      }
    }
    window.sessionStorage.removeItem("wallet-glow-demo");
    clearWebSessionToken();
    window.location.href = "/";
  }

  const items = [
    { icon: CreditCard, label: "Payment methods", hint: "Depositos y checkout", to: "/wallet" },
    { icon: Shield, label: "Security", hint: "Sesion Telegram o modo web", to: "/setup" },
    {
      icon: Bell,
      label: "Notifications",
      hint: "Activar avisos del navegador",
      action: enableNotifications,
    },
    { icon: Globe2, label: "Language & region", hint: "USD · Web/Telegram", to: "/transfers" },
    {
      icon: ShieldCheck,
      label: "Panel privado",
      hint: "Usuarios, archivos y cancelaciones",
      to: "/admin",
    },
    { icon: Bot, label: "Abrir bot", hint: "@WalletBREDbot", href: "https://t.me/WalletBREDbot" },
    { icon: HelpCircle, label: "Help & support", hint: "Chat IA de configuracion", to: "/ai" },
  ];

  return (
    <div>
      <PageHeader title="Profile" />

      <Card className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full gradient-primary text-2xl font-bold text-primary-foreground glow">
          {user.avatar}
        </div>
        <h2 className="mt-3 inline-flex items-center gap-1 font-display text-lg font-bold">
          {user.name} <BadgeCheck className="h-4 w-4 text-secondary" />
        </h2>
        <p className="text-sm text-muted-foreground">{user.handle} · Telegram verified</p>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Sent" value={String(stats.sent)} />
          <Stat label="Received" value={String(stats.received)} />
          <Stat label="Moves" value={String(stats.movements)} highlight />
        </div>
      </Card>

      {message && (
        <p className="mt-4 rounded-2xl bg-muted/60 px-4 py-3 text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Link
          to="/setup"
          className="flex w-full items-center gap-3 rounded-3xl glass px-4 py-3.5 text-left shadow-card transition-colors hover:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Datos y clientes</p>
            <p className="text-xs text-muted-foreground">Información faltante y usuarios del bot</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        {items.map((it) => (
          <ProfileAction key={it.label} item={it} />
        ))}
      </div>

      <button
        onClick={() => void signOut()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/15 py-3 text-sm font-semibold text-destructive"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>

      <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Lumen Wallet · v0.1
      </p>
    </div>
  );
}

type ProfileItem = {
  icon: typeof CreditCard;
  label: string;
  hint?: string;
  to?: string;
  href?: string;
  action?: () => void;
};

function ProfileAction({ item }: { item: ProfileItem }) {
  const content = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <item.icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.label}</p>
        {item.hint && <p className="truncate text-xs text-muted-foreground">{item.hint}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </>
  );

  const className =
    "flex w-full items-center gap-3 rounded-3xl glass px-4 py-3.5 text-left shadow-card transition-colors hover:bg-white/5";

  if (item.to) {
    return (
      <Link to={item.to} className={className}>
        {content}
      </Link>
    );
  }

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={item.action} className={className}>
      {content}
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl py-3 ${highlight ? "gradient-primary text-primary-foreground" : "bg-muted/60"}`}
    >
      <p className="font-display text-base font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
    </div>
  );
}
