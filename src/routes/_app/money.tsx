import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  PiggyBank,
  Plus,
  Repeat,
  ShieldCheck,
  Snowflake,
  Trash2,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, fmt, PageHeader } from "@/components/ui-bits";
import { isDemoMode, useWalletSnapshot } from "@/hooks/use-wallet";
import { createWalletMovement } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_app/money")({
  component: MoneyPage,
});

type CardSettings = {
  frozen: boolean;
  online: boolean;
  atm: boolean;
  contactless: boolean;
  monthlyLimit: number;
};

type Pocket = {
  id: string;
  name: string;
  target: number;
  saved: number;
};

const CARD_STORAGE = "walletbred-card-settings";
const POCKETS_STORAGE = "walletbred-pockets";
const rates: Record<string, number> = {
  EUR: 0.92,
  GBP: 0.79,
  MXN: 18.3,
  BRL: 5.44,
};

const defaultCardSettings: CardSettings = {
  frozen: false,
  online: true,
  atm: false,
  contactless: true,
  monthlyLimit: 500,
};

function MoneyPage() {
  const { snapshot, refresh } = useWalletSnapshot();
  const createMovement = useServerFn(createWalletMovement);
  const [card, setCard] = useStoredState<CardSettings>(CARD_STORAGE, defaultCardSettings);
  const [pockets, setPockets] = useStoredState<Pocket[]>(POCKETS_STORAGE, []);
  const [showCard, setShowCard] = useState(false);
  const [newPocket, setNewPocket] = useState({ name: "", target: "500" });
  const [pocketAmount, setPocketAmount] = useState<Record<string, string>>({});
  const [fromAmount, setFromAmount] = useState("100");
  const [toCurrency, setToCurrency] = useState("EUR");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const spending = useMemo(() => {
    const out = snapshot.transactions.filter((tx) => tx.type === "out");
    const total = out.reduce((sum, tx) => sum + tx.amount, 0);
    const byCategory = out.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.category] = (acc[tx.category] ?? 0) + tx.amount;
      return acc;
    }, {});
    return { total, byCategory };
  }, [snapshot.transactions]);

  const converted = Number(fromAmount || "0") * rates[toCurrency];
  const availableAfterPockets =
    snapshot.balance - pockets.reduce((sum, pocket) => sum + pocket.saved, 0);

  function updateCard(patch: Partial<CardSettings>) {
    setCard((current) => ({ ...current, ...patch }));
  }

  function addPocket() {
    const target = Number(newPocket.target);
    if (!newPocket.name.trim() || !Number.isFinite(target) || target <= 0) {
      setMessage("Escribe nombre y meta valida.");
      return;
    }

    setPockets((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: newPocket.name.trim(),
        target,
        saved: 0,
      },
    ]);
    setNewPocket({ name: "", target: "500" });
    setMessage("Pocket creada.");
  }

  function fundPocket(id: string) {
    const amount = Number(pocketAmount[id] || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Escribe un monto valido.");
      return;
    }
    if (amount > availableAfterPockets) {
      setMessage("No hay saldo suficiente disponible.");
      return;
    }

    setPockets((current) =>
      current.map((pocket) =>
        pocket.id === id
          ? { ...pocket, saved: Math.min(pocket.target, pocket.saved + amount) }
          : pocket,
      ),
    );
    setPocketAmount((current) => ({ ...current, [id]: "" }));
    setMessage("Dinero apartado en pocket.");
  }

  function deletePocket(id: string) {
    setPockets((current) => current.filter((pocket) => pocket.id !== id));
  }

  async function convert() {
    const amount = Number(fromAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Escribe un monto valido para convertir.");
      return;
    }
    if (isDemoMode()) {
      setMessage("En demo no se registran conversiones reales.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      await createMovement({
        data: {
          kind: "convert",
          amount,
          currency: "USD",
          note: toCurrency,
        },
      });
      setMessage(`Conversion registrada: ${fmt(amount)} a ${fmt(converted, toCurrency)}.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar la conversion.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader title="Plus" subtitle="Tarjetas, pockets, exchange y control de gastos" />

      {message && (
        <p
          role="status"
          className="mb-4 rounded-2xl bg-muted/70 px-4 py-3 text-center text-xs text-muted-foreground"
        >
          {message}
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <PlusMetric
          icon={PiggyBank}
          label="Saldo libre"
          value={fmt(Math.max(availableAfterPockets, 0))}
        />
        <PlusMetric
          icon={BarChart3}
          label="Apartado"
          value={fmt(pockets.reduce((sum, pocket) => sum + pocket.saved, 0))}
        />
        <PlusMetric icon={Lock} label="Tarjeta" value={card.frozen ? "Congelada" : "Activa"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Tarjeta virtual</p>
              <p className="mt-1 text-xs text-muted-foreground">Controles rapidos de seguridad</p>
            </div>
            <button
              onClick={() => setShowCard((current) => !current)}
              aria-label={showCard ? "Ocultar datos de tarjeta" : "Mostrar datos de tarjeta"}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
            >
              {showCard ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-4 rounded-3xl bg-gradient-to-br from-zinc-950 via-neutral-800 to-teal-900 p-5 text-white shadow-card">
            <div className="flex items-center justify-between">
              <CreditCard className="h-6 w-6" />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
                {card.frozen ? "Congelada" : "Activa"}
              </span>
            </div>
            <p className="mt-10 font-display text-xl font-bold tracking-widest">
              {showCard ? "4829 1048 7712 3409" : "•••• •••• •••• 3409"}
            </p>
            <div className="mt-5 flex items-end justify-between text-xs">
              <div>
                <p className="text-white/60">WalletBRED</p>
                <p className="font-semibold">{snapshot.user.name}</p>
              </div>
              <p>{showCard ? "08/29" : "••/••"}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ToggleRow
              icon={Snowflake}
              label="Congelar tarjeta"
              checked={card.frozen}
              onChange={(checked) => updateCard({ frozen: checked })}
            />
            <ToggleRow
              icon={Wifi}
              label="Pagos online"
              checked={card.online}
              onChange={(checked) => updateCard({ online: checked })}
            />
            <ToggleRow
              icon={CreditCard}
              label="Cajero ATM"
              checked={card.atm}
              onChange={(checked) => updateCard({ atm: checked })}
            />
            <ToggleRow
              icon={ShieldCheck}
              label="Contactless"
              checked={card.contactless}
              onChange={(checked) => updateCard({ contactless: checked })}
            />
          </div>

          <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">
            Limite mensual
          </label>
          <input
            value={card.monthlyLimit}
            onChange={(event) => updateCard({ monthlyLimit: Number(event.target.value) || 0 })}
            type="number"
            min="0"
            className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Card>

        <Card>
          <p className="text-sm font-semibold">Analitica</p>
          <p className="mt-1 text-xs text-muted-foreground">Gastos segun movimientos reales</p>
          <div className="mt-4 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Gastado</span>
              <span className="font-display text-2xl font-bold">{fmt(spending.total)}</span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(spending.byCategory).length ? (
              Object.entries(spending.byCategory).map(([category, amount]) => (
                <CategoryBar
                  key={category}
                  label={category}
                  amount={amount}
                  total={spending.total}
                />
              ))
            ) : (
              <p className="rounded-2xl bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                Aun no hay gastos para analizar.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Pockets</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aparta saldo visualmente para metas.
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              Libre {fmt(Math.max(availableAfterPockets, 0))}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
            <input
              value={newPocket.name}
              onChange={(event) =>
                setNewPocket((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nombre de meta"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={newPocket.target}
              onChange={(event) =>
                setNewPocket((current) => ({
                  ...current,
                  target: event.target.value.replace(/[^0-9.]/g, ""),
                }))
              }
              inputMode="decimal"
              placeholder="Meta"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={addPocket}
              className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {pockets.length ? (
              pockets.map((pocket) => (
                <div key={pocket.id} className="rounded-2xl bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{pocket.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(pocket.saved)} de {fmt(pocket.target)}
                      </p>
                    </div>
                    <button
                      onClick={() => deletePocket(pocket.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/60 text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/70">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min((pocket.saved / pocket.target) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Monto para {pocket.name}</span>
                      <input
                        value={pocketAmount[pocket.id] ?? ""}
                        onChange={(event) =>
                          setPocketAmount((current) => ({
                            ...current,
                            [pocket.id]: event.target.value.replace(/[^0-9.]/g, ""),
                          }))
                        }
                        placeholder="Monto"
                        inputMode="decimal"
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </label>
                    <button
                      onClick={() => fundPocket(pocket.id)}
                      disabled={availableAfterPockets <= 0}
                      className="rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold"
                    >
                      Apartar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                Crea una pocket para separar saldo por meta.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold">Exchange</p>
          <p className="mt-1 text-xs text-muted-foreground">Calcula y registra conversiones</p>
          <div className="mt-4 rounded-2xl bg-muted/50 p-4">
            <label
              htmlFor="plus-exchange-from"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Envias
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="plus-exchange-from"
                value={fromAmount}
                onChange={(event) => setFromAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent font-display text-3xl font-bold outline-none"
              />
              <span className="rounded-full bg-background px-3 py-2 text-sm font-semibold">
                USD
              </span>
            </div>
          </div>
          <div className="my-3 flex justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-primary-foreground">
              <Repeat className="h-4 w-4" />
            </span>
          </div>
          <div className="rounded-2xl bg-muted/50 p-4">
            <label
              htmlFor="plus-exchange-currency"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Recibes
            </label>
            <div className="mt-2 flex items-center gap-3">
              <p className="min-w-0 flex-1 font-display text-3xl font-bold text-gradient">
                {Number.isFinite(converted) ? converted.toFixed(2) : "0.00"}
              </p>
              <select
                id="plus-exchange-currency"
                value={toCurrency}
                onChange={(event) => setToCurrency(event.target.value)}
                className="rounded-full bg-background px-3 py-2 text-sm font-semibold outline-none"
              >
                {Object.keys(rates).map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl px-3 py-2 text-xs text-muted-foreground">
            <span>Rate</span>
            <span className="font-semibold text-foreground">
              1 USD = {rates[toCurrency]} {toCurrency}
            </span>
          </div>
          <button
            onClick={() => void convert()}
            disabled={pending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
            Registrar conversion
          </button>
        </Card>
      </div>
    </div>
  );
}

function PlusMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Lock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl glass p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 truncate font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Lock;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}

function CategoryBar({ label, amount, total }: { label: string; amount: number; total: number }) {
  const width = total > 0 ? Math.max((amount / total) * 100, 4) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="font-semibold">{fmt(amount)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    const raw = window.localStorage.getItem(key);
    if (!raw) return initialValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
