import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  Database,
  FileText,
  Gift,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, fmt, PageHeader } from "@/components/ui-bits";
import {
  cancelAdminTransfer,
  getAdminDashboard,
  saveAdminAccessGrant,
  saveAdminPremiumContent,
  saveAdminPremiumEntitlement,
  saveAdminPremiumProduct,
  saveAdminVipPlan,
  updateAdminMovement,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

type AdminData = Awaited<ReturnType<typeof getAdminDashboard>>;
type AdminTransfer = NonNullable<AdminData>["transfers"][number];
type AdminMovementRow = NonNullable<AdminData>["movements"][number];
type AdminPremiumProductRow = NonNullable<AdminData>["premiumProducts"][number];
type AdminPremiumContentRow = NonNullable<AdminData>["premiumContent"][number];
type PremiumKind = "premium_content" | "telegram_store" | "stars_pack" | "crypto_external";
type PremiumContentType = "post" | "video" | "image" | "file" | "link" | "ai_prompt";
type PremiumAccessLevel = "free" | "paid" | "vip" | "stars";
type AdminRole = "owner" | "admin" | "support";
const ADMIN_WEB_KEY_STORAGE = "walletbred-admin-web-key";

function hasTelegramSession() {
  return Boolean(
    typeof window !== "undefined" &&
    (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData,
  );
}

function AdminPage() {
  const loadDashboard = useServerFn(getAdminDashboard);
  const cancelTransfer = useServerFn(cancelAdminTransfer);
  const savePlan = useServerFn(saveAdminVipPlan);
  const saveAccess = useServerFn(saveAdminAccessGrant);
  const saveProduct = useServerFn(saveAdminPremiumProduct);
  const saveContent = useServerFn(saveAdminPremiumContent);
  const saveEntitlement = useServerFn(saveAdminPremiumEntitlement);
  const updateMovement = useServerFn(updateAdminMovement);
  const loadDashboardRef = useRef(loadDashboard);
  const cancelTransferRef = useRef(cancelTransfer);
  const savePlanRef = useRef(savePlan);
  const saveAccessRef = useRef(saveAccess);
  const saveProductRef = useRef(saveProduct);
  const saveContentRef = useRef(saveContent);
  const saveEntitlementRef = useRef(saveEntitlement);
  const updateMovementRef = useRef(updateMovement);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelDraft, setCancelDraft] = useState<{
    transfer: AdminTransfer;
    reason: string;
  } | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [savingContentId, setSavingContentId] = useState<string | null>(null);
  const [savingEntitlementId, setSavingEntitlementId] = useState<string | null>(null);
  const [savingMovementId, setSavingMovementId] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("all");
  const [editingMovement, setEditingMovement] = useState<AdminMovementRow | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [needsWebKey, setNeedsWebKey] = useState(false);
  const [newAccess, setNewAccess] = useState<{
    label: string;
    telegramUserId: string;
    role: AdminRole;
    active: boolean;
  }>({
    label: "",
    telegramUserId: "",
    role: "admin",
    active: true,
  });
  const [newProduct, setNewProduct] = useState<{
    slug: string;
    title: string;
    description: string;
    kind: PremiumKind;
    amount: number;
    currency: string;
    starsAmount: number;
    stripePriceId: string;
    externalUrl: string;
    featured: boolean;
    active: boolean;
    sortOrder: number;
  }>({
    slug: "",
    title: "",
    description: "",
    kind: "premium_content",
    amount: 25,
    currency: "USD",
    starsAmount: 0,
    stripePriceId: "",
    externalUrl: "",
    featured: false,
    active: true,
    sortOrder: 100,
  });
  const [newContent, setNewContent] = useState<{
    productId: string;
    title: string;
    contentType: PremiumContentType;
    preview: string;
    contentUrl: string;
    accessLevel: PremiumAccessLevel;
    active: boolean;
    sortOrder: number;
  }>({
    productId: "",
    title: "",
    contentType: "post",
    preview: "",
    contentUrl: "",
    accessLevel: "paid",
    active: true,
    sortOrder: 100,
  });
  const [newEntitlement, setNewEntitlement] = useState<{
    productId: string;
    telegramUserId: string;
    webUserId: string;
    source: string;
    status: "active" | "expired" | "revoked" | "pending";
    expiresAt: string;
  }>({
    productId: "",
    telegramUserId: "",
    webUserId: "",
    source: "admin",
    status: "active",
    expiresAt: "",
  });

  const stats = useMemo(
    () => ({
      users: data?.users.length ?? 0,
      transfers: data?.transfers.length ?? 0,
      accesses: data?.accesses.length ?? 0,
      products: data?.premiumProducts.length ?? 0,
      content: data?.premiumContent.length ?? 0,
      files: data?.files.length ?? 0,
    }),
    [data],
  );
  const filteredMovements = useMemo(() => {
    if (!data) return [];
    if (selectedOwnerId === "all") return data.movements;
    return data.movements.filter((movement) => movement.ownerId === selectedOwnerId);
  }, [data, selectedOwnerId]);
  const transferStats = useMemo(
    () => ({
      cancelable: data?.transfers.filter((transfer) => transfer.canCancel).length ?? 0,
      canceled:
        data?.transfers.filter((transfer) => ["canceled", "cancelled"].includes(transfer.status))
          .length ?? 0,
    }),
    [data],
  );

  loadDashboardRef.current = loadDashboard;
  cancelTransferRef.current = cancelTransfer;
  savePlanRef.current = savePlan;
  saveAccessRef.current = saveAccess;
  saveProductRef.current = saveProduct;
  saveContentRef.current = saveContent;
  saveEntitlementRef.current = saveEntitlement;
  updateMovementRef.current = updateMovement;

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setData(await loadDashboardRef.current());
      setNeedsWebKey(false);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "No tienes acceso a este panel. Abre la app desde tu Telegram administrador.";
      setNeedsWebKey(text.toLowerCase().includes("codigo privado") || text.includes("401"));
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }, []);

  function unlockWebAccess() {
    const trimmed = adminKey.trim();
    if (!trimmed) {
      setMessage("Escribe tu codigo privado.");
      return;
    }
    window.localStorage.setItem(ADMIN_WEB_KEY_STORAGE, trimmed);
    setAdminKey("");
    void refresh();
  }

  async function cancel() {
    if (!cancelDraft) return;
    const reason = cancelDraft.reason.trim();
    if (reason.length < 4) {
      setMessage("Escribe un motivo de cancelacion mas claro.");
      return;
    }

    setCancelingId(cancelDraft.transfer.id);
    setMessage(null);
    try {
      const result = await cancelTransferRef.current({
        data: { movementId: cancelDraft.transfer.id, reason },
      });
      setMessage(
        result.alreadyCanceled
          ? "La transferencia ya estaba cancelada."
          : "Transferencia cancelada.",
      );
      setCancelDraft(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar.");
    } finally {
      setCancelingId(null);
    }
  }

  async function savePlanChanges(plan: NonNullable<AdminData>["plans"][number]) {
    setSavingPlanId(plan.id);
    setMessage(null);
    try {
      await savePlanRef.current({
        data: {
          planId: plan.id,
          name: plan.name,
          description: plan.description,
          amount: plan.amount,
          currency: plan.currency,
          stripePriceId: plan.stripePriceId,
          perks: plan.perks,
          featured: plan.featured,
          active: plan.active,
          sortOrder: plan.sortOrder,
        },
      });
      setMessage("Plan actualizado.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el plan.");
    } finally {
      setSavingPlanId(null);
    }
  }

  async function saveAccessGrant(access: {
    id?: string;
    label: string;
    telegramUserId: string;
    role: AdminRole;
    active: boolean;
  }) {
    setSavingAccessId(access.id ?? "new");
    setMessage(null);
    try {
      await saveAccessRef.current({ data: access });
      setMessage("Acceso admin actualizado.");
      if (!access.id) {
        setNewAccess({ label: "", telegramUserId: "", role: "admin", active: true });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el acceso.");
    } finally {
      setSavingAccessId(null);
    }
  }

  async function savePremiumProduct(
    product: Omit<AdminPremiumProductRow, "id" | "updatedAt"> & {
      id?: string;
    },
  ) {
    setSavingProductId(product.id ?? "new");
    setMessage(null);
    try {
      await saveProductRef.current({ data: product });
      setMessage("Producto premium actualizado.");
      if (!product.id) {
        setNewProduct({
          slug: "",
          title: "",
          description: "",
          kind: "premium_content",
          amount: 25,
          currency: "USD",
          starsAmount: 0,
          stripePriceId: "",
          externalUrl: "",
          featured: false,
          active: true,
          sortOrder: 100,
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      setSavingProductId(null);
    }
  }

  async function savePremiumContent(
    content: Omit<AdminPremiumContentRow, "id" | "updatedAt"> & {
      id?: string;
    },
  ) {
    setSavingContentId(content.id ?? "new");
    setMessage(null);
    try {
      await saveContentRef.current({ data: content });
      setMessage("Contenido premium actualizado.");
      if (!content.id) {
        setNewContent({
          productId: "",
          title: "",
          contentType: "post",
          preview: "",
          contentUrl: "",
          accessLevel: "paid",
          active: true,
          sortOrder: 100,
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el contenido.");
    } finally {
      setSavingContentId(null);
    }
  }

  async function grantPremiumEntitlement() {
    if (!newEntitlement.productId) {
      setMessage("Elige un producto antes de dar acceso.");
      return;
    }

    setSavingEntitlementId("new");
    setMessage(null);
    try {
      await saveEntitlementRef.current({ data: newEntitlement });
      setMessage("Acceso premium guardado.");
      setNewEntitlement({
        productId: "",
        telegramUserId: "",
        webUserId: "",
        source: "admin",
        status: "active",
        expiresAt: "",
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo dar acceso premium.");
    } finally {
      setSavingEntitlementId(null);
    }
  }

  async function saveMovementChanges(movement: AdminMovementRow) {
    setSavingMovementId(movement.id);
    setMessage(null);
    try {
      await updateMovementRef.current({
        data: {
          movementId: movement.id,
          title: movement.title,
          recipient: movement.recipient,
          amount: movement.amount,
          currency: movement.currency,
          status: movement.status,
          type: movement.type,
        },
      });
      setMessage("Movimiento actualizado.");
      setEditingMovement(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el movimiento.");
    } finally {
      setSavingMovementId(null);
    }
  }

  useEffect(() => {
    if (!hasTelegramSession()) {
      window.localStorage.removeItem(ADMIN_WEB_KEY_STORAGE);
      setNeedsWebKey(true);
      setLoading(false);
      setMessage("Escribe tu codigo privado para entrar al panel.");
      return;
    }

    void refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader title="Panel privado" subtitle="Usuarios, archivos, accesos y cancelaciones" />

      <Card>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Acceso solo del dueno</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Esta vista se valida en servidor con tu usuario administrador de Telegram.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </Card>

      {message && (
        <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}

      {needsWebKey && (
        <Card className="mt-4">
          <p className="text-sm font-semibold">Entrar desde navegador</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Usa tu codigo privado de dueno. Los clientes no pueden entrar a este panel.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") unlockWebAccess();
              }}
              type="password"
              placeholder="Codigo privado"
              className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={unlockWebAccess}
              className="rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Entrar
            </button>
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Users} label="Usuarios" value={stats.users} />
        <Metric icon={Ban} label="Transferencias" value={stats.transfers} />
        <Metric icon={Package} label="Productos" value={stats.products} />
        <Metric icon={FileText} label="Contenido" value={stats.content} />
      </div>

      <AdminSection title="Usuarios reales" icon={Users}>
        {data?.users.length ? (
          data.users.map((user) => (
            <Row key={user.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.source} · {user.movements} movimientos · {user.plan}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{fmt(user.balance, user.currency)}</p>
                <p className="text-xs text-muted-foreground">{user.accessStatus}</p>
                <button
                  onClick={() => setSelectedOwnerId(user.id)}
                  className="mt-2 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                >
                  Ver movimientos
                </button>
              </div>
            </Row>
          ))
        ) : (
          <Empty text={loading ? "Cargando usuarios..." : "Sin usuarios registrados."} />
        )}
      </AdminSection>

      <AdminSection title={`Movimientos de usuarios · ${filteredMovements.length}`} icon={Pencil}>
        <div className="grid gap-2 rounded-2xl px-3 py-3 md:grid-cols-[1fr_auto]">
          <select
            value={selectedOwnerId}
            onChange={(event) => setSelectedOwnerId(event.target.value)}
            className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="all">Todos los usuarios</option>
            {data?.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label} · {user.movements} movimientos
              </option>
            ))}
          </select>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
        {filteredMovements.length ? (
          filteredMovements.map((movement) => (
            <MovementAdminRow
              key={movement.id}
              movement={movement}
              saving={savingMovementId === movement.id}
              onEdit={() => setEditingMovement(movement)}
            />
          ))
        ) : (
          <Empty
            text={loading ? "Cargando movimientos..." : "Sin movimientos para este usuario."}
          />
        )}
      </AdminSection>

      <AdminSection
        title={`Cancelar transferencias · ${transferStats.cancelable} disponibles · ${transferStats.canceled} canceladas`}
        icon={Ban}
      >
        {data?.transfers.length ? (
          data.transfers.map((transfer) => (
            <TransferRow
              key={transfer.id}
              transfer={transfer}
              canceling={cancelingId === transfer.id}
              onCancel={() =>
                setCancelDraft({
                  transfer,
                  reason: transfer.cancelReason ?? "Cancelada por revision del dueno",
                })
              }
            />
          ))
        ) : (
          <Empty text={loading ? "Cargando transferencias..." : "Sin transferencias."} />
        )}
      </AdminSection>

      {cancelDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-4 pt-20 backdrop-blur-sm md:items-center md:pb-0">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">Cancelar transferencia</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Esta accion cambia el estado a cancelada y deja el motivo visible en el historial
                  privado.
                </p>
              </div>
              <button
                onClick={() => setCancelDraft(null)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{cancelDraft.transfer.title}</span>
                <span className="shrink-0 font-semibold">
                  {fmt(cancelDraft.transfer.amount, cancelDraft.transfer.currency)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {cancelDraft.transfer.owner} · {cancelDraft.transfer.recipient ?? "sin destino"} ·{" "}
                {cancelDraft.transfer.statusLabel}
              </p>
            </div>

            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">
              Motivo
            </label>
            <textarea
              value={cancelDraft.reason}
              onChange={(event) =>
                setCancelDraft((draft) =>
                  draft ? { ...draft, reason: event.target.value.slice(0, 180) } : draft,
                )
              }
              className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="Ej. Dato incorrecto, sospecha de fraude o solicitud del usuario"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setCancelDraft(null)}
                className="flex-1 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold"
              >
                Volver
              </button>
              <button
                onClick={() => void cancel()}
                disabled={cancelingId === cancelDraft.transfer.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive/20 px-4 py-3 text-sm font-semibold text-destructive disabled:opacity-60"
              >
                {cancelingId === cancelDraft.transfer.id && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Confirmar cancelacion
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMovement && (
        <MovementEditModal
          movement={editingMovement}
          saving={savingMovementId === editingMovement.id}
          onClose={() => setEditingMovement(null)}
          onChange={setEditingMovement}
          onSave={() => void saveMovementChanges(editingMovement)}
        />
      )}

      <AdminSection title="Accesos VIP" icon={KeyRound}>
        {data?.accesses.length ? (
          data.accesses.map((access) => (
            <Row key={access.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{access.user}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {access.plan} · {access.stripeSubscriptionId ?? "sin Stripe ID"}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {access.status}
              </span>
            </Row>
          ))
        ) : (
          <Empty text={loading ? "Cargando accesos..." : "Sin accesos VIP."} />
        )}
      </AdminSection>

      <AdminSection title="Planes y precios" icon={Settings}>
        {data?.plans.length ? (
          data.plans.map((plan) => (
            <PlanEditor
              key={plan.id}
              plan={plan}
              saving={savingPlanId === plan.id}
              onChange={(nextPlan) => {
                setData((current) =>
                  current
                    ? {
                        ...current,
                        plans: current.plans.map((item) =>
                          item.id === nextPlan.id ? nextPlan : item,
                        ),
                      }
                    : current,
                );
              }}
              onSave={() => void savePlanChanges(plan)}
            />
          ))
        ) : (
          <Empty text={loading ? "Cargando planes..." : "Sin planes configurados."} />
        )}
      </AdminSection>

      <AdminSection title="Productos premium" icon={Package}>
        <div className="rounded-2xl px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_150px_110px_auto]">
            <input
              value={newProduct.title}
              onChange={(event) =>
                setNewProduct((draft) => ({
                  ...draft,
                  title: event.target.value,
                  slug: draft.slug || slugify(event.target.value),
                }))
              }
              placeholder="Nombre del producto"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newProduct.slug}
              onChange={(event) =>
                setNewProduct((draft) => ({ ...draft, slug: slugify(event.target.value) }))
              }
              placeholder="slug-del-producto"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={newProduct.kind}
              onChange={(event) =>
                setNewProduct((draft) => ({
                  ...draft,
                  kind: event.target.value as PremiumKind,
                }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="premium_content">Contenido</option>
              <option value="telegram_store">Telegram Store</option>
              <option value="stars_pack">Stars</option>
              <option value="crypto_external">Crypto externo</option>
            </select>
            <input
              value={newProduct.amount}
              onChange={(event) =>
                setNewProduct((draft) => ({ ...draft, amount: Number(event.target.value) || 0 }))
              }
              type="number"
              min="1"
              step="1"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => void savePremiumProduct(newProduct)}
              disabled={savingProductId === "new"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingProductId === "new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Agregar
            </button>
          </div>
          <textarea
            value={newProduct.description}
            onChange={(event) =>
              setNewProduct((draft) => ({ ...draft, description: event.target.value }))
            }
            placeholder="Descripcion visible para tienda, bot o contenido premium"
            className="mt-2 min-h-16 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 grid gap-2 md:grid-cols-[90px_120px_1fr_1fr_100px_100px]">
            <input
              value={newProduct.currency}
              onChange={(event) =>
                setNewProduct((draft) => ({
                  ...draft,
                  currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                }))
              }
              maxLength={3}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newProduct.starsAmount}
              onChange={(event) =>
                setNewProduct((draft) => ({
                  ...draft,
                  starsAmount: Number(event.target.value) || 0,
                }))
              }
              type="number"
              min="0"
              placeholder="Stars"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newProduct.stripePriceId}
              onChange={(event) =>
                setNewProduct((draft) => ({ ...draft, stripePriceId: event.target.value }))
              }
              placeholder="price_... opcional"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newProduct.externalUrl}
              onChange={(event) =>
                setNewProduct((draft) => ({ ...draft, externalUrl: event.target.value }))
              }
              placeholder="https:// proveedor externo"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
              <input
                checked={newProduct.featured}
                onChange={(event) =>
                  setNewProduct((draft) => ({ ...draft, featured: event.target.checked }))
                }
                type="checkbox"
              />
              Popular
            </label>
            <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
              <input
                checked={newProduct.active}
                onChange={(event) =>
                  setNewProduct((draft) => ({ ...draft, active: event.target.checked }))
                }
                type="checkbox"
              />
              Activo
            </label>
          </div>
        </div>
        {data?.premiumProducts.length ? (
          data.premiumProducts.map((product) => (
            <PremiumProductEditor
              key={product.id}
              product={product}
              saving={savingProductId === product.id}
              onChange={(nextProduct) => {
                setData((current) =>
                  current
                    ? {
                        ...current,
                        premiumProducts: current.premiumProducts.map((item) =>
                          item.id === nextProduct.id ? nextProduct : item,
                        ),
                      }
                    : current,
                );
              }}
              onSave={() => void savePremiumProduct(product)}
            />
          ))
        ) : (
          <Empty text={loading ? "Cargando productos..." : "Sin productos premium."} />
        )}
      </AdminSection>

      <AdminSection title="Contenido premium" icon={Gift}>
        <div className="rounded-2xl px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_120px_auto]">
            <input
              value={newContent.title}
              onChange={(event) =>
                setNewContent((draft) => ({ ...draft, title: event.target.value }))
              }
              placeholder="Titulo del contenido"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={newContent.productId}
              onChange={(event) =>
                setNewContent((draft) => ({ ...draft, productId: event.target.value }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Sin producto asociado</option>
              {data?.premiumProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            <select
              value={newContent.contentType}
              onChange={(event) =>
                setNewContent((draft) => ({
                  ...draft,
                  contentType: event.target.value as PremiumContentType,
                }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="post">Post</option>
              <option value="video">Video</option>
              <option value="image">Imagen</option>
              <option value="file">Archivo</option>
              <option value="link">Link</option>
              <option value="ai_prompt">Prompt IA</option>
            </select>
            <select
              value={newContent.accessLevel}
              onChange={(event) =>
                setNewContent((draft) => ({
                  ...draft,
                  accessLevel: event.target.value as PremiumAccessLevel,
                }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="paid">Pagado</option>
              <option value="vip">VIP</option>
              <option value="stars">Stars</option>
              <option value="free">Gratis</option>
            </select>
            <button
              onClick={() => void savePremiumContent(newContent)}
              disabled={savingContentId === "new"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingContentId === "new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Agregar
            </button>
          </div>
          <textarea
            value={newContent.preview}
            onChange={(event) =>
              setNewContent((draft) => ({ ...draft, preview: event.target.value }))
            }
            placeholder="Resumen o preview del contenido"
            className="mt-2 min-h-16 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={newContent.contentUrl}
            onChange={(event) =>
              setNewContent((draft) => ({ ...draft, contentUrl: event.target.value }))
            }
            placeholder="URL del contenido o archivo"
            className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        {data?.premiumContent.length ? (
          data.premiumContent.map((content) => (
            <PremiumContentEditor
              key={content.id}
              content={content}
              products={data.premiumProducts}
              saving={savingContentId === content.id}
              onChange={(nextContent) => {
                setData((current) =>
                  current
                    ? {
                        ...current,
                        premiumContent: current.premiumContent.map((item) =>
                          item.id === nextContent.id ? nextContent : item,
                        ),
                      }
                    : current,
                );
              }}
              onSave={() => void savePremiumContent(content)}
            />
          ))
        ) : (
          <Empty text={loading ? "Cargando contenido..." : "Sin contenido premium."} />
        )}
      </AdminSection>

      <AdminSection title="Accesos premium de usuarios" icon={KeyRound}>
        <div className="rounded-2xl px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_150px_1fr_120px_auto]">
            <select
              value={newEntitlement.productId}
              onChange={(event) =>
                setNewEntitlement((draft) => ({ ...draft, productId: event.target.value }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Elige producto</option>
              {data?.premiumProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            <input
              value={newEntitlement.telegramUserId}
              onChange={(event) =>
                setNewEntitlement((draft) => ({
                  ...draft,
                  telegramUserId: event.target.value.replace(/\D/g, ""),
                }))
              }
              inputMode="numeric"
              placeholder="Telegram ID"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newEntitlement.webUserId}
              onChange={(event) =>
                setNewEntitlement((draft) => ({ ...draft, webUserId: event.target.value }))
              }
              placeholder="Web User ID opcional"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={newEntitlement.status}
              onChange={(event) =>
                setNewEntitlement((draft) => ({
                  ...draft,
                  status: event.target.value as typeof newEntitlement.status,
                }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="active">Activo</option>
              <option value="pending">Pendiente</option>
              <option value="expired">Expirado</option>
              <option value="revoked">Revocado</option>
            </select>
            <button
              onClick={() => void grantPremiumEntitlement()}
              disabled={savingEntitlementId === "new"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingEntitlementId === "new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Dar acceso
            </button>
          </div>
        </div>
        {data?.premiumEntitlements.length ? (
          data.premiumEntitlements.map((entitlement) => {
            const product = data.premiumProducts.find((item) => item.id === entitlement.productId);
            return (
              <Row key={entitlement.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {product?.title ?? "Producto eliminado"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entitlement.telegramUserId
                      ? `Telegram ${entitlement.telegramUserId}`
                      : entitlement.webUserId}{" "}
                    · {entitlement.source}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {entitlement.status}
                </span>
              </Row>
            );
          })
        ) : (
          <Empty text={loading ? "Cargando accesos premium..." : "Sin accesos premium."} />
        )}
      </AdminSection>

      <AdminSection title="Otros accesos admin" icon={ShieldCheck}>
        <div className="rounded-2xl px-3 py-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Agrega Telegram IDs de personas que tambien podran entrar al panel desde Telegram. La
            clave web privada sigue protegida por variable de entorno.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
            <input
              value={newAccess.label}
              onChange={(event) =>
                setNewAccess((draft) => ({ ...draft, label: event.target.value }))
              }
              placeholder="Nombre del acceso"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newAccess.telegramUserId}
              onChange={(event) =>
                setNewAccess((draft) => ({ ...draft, telegramUserId: event.target.value }))
              }
              inputMode="numeric"
              placeholder="Telegram ID"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={newAccess.role}
              onChange={(event) =>
                setNewAccess((draft) => ({
                  ...draft,
                  role: event.target.value as AdminRole,
                }))
              }
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="admin">Admin</option>
              <option value="support">Soporte</option>
              <option value="owner">Dueno</option>
            </select>
            <button
              onClick={() => void saveAccessGrant(newAccess)}
              disabled={savingAccessId === "new"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingAccessId === "new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Agregar
            </button>
          </div>
        </div>
        {data?.adminAccesses.length ? (
          data.adminAccesses.map((access) => (
            <AccessRow
              key={access.id}
              access={access}
              saving={savingAccessId === access.id}
              onSave={(nextAccess) => void saveAccessGrant(nextAccess)}
            />
          ))
        ) : (
          <Empty text={loading ? "Cargando accesos admin..." : "Sin accesos admin extras."} />
        )}
      </AdminSection>

      <AdminSection title="Archivos Supabase" icon={Database}>
        {data?.files.length ? (
          data.files.map((file) => (
            <Row key={`${file.bucket}-${file.name}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {file.bucket} · {file.updatedAt ?? "sin fecha"}
                </p>
              </div>
            </Row>
          ))
        ) : (
          <Empty text={loading ? "Cargando archivos..." : "Sin archivos visibles."} />
        )}
      </AdminSection>
    </div>
  );
}

function MovementAdminRow({
  movement,
  saving,
  onEdit,
}: {
  movement: AdminMovementRow;
  saving: boolean;
  onEdit: () => void;
}) {
  const isOut = movement.direction === "out";
  return (
    <div className="rounded-2xl px-3 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-bold ${
            isOut ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"
          }`}
        >
          {isOut ? "-" : "+"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{movement.title}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {movement.statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {movement.owner} · {movement.type} · {movement.recipient || "sin destino"} ·{" "}
            {new Date(movement.createdAt).toLocaleString("es-MX")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold">{fmt(movement.amount, movement.currency)}</span>
          <button
            onClick={onEdit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Cambiar
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementEditModal({
  movement,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  movement: AdminMovementRow;
  saving: boolean;
  onClose: () => void;
  onChange: (movement: AdminMovementRow) => void;
  onSave: () => void;
}) {
  const update = (patch: Partial<AdminMovementRow>) => onChange({ ...movement, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-4 pt-20 backdrop-blur-sm md:items-center md:pb-0">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Cambiar movimiento</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Edita el registro del usuario. El balance se recalcula con monto, tipo y estado.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Titulo
            <input
              value={movement.title}
              onChange={(event) => update({ title: event.target.value })}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Usuario
            <input
              value={movement.owner}
              disabled
              className="mt-1 w-full rounded-2xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Tipo
            <input
              value={movement.type}
              onChange={(event) => update({ type: event.target.value.replace(/[^a-z0-9_-]/g, "") })}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Estado
            <select
              value={movement.status}
              onChange={(event) => update({ status: event.target.value })}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {["completed", "pending", "processing", "review", "canceled", "failed", "unpaid"].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Monto
            <input
              value={movement.amount}
              onChange={(event) => update({ amount: Number(event.target.value) || 0 })}
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Moneda
            <input
              value={movement.currency}
              onChange={(event) =>
                update({ currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
              }
              maxLength={3}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
            Destino o referencia
            <input
              value={movement.recipient}
              onChange={(event) => update({ recipient: event.target.value })}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold"
          >
            Volver
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambio
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferRow({
  transfer,
  canceling,
  onCancel,
}: {
  transfer: AdminTransfer;
  canceling: boolean;
  onCancel: () => void;
}) {
  const isCanceled = ["canceled", "cancelled"].includes(transfer.status);
  return (
    <div className="rounded-2xl px-3 py-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{transfer.title}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isCanceled
                  ? "bg-destructive/15 text-destructive"
                  : transfer.canCancel
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {transfer.statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {transfer.owner} · {transfer.recipient ?? "sin destino"} ·{" "}
            {new Date(transfer.createdAt).toLocaleString("es-MX")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold">{fmt(transfer.amount, transfer.currency)}</span>
          <button
            onClick={onCancel}
            disabled={!transfer.canCancel || canceling}
            className="rounded-xl bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-40"
          >
            {canceling ? "..." : isCanceled ? "Cancelada" : "Cancelar"}
          </button>
        </div>
      </div>
      {isCanceled && (
        <div className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
          <p className="font-semibold">Motivo: {transfer.cancelReason ?? "Sin motivo guardado"}</p>
          <p className="opacity-80">
            {transfer.canceledAt
              ? `Cancelada ${new Date(transfer.canceledAt).toLocaleString("es-MX")}`
              : "Cancelada sin fecha"}{" "}
            {transfer.canceledBy ? `por ${transfer.canceledBy}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function PlanEditor({
  plan,
  saving,
  onChange,
  onSave,
}: {
  plan: NonNullable<AdminData>["plans"][number];
  saving: boolean;
  onChange: (plan: NonNullable<AdminData>["plans"][number]) => void;
  onSave: () => void;
}) {
  const update = (patch: Partial<typeof plan>) => onChange({ ...plan, ...patch });

  return (
    <div className="rounded-2xl px-3 py-4">
      <div className="grid gap-2 md:grid-cols-[1fr_120px_1fr_auto]">
        <input
          value={plan.name}
          onChange={(event) => update({ name: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
        />
        <input
          value={plan.amount}
          onChange={(event) => update({ amount: Number(event.target.value) || 0 })}
          type="number"
          min="1"
          step="1"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={plan.stripePriceId}
          onChange={(event) => update({ stripePriceId: event.target.value })}
          placeholder="price_... opcional"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>
      <textarea
        value={plan.description}
        onChange={(event) => update({ description: event.target.value })}
        placeholder="Descripcion del plan"
        className="mt-2 min-h-20 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_100px_100px_auto_auto]">
        <input
          value={plan.perks.join(", ")}
          onChange={(event) =>
            update({
              perks: event.target.value
                .split(",")
                .map((perk) => perk.trim())
                .filter(Boolean),
            })
          }
          placeholder="Beneficios separados por coma"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={plan.currency}
          onChange={(event) => update({ currency: event.target.value.toUpperCase() })}
          maxLength={3}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={plan.sortOrder}
          onChange={(event) => update({ sortOrder: Number(event.target.value) || 0 })}
          type="number"
          min="0"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
          <input
            checked={plan.featured}
            onChange={(event) => update({ featured: event.target.checked })}
            type="checkbox"
          />
          Popular
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
          <input
            checked={plan.active}
            onChange={(event) => update({ active: event.target.checked })}
            type="checkbox"
          />
          Activo
        </label>
      </div>
    </div>
  );
}

function PremiumProductEditor({
  product,
  saving,
  onChange,
  onSave,
}: {
  product: AdminPremiumProductRow;
  saving: boolean;
  onChange: (product: AdminPremiumProductRow) => void;
  onSave: () => void;
}) {
  const update = (patch: Partial<AdminPremiumProductRow>) => onChange({ ...product, ...patch });

  return (
    <div className="rounded-2xl px-3 py-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_150px_110px_auto]">
        <input
          value={product.title}
          onChange={(event) => update({ title: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
        />
        <input
          value={product.slug}
          onChange={(event) => update({ slug: slugify(event.target.value) })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <select
          value={product.kind}
          onChange={(event) => update({ kind: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="premium_content">Contenido</option>
          <option value="telegram_store">Telegram Store</option>
          <option value="stars_pack">Stars</option>
          <option value="crypto_external">Crypto externo</option>
        </select>
        <input
          value={product.amount}
          onChange={(event) => update({ amount: Number(event.target.value) || 0 })}
          type="number"
          min="1"
          step="1"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>
      <textarea
        value={product.description}
        onChange={(event) => update({ description: event.target.value })}
        className="mt-2 min-h-16 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 grid gap-2 md:grid-cols-[90px_120px_1fr_1fr_90px_100px_100px]">
        <input
          value={product.currency}
          onChange={(event) =>
            update({ currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
          }
          maxLength={3}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={product.starsAmount}
          onChange={(event) => update({ starsAmount: Number(event.target.value) || 0 })}
          type="number"
          min="0"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={product.stripePriceId}
          onChange={(event) => update({ stripePriceId: event.target.value })}
          placeholder="price_..."
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={product.externalUrl}
          onChange={(event) => update({ externalUrl: event.target.value })}
          placeholder="https://"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={product.sortOrder}
          onChange={(event) => update({ sortOrder: Number(event.target.value) || 0 })}
          type="number"
          min="0"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
          <input
            checked={product.featured}
            onChange={(event) => update({ featured: event.target.checked })}
            type="checkbox"
          />
          Popular
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
          <input
            checked={product.active}
            onChange={(event) => update({ active: event.target.checked })}
            type="checkbox"
          />
          Activo
        </label>
      </div>
    </div>
  );
}

function PremiumContentEditor({
  content,
  products,
  saving,
  onChange,
  onSave,
}: {
  content: AdminPremiumContentRow;
  products: AdminPremiumProductRow[];
  saving: boolean;
  onChange: (content: AdminPremiumContentRow) => void;
  onSave: () => void;
}) {
  const update = (patch: Partial<AdminPremiumContentRow>) => onChange({ ...content, ...patch });

  return (
    <div className="rounded-2xl px-3 py-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_120px_auto]">
        <input
          value={content.title}
          onChange={(event) => update({ title: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
        />
        <select
          value={content.productId}
          onChange={(event) => update({ productId: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">Sin producto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.title}
            </option>
          ))}
        </select>
        <select
          value={content.contentType}
          onChange={(event) => update({ contentType: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="post">Post</option>
          <option value="video">Video</option>
          <option value="image">Imagen</option>
          <option value="file">Archivo</option>
          <option value="link">Link</option>
          <option value="ai_prompt">Prompt IA</option>
        </select>
        <select
          value={content.accessLevel}
          onChange={(event) => update({ accessLevel: event.target.value })}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="paid">Pagado</option>
          <option value="vip">VIP</option>
          <option value="stars">Stars</option>
          <option value="free">Gratis</option>
        </select>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>
      <textarea
        value={content.preview}
        onChange={(event) => update({ preview: event.target.value })}
        className="mt-2 min-h-16 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_90px_100px]">
        <input
          value={content.contentUrl}
          onChange={(event) => update({ contentUrl: event.target.value })}
          placeholder="URL del contenido"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={content.sortOrder}
          onChange={(event) => update({ sortOrder: Number(event.target.value) || 0 })}
          type="number"
          min="0"
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
          <input
            checked={content.active}
            onChange={(event) => update({ active: event.target.checked })}
            type="checkbox"
          />
          Activo
        </label>
      </div>
    </div>
  );
}

function AccessRow({
  access,
  saving,
  onSave,
}: {
  access: NonNullable<AdminData>["adminAccesses"][number];
  saving: boolean;
  onSave: (access: {
    id: string;
    label: string;
    telegramUserId: string;
    role: AdminRole;
    active: boolean;
  }) => void;
}) {
  const [draft, setDraft] = useState({
    ...access,
    role: access.role as AdminRole,
  });

  useEffect(() => {
    setDraft({ ...access, role: access.role as AdminRole });
  }, [access]);

  return (
    <div className="grid gap-2 rounded-2xl px-3 py-3 md:grid-cols-[1fr_1fr_120px_auto_auto]">
      <input
        value={draft.label}
        onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
        className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <input
        value={draft.telegramUserId}
        onChange={(event) =>
          setDraft((current) => ({ ...current, telegramUserId: event.target.value }))
        }
        inputMode="numeric"
        className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <select
        value={draft.role}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            role: event.target.value as AdminRole,
          }))
        }
        className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        <option value="owner">Dueno</option>
        <option value="admin">Admin</option>
        <option value="support">Soporte</option>
      </select>
      <label className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold">
        <input
          checked={draft.active}
          onChange={(event) =>
            setDraft((current) => ({ ...current, active: event.target.checked }))
          }
          type="checkbox"
        />
        Activo
      </label>
      <button
        onClick={() => onSave(draft)}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar
      </button>
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl glass p-4 shadow-card">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 font-display text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function AdminSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      <div className="rounded-3xl glass p-2 shadow-card">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm">{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
