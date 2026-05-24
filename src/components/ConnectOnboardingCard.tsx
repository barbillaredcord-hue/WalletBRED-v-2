import { useServerFn } from "@tanstack/react-start";
import { BadgeDollarSign, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { startSellerConnectOnboarding } from "@/lib/marketplace.functions";
import { isDemoMode } from "@/hooks/use-wallet";
import { Card } from "@/components/ui-bits";

type ConnectReturnPath = "/sell" | "/wallet" | "/transfers" | "/banking";

export function ConnectOnboardingCard({
  returnPath,
  title = "Cuenta para retiros",
  description = "Crea o termina tu cuenta Stripe Connect para recibir retiros aprobados por WalletBRED.",
  compact = false,
}: {
  returnPath: ConnectReturnPath;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const startConnect = useServerFn(startSellerConnectOnboarding);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function connectStripe() {
    if (isDemoMode()) {
      setMessage("Abre la Mini App desde Telegram para crear una cuenta real de retiros.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await startConnect({ data: { returnPath } });
      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir Stripe Connect.");
      setLoading(false);
    }
  }

  return (
    <Card className={compact ? "p-4" : ""}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <BadgeDollarSign className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}

      <button
        onClick={() => void connectStripe()}
        disabled={loading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        Crear/conectar cuenta Stripe
      </button>
    </Card>
  );
}
