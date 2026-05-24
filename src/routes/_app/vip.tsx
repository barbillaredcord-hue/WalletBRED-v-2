import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Crown,
  Lock,
  Play,
  Image as ImageIcon,
  Check,
  History,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { vipContent } from "@/lib/mock-data";
import { PageHeader, fmt } from "@/components/ui-bits";
import {
  createTelegramStarsInvoice,
  listMyTelegramStarsPurchases,
  listTelegramStarsProducts,
} from "@/lib/telegram-stars.functions";
import {
  fallbackVipPlans,
  listPublicVipPlans,
  type PublicVipPlan,
} from "@/lib/vip-plans.functions";

export const Route = createFileRoute("/_app/vip")({
  component: VipPage,
});

const WEB_WALLET_SESSION_KEY = "walletbred-web-user-id";
type StarsProduct = Awaited<ReturnType<typeof listTelegramStarsProducts>>[number];
type StarsPurchase = Awaited<ReturnType<typeof listMyTelegramStarsPurchases>>[number];

function getOrCreateWebWalletId() {
  const current = window.localStorage.getItem(WEB_WALLET_SESSION_KEY);
  if (current) return current;

  const random =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = `web_${random}`;
  window.localStorage.setItem(WEB_WALLET_SESSION_KEY, next);
  return next;
}

