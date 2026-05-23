import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Home,
  Wallet,
  ArrowLeftRight,
  QrCode,
  Crown,
  User,
  Bot,
  BadgeDollarSign,
  Landmark,
} from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/transfers", label: "Transfer", icon: ArrowLeftRight },
  { to: "/money", label: "Plus", icon: BadgeDollarSign },
  { to: "/banking", label: "Bank", icon: Landmark },
  { to: "/qr", label: "QR", icon: QrCode },
  { to: "/vip", label: "VIP", icon: Crown },
  { to: "/ai", label: "AI", icon: Bot },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-28 pt-6 md:px-6">
      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="fixed bottom-3 left-1/2 z-50 w-[min(calc(100%-1.5rem),42rem)] -translate-x-1/2 rounded-2xl glass p-1.5 shadow-card">
        <ul className="grid grid-cols-9">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-all ${
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} strokeWidth={2.2} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
