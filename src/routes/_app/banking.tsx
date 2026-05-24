import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, fmt, PageHeader } from "@/components/ui-bits";
import { isDemoMode, useWalletSnapshot } from "@/hooks/use-wallet";
import {
  createBankTransferRequest,
  listBankAccountConnections,
  listBankTransferRequests,
  requestBankAccountConnection,
} from "@/lib/banking.functions";
import { ConnectOnboardingCard } from "@/components/ConnectOnboardingCard";
import { startDepositCheckout } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_app/banking")({
  component: BankingPage,
});

const rails = [
  { value: "ach", label: "ACH", country: "US", currency: "USD" },
  { value: "spei", label: "SPEI", country: "MX", currency: "MXN" },
  { value: "sepa", label: "SEPA", country: "ES", currency: "EUR" },
  { value: "wire", label: "Wire", country: "US", currency: "USD" },
  { value: "manual_review", label: "Revision manual", country: "US", currency: "USD" },
] as const;

type BankConnection = Awaited<ReturnType<typeof listBankAccountConnections>>[number];
type BankTransfer = Awaited<ReturnType<typeof listBankTransferRequests>>[number];

function BankingPage() {
  const loadAccounts = useServerFn(listBankAccountConnections);
  const loadTransfers = useServerFn(listBankTransferRequests);
  const requestConnection = useServerFn(requestBankAccountConnection);
  const createTransfer = useServerFn(createBankTransferRequest);
  const startDeposit = useServerFn(startDepositCheckout);
  const loadAccountsRef = useRef(loadAccounts);
  const loadTransfersRef = useRef(loadTransfers);
  const requestConnectionRef = useRef(requestConnection);
  const createTransferRef = useRef(createTransfer);
  const startDepositRef = useRef(startDeposit);
  const { snapshot } = useWalletSnapshot();
  const [accounts, setAccounts] = useState<BankConnection[]>([]);
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("50");
  const [transferAmount, setTransferAmount] = useState("25");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [draft, setDraft] = useState({
    rail: "ach",
    country: "US",
    currency: "USD",
    accountLabel: "Cuenta bancaria principal",
    institutionName: "",
  });

  loadAccountsRef.current = loadAccounts;
  loadTransfersRef.current = loadTransfers;
  requestConnectionRef.current = requestConnection;
  createTransferRef.current = createTransfer;
  startDepositRef.current = startDeposit;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextTransfers] = await Promise.all([
        loadAccountsRef.current(),
        loadTransfersRef.current(),
      ]);
      setAccounts(nextAccounts);
      setTransfers(nextTransfers);
      setSelectedAccountId((current) => current || nextAccounts[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron leer cuentas bancarias.");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedAccount = accounts.find((item) => item.id === selectedAccountId);
  const selectedTransferCurrency = selectedAccount?.currency ?? draft.currency;
  const selectedAvailable =
    snapshot.balances.find((balance) => balance.currency === selectedTransferCurrency.toUpperCase())
      ?.amount ??
    (snapshot.currency === selectedTransferCurrency.toUpperCase() ? snapshot.balance : 0);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function pickRail(value: string) {
    const rail = rails.find((item) => item.value === value);
    if (!rail) return;
    setDraft((current) => ({
      ...current,
      rail: rail.value,
      country: rail.country,
      currency: rail.currency,
    }));
  }

  async function submitConnection() {
    if (isDemoMode()) {
      setMessage("En demo no se guardan solicitudes bancarias reales.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await requestConnectionRef.current({ data: draft });
      setMessage("Solicitud bancaria guardada. Falta conectar el proveedor regulado.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la solicitud.");
    } finally {
      setSaving(false);
    }
  }

  async function submitBankTransfer() {
    const amount = Number(transferAmount);
    const account = accounts.find((item) => item.id === selectedAccountId);

    if (!account) {
      setMessage("Selecciona una cuenta bancaria preparada.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Escribe un monto valido para transferir.");
      return;
    }

    if (amount > selectedAvailable) {
      setMessage(
        `Saldo insuficiente para retirar. Disponible: ${fmt(
          selectedAvailable,
          selectedTransferCurrency,
        )}.`,
      );
      return;
    }

    if (isDemoMode()) {
      setMessage("En demo no se crean transferencias bancarias reales.");
      return;
    }

    setSending(true);
    setMessage(null);
    try {
      const result = await createTransferRef.current({
        data: {
          accountId: account.id,
          amount,
          currency: account.currency,
          description: `Transferencia WalletBRED a ${account.label}`,
        },
      });
      setMessage(result.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la transferencia.");
    } finally {
      setSending(false);
    }
  }

  async function startStripeFunding() {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Escribe un monto valido.");
      return;
    }
    if (isDemoMode()) {
      setMessage("En demo no se abre Stripe Checkout real.");
      return;
    }

    setDepositing(true);
    setMessage(null);
    try {
      const response = await startDepositRef.current({
        data: { amount, currency: draft.currency },
      });
      window.location.href = response.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir Stripe Checkout.");
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div>
      <PageHeader title="Banking" subtitle="Cuentas bancarias, fondeo y rails regulados" />

      {message && (
        <p className="mb-4 rounded-2xl bg-muted/70 px-4 py-3 text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Fondear con Stripe Checkout</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Usa Checkout para recibir dinero mientras se activa un proveedor bancario real.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">Balance actual</p>
            <p className="font-display text-2xl font-bold">
              {fmt(snapshot.balance, snapshot.currency)}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5">
            <input
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="min-w-0 flex-1 bg-transparent font-display text-2xl font-bold outline-none"
            />
            <span className="rounded-full bg-muted px-3 py-2 text-sm font-semibold">
              {draft.currency}
            </span>
          </div>

          <button
            onClick={() => void startStripeFunding()}
            disabled={depositing}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {depositing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Abrir Checkout
          </button>
        </Card>

        <ConnectOnboardingCard
          returnPath="/banking"
          title="Stripe Connect para retiros"
          description="Crea o termina tu cuenta conectada para que WalletBRED pueda pagar retiros aprobados sin guardar datos bancarios completos."
        />

        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Preparar cuenta bancaria</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                No guardes numeros completos. La cuenta real debe tokenizarse con Stripe Financial
                Connections, Treasury u otro proveedor aprobado.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <select
              value={draft.rail}
              onChange={(event) => pickRail(event.target.value)}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {rails.map((rail) => (
                <option key={rail.value} value={rail.value}>
                  {rail.label} · {rail.country} · {rail.currency}
                </option>
              ))}
            </select>
            <input
              value={draft.accountLabel}
              onChange={(event) =>
                setDraft((current) => ({ ...current, accountLabel: event.target.value }))
              }
              placeholder="Alias de cuenta"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={draft.institutionName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, institutionName: event.target.value }))
              }
              placeholder="Banco o proveedor"
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={() => void submitConnection()}
            disabled={saving}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Guardar preparacion
          </button>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
          <Building2 className="h-4 w-4 text-primary" />
          Cuentas preparadas
        </h2>
        <div className="rounded-3xl glass p-2 shadow-card">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando...</p>
          ) : accounts.length ? (
            accounts.map((account) => <BankAccountRow key={account.id} account={account} />)
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aun no hay cuentas bancarias preparadas.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1fr]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Send className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Transferir desde WalletBRED</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Crea una salida bancaria. Si Stripe Treasury esta activo, se envia al proveedor; si
                no, queda como solicitud pendiente.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Selecciona cuenta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} · {account.rail.toUpperCase()} · {account.currency.toUpperCase()}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5">
              <input
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent font-display text-2xl font-bold outline-none"
              />
              <span className="rounded-full bg-muted px-3 py-2 text-sm font-semibold">
                {accounts.find((account) => account.id === selectedAccountId)?.currency ??
                  draft.currency}
              </span>
            </div>
            <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Disponible para esta moneda: {fmt(selectedAvailable, selectedTransferCurrency)}
            </p>
          </div>

          <button
            onClick={() => void submitBankTransfer()}
            disabled={sending || !accounts.length}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Crear transferencia
          </button>
        </Card>

        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <Send className="h-4 w-4 text-primary" />
            Salidas bancarias
          </h2>
          <div className="rounded-3xl glass p-2 shadow-card">
            {loading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando...</p>
            ) : transfers.length ? (
              transfers.map((transfer) => (
                <BankTransferRow
                  key={transfer.id}
                  transfer={transfer}
                  account={accounts.find((account) => account.id === transfer.accountId)}
                />
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aun no hay salidas bancarias.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <ChecklistItem
          title="Stripe Checkout"
          text="Activo para fondear la wallet sin guardar datos bancarios."
        />
        <ChecklistItem
          title="Cuenta real"
          text="Pendiente: proveedor regulado para CLABE, IBAN, ACH o Financial Account."
        />
        <ChecklistItem
          title="Cumplimiento"
          text="Pendiente: KYC/KYB, terminos, limites, reportes y monitoreo."
        />
      </div>
    </div>
  );
}

function BankTransferRow({
  transfer,
  account,
}: {
  transfer: BankTransfer;
  account?: BankConnection;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-3 py-3 text-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Send className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{fmt(transfer.amount, transfer.currency)}</p>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {transfer.status}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          A {account?.label ?? "cuenta bancaria"} · {transfer.rail.toUpperCase()} ·{" "}
          {new Date(transfer.createdAt).toLocaleString()}
        </p>
        {transfer.reviewNote && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{transfer.reviewNote}</p>
        )}
      </div>
    </div>
  );
}

function BankAccountRow({ account }: { account: BankConnection }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Landmark className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{account.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {account.rail.toUpperCase()} · {account.country} · {account.currency.toUpperCase()} ·{" "}
          {account.institution ?? "sin banco"}
        </p>
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        {account.status}
      </span>
    </div>
  );
}

function ChecklistItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl glass p-4 shadow-card">
      <CheckCircle2 className="h-4 w-4 text-success" />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}
