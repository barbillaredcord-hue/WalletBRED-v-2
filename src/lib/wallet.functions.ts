import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAppUrl, getStripe } from "@/lib/stripe.server";
import { requireWalletUser, type WalletAuthContext } from "@/lib/telegram-auth.middleware";
import type { Transaction } from "@/lib/mock-data";

const centsInput = z
  .number()
  .min(1, "El monto debe ser mayor a cero.")
  .max(1000000, "El monto es demasiado alto.");

const movementSchema = z.object({
  kind: z.enum(["transfer", "withdraw", "convert", "qr_payment"]),
  amount: centsInput,
  recipient: z.string().trim().max(80).optional(),
  currency: z.string().trim().length(3).default("USD"),
  note: z.string().trim().max(120).optional(),
});

const depositSchema = z.object({
  amount: centsInput,
  currency: z.string().trim().length(3).default("USD"),
});

type WalletMovement = {
  id: string;
  telegram_user_id: number | null;
  web_user_id: string | null;
  type: string;
  title: string;
  recipient_handle: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
};

function contextUser(context: unknown) {
  return (context as WalletAuthContext).walletUser;
}

function movementDirection(type: string): "in" | "out" {
  if (
    type === "stripe_deposit" ||
    type === "transfer_in" ||
    type === "qr_payment_received" ||
    type === "stripe_payment_intent"
  ) {
    return "in";
  }
  return "out";
}

function movementCategory(type: string): Transaction["category"] {
  if (type.includes("deposit")) return "deposit";
  if (type.includes("vip") || type === "stripe_payment") return "vip";
  if (type.includes("qr")) return "qr";
  if (type.includes("convert") || type.includes("exchange")) return "exchange";
  return "transfer";
}

function shouldCount(movement: WalletMovement) {
  return !["failed", "canceled", "cancelled", "unpaid"].includes(movement.status);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toTransaction(movement: WalletMovement): Transaction {
  const direction = movementDirection(movement.type);
  return {
    id: movement.id,
    type: direction,
    title: movement.title,
    subtitle: movement.recipient_handle
      ? `${direction === "in" ? "De" : "Para"} ${movement.recipient_handle}`
      : movement.status,
    amount: Math.abs((movement.amount ?? 0) / 100),
    currency: (movement.currency ?? "usd").toUpperCase(),
    date: formatDate(movement.created_at),
    recipient: movement.recipient_handle,
    category: movementCategory(movement.type),
  };
}

function balanceFromMovements(movements: WalletMovement[]) {
  return movements.reduce((total, movement) => {
    if (!shouldCount(movement)) return total;
    const amount = movement.amount ?? 0;
    return total + (movementDirection(movement.type) === "in" ? amount : -amount);
  }, 0);
}

export const getWalletSnapshot = createServerFn({ method: "GET" })
  .middleware([requireWalletUser])
  .handler(async ({ context }) => {
    const walletUser = contextUser(context);

    let query = supabaseAdmin
      .from("wallet_movements")
      .select(
        "id,telegram_user_id,web_user_id,type,title,recipient_handle,amount,currency,status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    query =
      walletUser.source === "telegram"
        ? query.eq("telegram_user_id", walletUser.telegramUserId)
        : query.eq("web_user_id", walletUser.webUserId);

    const { data, error } = await query;

    if (error) throw error;

    const movements = (data ?? []) as WalletMovement[];
    const balanceCents = balanceFromMovements(movements);
    const sentCount = movements.filter(
      (movement) => movementDirection(movement.type) === "out",
    ).length;
    const receivedCount = movements.filter(
      (movement) => movementDirection(movement.type) === "in",
    ).length;

    return {
      user: {
        id: walletUser.id,
        name: walletUser.name,
        handle: walletUser.handle,
        avatar: walletUser.avatar,
      },
      balance: balanceCents / 100,
      currency: "USD",
      change24h: 0,
      stats: {
        sent: sentCount,
        received: receivedCount,
        movements: movements.length,
      },
      transactions: movements.map(toTransaction),
    };
  });

export const createWalletMovement = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => movementSchema.parse(input))
  .handler(async ({ context, data }) => {
    const walletUser = contextUser(context);
    const recipient = data.recipient?.replace(/^@+/, "").trim();

    const movementByKind = {
      transfer: {
        type: "transfer_out",
        title: recipient ? `Transfer to @${recipient}` : "Wallet transfer",
        status: "completed",
      },
      withdraw: {
        type: "withdrawal_request",
        title: "Withdrawal request",
        status: "pending",
      },
      convert: {
        type: "currency_conversion",
        title: data.note ? `Convert to ${data.note}` : "Currency conversion",
        status: "completed",
      },
      qr_payment: {
        type: "qr_payment",
        title: recipient ? `QR payment to @${recipient}` : "QR payment",
        status: "completed",
      },
    }[data.kind];

    const { error } = await supabaseAdmin.from("wallet_movements").insert({
      telegram_user_id: walletUser.telegramUserId,
      web_user_id: walletUser.webUserId,
      type: movementByKind.type,
      title: movementByKind.title,
      amount: Math.round(data.amount * 100),
      currency: data.currency.toLowerCase(),
      recipient_handle: recipient ? `@${recipient}` : null,
      status: movementByKind.status,
    });

    if (error) throw error;
    return { ok: true as const };
  });

export const startDepositCheckout = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => depositSchema.parse(input))
  .handler(async ({ context, data }) => {
    const walletUser = contextUser(context);
    const request = new Request("https://walletbred.local");
    const appUrl = getAppUrl(request);
    const unitAmount = Math.round(data.amount * 100);
    const userMetadata: Record<string, string> =
      walletUser.source === "telegram"
        ? {
            source: "telegram",
            telegram_user_id: String(walletUser.telegramUserId),
            telegram_username: walletUser.handle.startsWith("@") ? walletUser.handle.slice(1) : "",
          }
        : {
            source: "web",
            web_user_id: walletUser.webUserId,
          };

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: data.currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: "WalletBRED deposit",
            },
          },
        },
      ],
      success_url: `${appUrl}/wallet?deposit=success`,
      cancel_url: `${appUrl}/wallet?deposit=cancelled`,
      client_reference_id: walletUser.id,
      metadata: {
        kind: "wallet_deposit",
        ...userMetadata,
      },
      payment_intent_data: {
        metadata: {
          kind: "wallet_deposit",
          ...userMetadata,
        },
      },
    });

    if (!session.url) throw new Response("Stripe did not return a checkout URL", { status: 502 });
    return { url: session.url };
  });
