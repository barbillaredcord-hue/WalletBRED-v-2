import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeDollarSign, Loader2, Package, RefreshCw, Send, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, fmt, PageHeader } from "@/components/ui-bits";
import {
  getMarketplaceDashboard,
  requestSellerWithdrawal,
  saveSellerProfile,
  startMarketplaceCheckout,
  startSellerConnectOnboarding,
  submitMarketplaceProduct,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_app/sell")({
  component: SellPage,
});

type MarketplaceData = Awaited<ReturnType<typeof getMarketplaceDashboard>>;

function SellPage() {
  const loadDashboard = useServerFn(getMarketplaceDashboard);
  const saveProfile = useServerFn(saveSellerProfile);
  const submitProduct = useServerFn(submitMarketplaceProduct);
  const startConnect = useServerFn(startSellerConnectOnboarding);
  const checkout = useServerFn(startMarketplaceCheckout);
  const requestWithdrawal = useServerFn(requestSellerWithdrawal);
  const loadRef = useRef(loadDashboard);
  const saveProfileRef = useRef(saveProfile);
  const submitProductRef = useRef(submitProduct);
  const startConnectRef = useRef(startConnect);
  const checkoutRef = useRef(checkout);
  const requestWithdrawalRef = useRef(requestWithdrawal);
  const [data, setData] = useState<MarketplaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sellerDraft, setSellerDraft] = useState({
    displayName: "",
    country: "MX",
    currency: "MXN",
  });
  const [productDraft, setProductDraft] = useState({
    title: "",
    description: "",
    amount: 25,
    currency: "MXN",
    contentUrl: "",
    coverUrl: "",
  });
  const [withdrawAmount, setWithdrawAmount] = useState(0);

  loadRef.current = loadDashboard;
  saveProfileRef.current = saveProfile;
  submitProductRef.current = submitProduct;
  startConnectRef.current = startConnect;
  checkoutRef.current = checkout;
  requestWithdrawalRef.current = requestWithdrawal;

  const stats = useMemo(
    () => ({
      products: data?.products.length ?? 0,
      approved: data?.products.filter((product) => product.status === "approved").length ?? 0,
      orders: data?.orders.filter((order) => order.status === "paid").length ?? 0,
      balance: data?.seller?.availableBalance ?? 0,
    }),
    [data],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const next = await loadRef.current();
      setData(next);
      if (next.seller) {
        setSellerDraft({
          displayName: next.seller.displayName,
          country: next.seller.country,
          currency: next.seller.currency,
        });
        setWithdrawAmount(next.seller.availableBalance > 0 ? next.seller.availableBalance : 0);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar marketplace.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveSeller() {
    setBusy("seller");
    setMessage(null);
    try {
      await saveProfileRef.current({ data: sellerDraft });
      setMessage("Perfil de vendedor guardado.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar vendedor.");
    } finally {
      setBusy(null);
    }
  }

  async function connectStripe() {
    setBusy("connect");
    setMessage(null);
    try {
      const result = await startConnectRef.current();
      await refresh();
      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir Stripe Connect.");
      setBusy(null);
    }
  }

  async function sendProduct() {
    setBusy("product");
    setMessage(null);
    try {
      await submitProductRef.current({ data: productDraft });
      setMessage("Producto enviado a revision admin.");
      setProductDraft({
        title: "",
        description: "",
        amount: 25,
        currency: sellerDraft.currency || "USD",
        contentUrl: "",
        coverUrl: "",
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo enviar el producto.");
    } finally {
      setBusy(null);
    }
  }

  async function buy(productId: string) {
    setBusy(productId);
    setMessage(null);
    try {
      const result = await checkoutRef.current({ data: { productId } });
      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar compra.");
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("withdraw");
    setMessage(null);
    try {
      await requestWithdrawalRef.current({
        data: { amount: withdrawAmount, currency: data?.seller?.currency ?? "USD" },
      });
      setMessage("Retiro enviado a revision admin.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo pedir retiro.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle="Vende productos, espera revision admin y retira ganancias con Connect"
      />

      {message && (
        <p className="mb-4 rounded-2xl bg-muted/70 px-4 py-3 text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Package} label="Productos" value={stats.products} />
        <Metric icon={Store} label="Aprobados" value={stats.approved} />
        <Metric icon={Send} label="Ventas" value={stats.orders} />
        <Metric
          icon={BadgeDollarSign}
          label="Saldo"
          value={fmt(stats.balance, data?.seller?.currency ?? "USD")}
        />
      </div>

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Perfil y retiros Connect</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Tus productos se publican solo despues de revision admin. Completa Stripe Connect para
              poder retirar.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_90px_90px_auto]">
          <input
            value={sellerDraft.displayName}
            onChange={(event) =>
              setSellerDraft((draft) => ({ ...draft, displayName: event.target.value }))
            }
            placeholder="Nombre de tienda o vendedor"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={sellerDraft.country}
            onChange={(event) =>
              setSellerDraft((draft) => ({
                ...draft,
                country: event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, 2),
              }))
            }
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={sellerDraft.currency}
            onChange={(event) =>
              setSellerDraft((draft) => ({
                ...draft,
                currency: event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, 3),
              }))
            }
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => void saveSeller()}
            disabled={busy === "seller"}
            className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "seller" && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>

        {data?.seller && (
          <div className="mt-4 grid gap-3 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground md:grid-cols-3">
            <span>Estado: {data.seller.status}</span>
            <span>Stripe: {data.seller.stripeStatus}</span>
            <span>
              Pendiente retiro: {fmt(data.seller.pendingWithdrawal, data.seller.currency)}
            </span>
          </div>
        )}

        <button
          onClick={() => void connectStripe()}
          disabled={busy === "connect"}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {busy === "connect" && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear/conectar cuenta Stripe para retiros
        </button>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold">Enviar producto a revision</p>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_140px_90px]">
          <input
            value={productDraft.title}
            onChange={(event) =>
              setProductDraft((draft) => ({ ...draft, title: event.target.value }))
            }
            placeholder="Nombre del producto"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={productDraft.amount}
            onChange={(event) =>
              setProductDraft((draft) => ({ ...draft, amount: Number(event.target.value) || 0 }))
            }
            type="number"
            min="1"
            step="1"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={productDraft.currency}
            onChange={(event) =>
              setProductDraft((draft) => ({
                ...draft,
                currency: event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, 3),
              }))
            }
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <textarea
          value={productDraft.description}
          onChange={(event) =>
            setProductDraft((draft) => ({ ...draft, description: event.target.value }))
          }
          placeholder="Describe que recibe el comprador"
          className="mt-2 min-h-24 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input
            value={productDraft.contentUrl}
            onChange={(event) =>
              setProductDraft((draft) => ({ ...draft, contentUrl: event.target.value }))
            }
            placeholder="Link privado de entrega"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={productDraft.coverUrl}
            onChange={(event) =>
              setProductDraft((draft) => ({ ...draft, coverUrl: event.target.value }))
            }
            placeholder="Imagen portada opcional"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => void sendProduct()}
          disabled={!data?.seller || busy === "product"}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy === "product" && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar a revision
        </button>
      </Card>

      <Section title="Mis productos">
        {data?.products.length ? (
          data.products.map((product) => (
            <Row key={product.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{product.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmt(product.amount, product.currency)} · {product.status}
                </p>
                {product.adminNote && (
                  <p className="mt-1 text-xs text-muted-foreground">{product.adminNote}</p>
                )}
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {product.active ? "Publicado" : "No publicado"}
              </span>
            </Row>
          ))
        ) : (
          <Empty text={loading ? "Cargando..." : "Sin productos enviados."} />
        )}
      </Section>

      <Section title="Retiros">
        <div className="grid gap-2 rounded-2xl px-3 py-3 md:grid-cols-[1fr_auto]">
          <input
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(Number(event.target.value) || 0)}
            type="number"
            min="1"
            step="1"
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
            Disponible para retirar:{" "}
            {fmt(data?.seller?.availableBalance ?? 0, data?.seller?.currency ?? "USD")}. Saldo
            total: {fmt(data?.seller?.balance ?? 0, data?.seller?.currency ?? "USD")}.
          </p>
          <button
            onClick={() => void withdraw()}
            disabled={!data?.seller || busy === "withdraw" || withdrawAmount <= 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {busy === "withdraw" && <Loader2 className="h-4 w-4 animate-spin" />}
            Pedir retiro
          </button>
        </div>
        {data?.withdrawals.length ? (
          data.withdrawals.map((withdrawal) => (
            <Row key={withdrawal.id}>
              <div>
                <p className="text-sm font-semibold">
                  {fmt(withdrawal.amount, withdrawal.currency)}
                </p>
                <p className="text-xs text-muted-foreground">{withdrawal.requestedAt}</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {withdrawal.status}
              </span>
            </Row>
          ))
        ) : (
          <Empty text="Sin retiros." />
        )}
      </Section>

      <Section title="Comprar a vendedores">
        {data?.publicProducts.length ? (
          data.publicProducts.map((product) => (
            <Row key={product.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{product.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {product.sellerName} · {fmt(product.amount, product.currency)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {product.description}
                </p>
              </div>
              <button
                onClick={() => void buy(product.id)}
                disabled={busy === product.id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy === product.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Comprar
              </button>
            </Row>
          ))
        ) : (
          <Empty text={loading ? "Cargando tienda..." : "Aun no hay productos aprobados."} />
        )}
      </Section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Store;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mt-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </Card>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-3">{children}</div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}
