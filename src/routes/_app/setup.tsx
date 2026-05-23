import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/_app/setup")({
  component: SetupPage,
});

const STORAGE_KEY = "wallet-glow-setup-info";

type OwnerInfo = {
  domain: string;
  vercelProject: string;
  telegramBot: string;
  telegramMiniApp: string;
  stripeMode: "test" | "live";
  stripePrices: string;
  supabaseProject: string;
  notes: string;
};

type SecretStatus = {
  key: string;
  label: string;
  status: "missing" | "configured";
  note: string;
};

type BotClient = {
  id: string;
  telegramId: string;
  username: string;
  name: string;
  plan: string;
  email: string;
  notes: string;
};

type SetupState = {
  owner: OwnerInfo;
  secrets: SecretStatus[];
  clients: BotClient[];
};

const emptyOwner: OwnerInfo = {
  domain: "",
  vercelProject: "",
  telegramBot: "",
  telegramMiniApp: "",
  stripeMode: "test",
  stripePrices: "",
  supabaseProject: "",
  notes: "",
};

const requiredSecrets: SecretStatus[] = [
  { key: "APP_URL", label: "Dominio final en Vercel", status: "missing", note: "" },
  { key: "TELEGRAM_BOT_TOKEN", label: "Token del bot de Telegram", status: "missing", note: "" },
  { key: "STRIPE_SECRET_KEY", label: "Clave secreta de Stripe", status: "missing", note: "" },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    label: "Firma del webhook de Stripe",
    status: "missing",
    note: "",
  },
  { key: "STRIPE_PRICE_VIP_*", label: "IDs de precios VIP", status: "missing", note: "" },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Service role de Supabase",
    status: "missing",
    note: "",
  },
];

const emptyClient: BotClient = {
  id: "",
  telegramId: "",
  username: "",
  name: "",
  plan: "",
  email: "",
  notes: "",
};

function createInitialState(): SetupState {
  return {
    owner: emptyOwner,
    secrets: requiredSecrets,
    clients: [],
  };
}

