import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { verifyTelegramInitData } from "@/lib/telegram-auth.functions";
import {
  getWebWalletSession,
  loginWebWalletUser,
  registerWebWalletUser,
} from "@/lib/web-auth.functions";
import {
  clearWebSessionToken,
  getStoredWebSessionToken,
  storeWebSessionToken,
} from "@/lib/web-auth.shared";

export const Route = createFileRoute("/_app")({
  component: AppGate,
});

type State =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "web-auth" }
  | { status: "denied"; message: string };
type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
};
type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

function AppGate() {
  const [state, setState] = useState<State>({ status: "loading" });
  const router = useRouter();
  const verify = useServerFn(verifyTelegramInitData);
  const checkWebSession = useServerFn(getWebWalletSession);
  const verifyRef = useRef(verify);
  const checkWebSessionRef = useRef(checkWebSession);
  verifyRef.current = verify;
  checkWebSessionRef.current = checkWebSession;

  useEffect(() => {
    let cancelled = false;
    const tg =
      typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : undefined;
    const initData = tg?.initData;
    tg?.ready?.();

    if (!initData || !new URLSearchParams(initData).get("hash")) {
      const sessionToken = getStoredWebSessionToken();
      if (!sessionToken) {
        setState({ status: "web-auth" });
        return;
      }

      checkWebSessionRef
        .current({ data: { sessionToken } })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setState({ status: "ok" });
          else {
            clearWebSessionToken();
            setState({ status: "web-auth" });
          }
        })
        .catch(() => {
          if (!cancelled) {
            clearWebSessionToken();
            setState({ status: "web-auth" });
          }
        });
      return;
    }

    verifyRef
      .current({ data: { initData } })
      .then(() => {
        if (!cancelled) setState({ status: "ok" });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            status: "denied",
            message: "Could not verify your Telegram session.",
          });
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Verifying Telegram session…
      </div>
    );
  }

  if (state.status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-lg font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "web-auth") {
    return <WebAuthGate onAuthed={() => setState({ status: "ok" })} />;
  }

  return <AppShell />;
}

function WebAuthGate({ onAuthed }: { onAuthed: () => void }) {
  const register = useServerFn(registerWebWalletUser);
  const login = useServerFn(loginWebWalletUser);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState({ email: "", password: "" });
  const [registerDraft, setRegisterDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "MX",
    dateOfBirth: "",
    addressLine1: "",
    city: "",
    postalCode: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });

  async function finishAuth(result: { sessionToken: string }) {
    storeWebSessionToken(result.sessionToken);
    onAuthed();
  }

  async function submitLogin() {
    setLoading(true);
    setMessage(null);
    try {
      await finishAuth(await login({ data: loginDraft }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister() {
    setLoading(true);
    setMessage(null);
    try {
      if (!registerDraft.acceptTerms) {
        setMessage("Acepta la revision de seguridad para crear la cuenta.");
        return;
      }
      await finishAuth(await register({ data: { ...registerDraft, acceptTerms: true } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <section className="grid w-full gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl glass p-6 shadow-card">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">WalletBRED</p>
            <h1 className="mt-3 font-display text-3xl font-bold">Acceso seguro web</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Para usar la wallet desde internet necesitas una cuenta registrada. Telegram mantiene
              su acceso verificado automaticamente desde la Mini App.
            </p>
            <div className="mt-6 grid gap-3 text-sm">
              <SecurityItem text="No se crea usuario automaticamente al abrir la pagina." />
              <SecurityItem text="Contrasena protegida con hash PBKDF2 y sesiones con token hasheado." />
              <SecurityItem text="Las funciones reales rechazan sesiones web no registradas." />
            </div>
          </div>

          <div className="rounded-3xl glass p-5 shadow-card">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
              <button
                onClick={() => setMode("register")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  mode === "register" ? "gradient-primary text-primary-foreground" : ""
                }`}
              >
                Registro
              </button>
              <button
                onClick={() => setMode("login")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  mode === "login" ? "gradient-primary text-primary-foreground" : ""
                }`}
              >
                Iniciar sesion
              </button>
            </div>

            {message && (
              <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {message}
              </p>
            )}

            {mode === "register" ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <AuthInput
                    label="Nombre completo"
                    value={registerDraft.fullName}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, fullName: value }))
                    }
                  />
                  <AuthInput
                    label="Correo"
                    type="email"
                    value={registerDraft.email}
                    onChange={(value) => setRegisterDraft((draft) => ({ ...draft, email: value }))}
                  />
                  <AuthInput
                    label="Telefono"
                    value={registerDraft.phone}
                    onChange={(value) => setRegisterDraft((draft) => ({ ...draft, phone: value }))}
                  />
                  <AuthInput
                    label="Pais"
                    value={registerDraft.country}
                    maxLength={2}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({
                        ...draft,
                        country: value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, "")
                          .slice(0, 2),
                      }))
                    }
                  />
                  <AuthInput
                    label="Fecha de nacimiento"
                    type="date"
                    value={registerDraft.dateOfBirth}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, dateOfBirth: value }))
                    }
                  />
                  <AuthInput
                    label="Ciudad"
                    value={registerDraft.city}
                    onChange={(value) => setRegisterDraft((draft) => ({ ...draft, city: value }))}
                  />
                  <AuthInput
                    label="Direccion"
                    value={registerDraft.addressLine1}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, addressLine1: value }))
                    }
                  />
                  <AuthInput
                    label="Codigo postal"
                    value={registerDraft.postalCode}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, postalCode: value }))
                    }
                  />
                  <AuthInput
                    label="Contrasena"
                    type="password"
                    value={registerDraft.password}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, password: value }))
                    }
                  />
                  <AuthInput
                    label="Confirmar contrasena"
                    type="password"
                    value={registerDraft.confirmPassword}
                    onChange={(value) =>
                      setRegisterDraft((draft) => ({ ...draft, confirmPassword: value }))
                    }
                  />
                </div>

                <label className="flex items-start gap-3 rounded-2xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={registerDraft.acceptTerms}
                    onChange={(event) =>
                      setRegisterDraft((draft) => ({
                        ...draft,
                        acceptTerms: event.target.checked,
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    Confirmo que mis datos son correctos y acepto revision de seguridad/KYC antes de
                    retiros o movimientos sensibles.
                  </span>
                </label>

                <button
                  onClick={() => void submitRegister()}
                  disabled={loading || !registerDraft.acceptTerms}
                  className="rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {loading ? "Creando cuenta..." : "Crear cuenta"}
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <AuthInput
                  label="Correo"
                  type="email"
                  value={loginDraft.email}
                  onChange={(value) => setLoginDraft((draft) => ({ ...draft, email: value }))}
                />
                <AuthInput
                  label="Contrasena"
                  type="password"
                  value={loginDraft.password}
                  onChange={(value) => setLoginDraft((draft) => ({ ...draft, password: value }))}
                />
                <button
                  onClick={() => void submitLogin()}
                  disabled={loading}
                  className="rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthInput({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

function SecurityItem({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {text}
    </p>
  );
}