function VipPage() {
  const loadPlans = useServerFn(listPublicVipPlans);
  const loadStarsProducts = useServerFn(listTelegramStarsProducts);
  const loadStarsPurchases = useServerFn(listMyTelegramStarsPurchases);
  const createStarsInvoice = useServerFn(createTelegramStarsInvoice);
  const loadPlansRef = useRef(loadPlans);
  const loadStarsProductsRef = useRef(loadStarsProducts);
  const loadStarsPurchasesRef = useRef(loadStarsPurchases);
  const createStarsInvoiceRef = useRef(createStarsInvoice);
  const [plans, setPlans] = useState<PublicVipPlan[]>(fallbackVipPlans);
  const [starsProducts, setStarsProducts] = useState<StarsProduct[]>([]);
  const [starsPurchases, setStarsPurchases] = useState<StarsPurchase[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingStarsProduct, setLoadingStarsProduct] = useState<string | null>(null);
  const [selectedCurrencies, setSelectedCurrencies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  loadPlansRef.current = loadPlans;
  loadStarsProductsRef.current = loadStarsProducts;
  loadStarsPurchasesRef.current = loadStarsPurchases;
  createStarsInvoiceRef.current = createStarsInvoice;

  useEffect(() => {
    void loadPlansRef
      .current()
      .then((nextPlans) => {
        if (nextPlans.length) setPlans(nextPlans);
        setSelectedCurrencies((current) => ({
          ...Object.fromEntries(
            nextPlans.map((plan) => [plan.id, plan.currencyOptions[0]?.currency ?? plan.currency]),
          ),
          ...current,
        }));
      })
      .catch(() => {
        setPlans(fallbackVipPlans);
      });

    void loadStarsProductsRef.current().then(setStarsProducts).catch(console.warn);
    void loadStarsPurchasesRef
      .current()
      .then(setStarsPurchases)
      .catch(() => setStarsPurchases([]));
  }, []);

  async function refreshStarsPurchases() {
    try {
      setStarsPurchases(await loadStarsPurchasesRef.current());
    } catch {
      setStarsPurchases([]);
    }
  }

  async function subscribe(planId: string) {
    const initData = (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp
      ?.initData;

    setError(null);
    setLoadingPlan(planId);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (initData) headers.authorization = `tma ${initData}`;
      else headers["x-wallet-web-user"] = getOrCreateWebWalletId();

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({ planId, currency: selectedCurrencies[planId] }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error ? checkoutError.message : "Could not start Stripe checkout.",
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  async function buyWithStars(productId: string) {
    const tg = (
      window as {
        Telegram?: {
          WebApp?: {
            initData?: string;
            openInvoice?: (url: string, cb?: (status: string) => void) => void;
          };
        };
      }
    ).Telegram?.WebApp;

    setError(null);
    setLoadingStarsProduct(productId);
    try {
      const { invoiceUrl } = await createStarsInvoiceRef.current({ data: { productId } });
      if (tg?.openInvoice) {
        tg.openInvoice(invoiceUrl, () => {
          void refreshStarsPurchases();
        });
      } else {
        window.location.href = invoiceUrl;
      }
    } catch (starsError) {
      setError(
        starsError instanceof Error
          ? starsError.message
          : "No se pudo abrir el pago con Telegram Stars.",
      );
    } finally {
      setLoadingStarsProduct(null);
    }
  }

  return (
    <div>
      <PageHeader title="VIP" subtitle="Unlock premium content & perks" />

      <div className="relative overflow-hidden rounded-3xl gradient-vip p-6 shadow-card">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <Crown className="h-7 w-7 text-primary-foreground" />
        <h2 className="mt-3 font-display text-2xl font-bold text-primary-foreground">Lumen VIP</h2>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Premium drops, signals & private content.
        </p>
      </div>

      <h2 className="mb-3 mt-6 font-display text-base font-semibold">Choose your plan</h2>
      {error && (
        <div className="mb-3 rounded-2xl bg-destructive/15 p-3 text-xs text-white">
          <p>{error}</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            selectedCurrency={selectedCurrencies[p.id] ?? p.currency}
            loading={loadingPlan === p.id}
            disabled={loadingPlan !== null}
            onCurrencyChange={(currency) =>
              setSelectedCurrencies((current) => ({ ...current, [p.id]: currency }))
            }
            onSubscribe={() => subscribe(p.id)}
          />
        ))}
      </div>

      <h2 className="mb-3 mt-6 flex items-center gap-2 font-display text-base font-semibold">
        <ShoppingBag className="h-4 w-4 text-primary" />
        Telegram Store
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {starsProducts.length ? (
          starsProducts.map((product) => (
            <StarsProductCard
              key={product.id}
              product={product}
              loading={loadingStarsProduct === product.id}
              disabled={loadingStarsProduct !== null}
              onBuy={() => void buyWithStars(product.id)}
            />
          ))
        ) : (
          <div className="rounded-3xl glass p-5 text-sm text-muted-foreground md:col-span-3">
            No hay productos con Stars activos.
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-6 flex items-center gap-2 font-display text-base font-semibold">
        <History className="h-4 w-4 text-primary" />
        Historial de compras
      </h2>
      <div className="rounded-3xl glass p-2 shadow-card">
        {starsPurchases.length ? (
          starsPurchases.map((purchase) => (
            <div key={purchase.id} className="flex items-center gap-3 rounded-2xl px-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Star className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{purchase.productTitle}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {purchase.status} · entrega {purchase.deliveryStatus} ·{" "}
                  {new Date(purchase.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{purchase.totalAmount} XTR</span>
            </div>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Tus compras con Telegram Stars apareceran aqui.
          </p>
        )}
      </div>

      <h2 className="mb-3 mt-6 font-display text-base font-semibold">Premium drops</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {vipContent.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-3xl glass shadow-card">
            <div className={`relative aspect-[4/5] bg-gradient-to-br ${c.gradient}`}>
              {c.locked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md">
                  <Lock className="h-7 w-7 text-white" />
                  <p className="mt-2 text-xs font-semibold text-white">Unlock {fmt(c.price)}</p>
                </div>
              )}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
                {c.type === "video" ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <ImageIcon className="h-3 w-3" />
                )}
                {c.type}
              </span>
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.creator}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StarsProductCard({
  product,
  loading,
  disabled,
  onBuy,
}: {
  product: StarsProduct;
  loading: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="rounded-3xl glass p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{product.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
          <Star className="h-3.5 w-3.5" />
          {product.starsAmount} XTR
        </span>
      </div>
      {product.content.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {product.content.slice(0, 3).map((item) => (
            <li key={item.id} className="truncate text-xs text-muted-foreground">
              {item.title}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={onBuy}
        disabled={disabled}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        <Star className="h-4 w-4" />
        {loading ? "Abriendo pago..." : "Comprar con Stars"}
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  selectedCurrency,
  loading,
  disabled,
  onCurrencyChange,
  onSubscribe,
}: {
  plan: PublicVipPlan;
  selectedCurrency: string;
  loading: boolean;
  disabled: boolean;
  onCurrencyChange: (currency: string) => void;
  onSubscribe: () => void;
}) {
  const selectedPrice = plan.currencyOptions.find(
    (option) => option.currency === selectedCurrency,
  ) ??
    plan.currencyOptions[0] ?? { currency: plan.currency, price: plan.price };

  return (
    <div
      className={`relative rounded-3xl p-5 shadow-card ${
        plan.featured ? "gradient-primary text-primary-foreground glow" : "glass"
      }`}
    >
      {plan.featured && (
        <span className="absolute right-4 top-4 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          Popular
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{plan.name}</p>
          <p className="mt-1 line-clamp-2 text-xs opacity-75">{plan.description}</p>
        </div>
        <p className="shrink-0 text-right font-display text-2xl font-bold">
          {fmt(selectedPrice.price, selectedPrice.currency)}
          <span className="text-xs font-medium opacity-70">/mo</span>
        </p>
      </div>
      {plan.currencyOptions.length > 1 && (
        <label className="mt-4 block text-xs font-semibold opacity-80">
          Divisa
          <select
            value={selectedPrice.currency}
            onChange={(event) => onCurrencyChange(event.target.value)}
            className={`mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm font-semibold outline-none ${
              plan.featured
                ? "border-white/30 bg-black/20 text-primary-foreground"
                : "border-border bg-background text-foreground"
            }`}
          >
            {plan.currencyOptions.map((option) => (
              <option key={option.currency} value={option.currency}>
                {option.currency} · {fmt(option.price, option.currency)}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="mt-3 space-y-1.5">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-xs">
            <Check className="h-3.5 w-3.5" /> {perk}
          </li>
        ))}
      </ul>
      <button
        onClick={onSubscribe}
        disabled={disabled}
        className={`mt-4 w-full rounded-2xl py-2.5 text-sm font-semibold ${
          plan.featured
            ? "bg-black/25 text-primary-foreground"
            : "gradient-primary text-primary-foreground glow"
        }`}
      >
        {loading ? "Opening Stripe..." : "Subscribe with Stripe"}
      </button>
    </div>
  );
}