function SetupPage() {
  const [state, setState] = useState<SetupState>(createInitialState);
  const [draftClient, setDraftClient] = useState<BotClient>(emptyClient);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<SetupState>;
      setState({
        owner: { ...emptyOwner, ...parsed.owner },
        secrets: mergeSecretStatuses(parsed.secrets),
        clients: parsed.clients ?? [],
      });
    } catch {
      setState(createInitialState());
    }
  }, []);

  const missingCount = useMemo(
    () => state.secrets.filter((item) => item.status === "missing").length,
    [state.secrets],
  );

  function save(nextState = state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function updateOwner(key: keyof OwnerInfo, value: string) {
    setState((current) => ({
      ...current,
      owner: { ...current.owner, [key]: value },
    }));
  }

  function updateSecret(index: number, patch: Partial<SecretStatus>) {
    setState((current) => ({
      ...current,
      secrets: current.secrets.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addClient() {
    const hasClientData = Object.entries(draftClient).some(
      ([key, value]) => key !== "id" && value.trim(),
    );
    if (!hasClientData) return;

    const nextState = {
      ...state,
      clients: [...state.clients, { ...draftClient, id: crypto.randomUUID() }],
    };
    setState(nextState);
    setDraftClient(emptyClient);
    save(nextState);
  }

  function removeClient(id: string) {
    const nextState = {
      ...state,
      clients: state.clients.filter((client) => client.id !== id),
    };
    setState(nextState);
    save(nextState);
  }

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos tuyos y clientes del bot" />

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Información mía faltante</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Guarda aquí dominios, IDs públicos, notas y estados de configuración.
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {missingCount} pendientes
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <Field
            label="Dominio propio"
            value={state.owner.domain}
            onChange={(v) => updateOwner("domain", v)}
          />
          <Field
            label="Proyecto Vercel"
            value={state.owner.vercelProject}
            onChange={(v) => updateOwner("vercelProject", v)}
          />
          <Field
            label="Bot de Telegram"
            value={state.owner.telegramBot}
            onChange={(v) => updateOwner("telegramBot", v)}
          />
          <Field
            label="URL Mini App"
            value={state.owner.telegramMiniApp}
            onChange={(v) => updateOwner("telegramMiniApp", v)}
          />
          <Field
            label="IDs de precios Stripe"
            value={state.owner.stripePrices}
            onChange={(v) => updateOwner("stripePrices", v)}
          />
          <Field
            label="Proyecto Supabase"
            value={state.owner.supabaseProject}
            onChange={(v) => updateOwner("supabaseProject", v)}
          />
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Modo Stripe</span>
            <select
              value={state.owner.stripeMode}
              onChange={(event) =>
                updateOwner("stripeMode", event.target.value as OwnerInfo["stripeMode"])
              }
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </label>
          <TextArea
            label="Notas mías"
            value={state.owner.notes}
            onChange={(v) => updateOwner("notes", v)}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold">Secretos que van en Vercel</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Marca si ya los cargaste. No pegues claves secretas completas aquí.
        </p>
        <div className="mt-4 space-y-2">
          {state.secrets.map((secret, index) => (
            <div key={secret.key} className="rounded-2xl bg-muted/50 p-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={() =>
                    updateSecret(index, {
                      status: secret.status === "configured" ? "missing" : "configured",
                    })
                  }
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    secret.status === "configured"
                      ? "border-success bg-success/20 text-success"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {secret.status === "configured" && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{secret.key}</p>
                  <p className="text-xs text-muted-foreground">{secret.label}</p>
                  <input
                    value={secret.note}
                    onChange={(event) => updateSecret(index, { note: event.target.value })}
                    placeholder="Nota segura, ejemplo: cargado en producción"
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold">Clientes que usan el bot</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Guarda datos operativos para soporte y seguimiento de planes VIP.
        </p>

        <div className="mt-4 grid gap-3">
          <Field
            label="Telegram ID"
            value={draftClient.telegramId}
            onChange={(v) => setDraftClient((client) => ({ ...client, telegramId: v }))}
          />
          <Field
            label="Usuario Telegram"
            value={draftClient.username}
            onChange={(v) => setDraftClient((client) => ({ ...client, username: v }))}
          />
          <Field
            label="Nombre"
            value={draftClient.name}
            onChange={(v) => setDraftClient((client) => ({ ...client, name: v }))}
          />
          <Field
            label="Plan"
            value={draftClient.plan}
            onChange={(v) => setDraftClient((client) => ({ ...client, plan: v }))}
          />
          <Field
            label="Email"
            value={draftClient.email}
            onChange={(v) => setDraftClient((client) => ({ ...client, email: v }))}
          />
          <TextArea
            label="Notas del cliente"
            value={draftClient.notes}
            onChange={(v) => setDraftClient((client) => ({ ...client, notes: v }))}
          />
        </div>

        <button
          onClick={addClient}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground glow"
        >
          <Plus className="h-4 w-4" /> Agregar cliente
        </button>

        {state.clients.length > 0 && (
          <div className="mt-4 space-y-2">
            {state.clients.map((client) => (
              <div key={client.id} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{client.name || "Sin nombre"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {client.username || "Sin usuario"} · {client.plan || "Sin plan"}
                  </p>
                  {client.telegramId && (
                    <p className="mt-1 text-xs text-muted-foreground">ID: {client.telegramId}</p>
                  )}
                </div>
                <button
                  onClick={() => removeClient(client.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button
        onClick={() => save()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-semibold"
      >
        <Save className="h-4 w-4" /> {saved ? "Guardado" : "Guardar cambios"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function mergeSecretStatuses(saved: SecretStatus[] | undefined) {
  return requiredSecrets.map((secret) => {
    const existing = saved?.find((item) => item.key === secret.key);
    return existing ? { ...secret, ...existing } : secret;
  });
}
