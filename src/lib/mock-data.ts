export type Transaction = {
  id: string;
  type: "in" | "out";
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  date: string;
  recipient?: string | null;
  category: "transfer" | "qr" | "deposit" | "vip" | "exchange";
};

export const user = {
  name: "Alex Carter",
  handle: "@alexc",
  avatar: "AC",
  balance: 12480.55,
  currency: "USD",
  change24h: 2.4,
};

export const transactions: Transaction[] = [
  {
    id: "1",
    type: "in",
    title: "Transferencia recibida",
    subtitle: "International transfer",
    amount: 850,
    currency: "USD",
    date: "Today, 14:22",
    category: "transfer",
  },
  {
    id: "2",
    type: "out",
    title: "Coffee Roasters",
    subtitle: "QR payment",
    amount: 12.4,
    currency: "USD",
    date: "Today, 09:10",
    category: "qr",
  },
  {
    id: "3",
    type: "out",
    title: "VIP Monthly",
    subtitle: "Subscription",
    amount: 19.99,
    currency: "USD",
    date: "Yesterday",
    category: "vip",
  },
  {
    id: "4",
    type: "in",
    title: "Stripe Deposit",
    subtitle: "Card top-up",
    amount: 2000,
    currency: "USD",
    date: "Mar 11",
    category: "deposit",
  },
  {
    id: "5",
    type: "out",
    title: "EUR → USD",
    subtitle: "FX conversion",
    amount: 320,
    currency: "USD",
    date: "Mar 10",
    category: "exchange",
  },
  {
    id: "6",
    type: "in",
    title: "Transferencia recibida",
    subtitle: "Pago recibido",
    amount: 64,
    currency: "USD",
    date: "Mar 09",
    category: "transfer",
  },
];

export const vipContent = [
  {
    id: "v1",
    title: "Pro Trading Signals",
    creator: "Market Pulse",
    price: 29,
    type: "video",
    locked: true,
    gradient: "from-violet-600 to-fuchsia-500",
  },
  {
    id: "v2",
    title: "Crypto Masterclass",
    creator: "Satoshi School",
    price: 49,
    type: "video",
    locked: true,
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "v3",
    title: "Private Photo Drop",
    creator: "Studio Lumen",
    price: 15,
    type: "image",
    locked: true,
    gradient: "from-rose-500 to-orange-500",
  },
  {
    id: "v4",
    title: "Weekly Insider Notes",
    creator: "Insider Desk",
    price: 9,
    type: "image",
    locked: false,
    gradient: "from-emerald-500 to-teal-500",
  },
];

export const vipPlans = [
  { id: "basic", name: "Basic", price: 9.99, perks: ["Ad-free", "Basic signals", "Email support"] },
  {
    id: "pro",
    name: "Pro",
    price: 19.99,
    perks: ["Everything in Basic", "All premium content", "Priority support"],
    featured: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: 49.99,
    perks: ["Everything in Pro", "1:1 sessions", "Early access"],
  },
];
