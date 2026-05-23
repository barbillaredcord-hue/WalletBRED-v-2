import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ScanLine, Share2, Download } from "lucide-react";
import { PageHeader, Card } from "@/components/ui-bits";
import { isDemoMode, useWalletSnapshot } from "@/hooks/use-wallet";
import { createWalletMovement } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_app/qr")({
  component: QrPage,
});

function QrPage() {
  const [mode, setMode] = useState<"receive" | "scan">("receive");
  const [amount, setAmount] = useState("25.00");
  const [status, setStatus] = useState<string | null>(null);
  const { snapshot, refresh } = useWalletSnapshot();
  const createMovement = useServerFn(createWalletMovement);
  const handle = snapshot.user.handle.replace(/^@/, "");
  const payloadText = `walletbred:pay?amount=${amount}&to=${encodeURIComponent(handle)}`;
  const payload = encodeURIComponent(payloadText);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&bgcolor=20-15-30&color=ffffff&data=${payload}`;

  async function shareQr() {
    if (navigator.share) {
      await navigator.share({ title: "WalletBRED QR", text: payloadText });
      return;
    }
    await navigator.clipboard.writeText(payloadText);
    setStatus("QR copiado al portapapeles.");
  }

  async function saveQr() {
    const link = document.createElement("a");
    link.href = qrSrc;
    link.download = "walletbred-qr.png";
    link.click();
  }

  async function processQr(raw: string) {
    try {
      const parsed = new URL(raw.replace("walletbred:pay", "https://walletbred.local/pay"));
      const parsedAmount = Number(parsed.searchParams.get("amount"));
      const recipient = parsed.searchParams.get("to") ?? "";
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !recipient) {
        setStatus("El QR no tiene un pago valido.");
        return;
      }
      if (isDemoMode()) {
        setStatus(`Demo: pago detectado para @${recipient}.`);
        return;
      }
      await createMovement({
        data: {
          kind: "qr_payment",
          amount: parsedAmount,
          currency: "USD",
          recipient,
        },
      });
      setStatus(`Pago QR a @${recipient} registrado.`);
      refresh();
    } catch {
      setStatus("No pude leer ese QR.");
    }
  }

  function openScanner() {
    const tg = (window as { Telegram?: { WebApp?: { showScanQrPopup?: unknown } } }).Telegram
      ?.WebApp;
    if (typeof tg?.showScanQrPopup !== "function") {
      setStatus("El scanner solo esta disponible dentro de Telegram.");
      return;
    }
    tg.showScanQrPopup({ text: "Escanea un QR WalletBRED" }, (raw: string) => {
      void processQr(raw);
      return true;
    });
  }

  return (
    <div>
      <PageHeader title="QR Payments" subtitle="Pay & get paid instantly" />

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-full glass p-1">
        {(["receive", "scan"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2 text-xs font-semibold capitalize transition-all ${
              mode === m ? "gradient-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {m === "receive" ? "Receive" : "Scan & Pay"}
          </button>
        ))}
      </div>

      {mode === "receive" ? (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Amount</p>
            <span className="text-xs text-muted-foreground">USD</span>
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="mt-1 w-full bg-transparent font-display text-3xl font-bold focus:outline-none"
          />

          <div className="mt-5 flex justify-center">
            <div className="rounded-3xl bg-white p-3 shadow-card">
              <img src={qrSrc} alt="Payment QR code" className="h-56 w-56" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Scan to pay{" "}
            <span className="font-semibold text-foreground">{snapshot.user.handle}</span>
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => void saveQr()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-semibold"
            >
              <Download className="h-4 w-4" /> Save
            </button>
            <button
              onClick={() => void shareQr()}
              className="flex items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground glow"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
          {status && <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>}
        </Card>
      ) : (
        <Card className="flex flex-col items-center text-center">
          <div className="relative my-6 flex h-64 w-64 items-center justify-center rounded-3xl border-2 border-dashed border-primary/40 bg-black/30">
            <ScanLine className="h-12 w-12 text-primary/70" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 animate-pulse bg-primary glow" />
          </div>
          <p className="text-sm font-semibold">Point camera at a QR code</p>
          <p className="mt-1 text-xs text-muted-foreground">Camera access required from Telegram</p>
          <button
            onClick={openScanner}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground glow"
          >
            <CheckCircle2 className="h-4 w-4" />
            Open scanner
          </button>
          {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
        </Card>
      )}
    </div>
  );
}
