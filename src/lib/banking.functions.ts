import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { requireWalletUser, type WalletAuthContext } from "@/lib/telegram-auth.middleware";
import { getWalletBalanceCentsForUser } from "@/lib/wallet.functions";

const connectionSchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/),
  rail: z.enum(["ach", "spei", "sepa", "wire", "manual_review"]),
  accountLabel: z.string().trim().min(2).max(80),
  institutionName: z.string().trim().max(80).optional(),
});

const bankTransferSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive().max(1000000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/),
  description: z.string().trim().max(120).optional(),
});

function walletUser(context: unknown) {
  return (context as WalletAuthContext).walletUser;
}

function treasuryConfig() {
  return {
    financialAccountId: process.env.STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID,
    connectedAccountId: process.env.STRIPE_TREASURY_CONNECTED_ACCOUNT_ID,
  };
}

function accountOwnerFilter(query: ReturnType<typeof supabaseAdmin.from>, context: unknown) {
  const user = walletUser(context);
  return user.source === "telegram"
    ? query.eq("telegram_user_id", user.telegramUserId)
    : query.eq("web_user_id", user.webUserId);
}

export const listBankAccountConnections = createServerFn({ method: "GET" })
  .middleware([requireWalletUser])
  .handler(async ({ context }) => {
    const query = supabaseAdmin
      .from("bank_account_connections")
      .select(
        "id,provider,country,currency,rail,account_label,institution_name,account_last4,status,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    const { data, error } = await accountOwnerFilter(query, context);
    if (error) {
      console.warn("[banking] bank_account_connections no disponible:", error.message);
      return [];
    }

    return (data ?? []).map((account) => ({
      id: account.id,
      provider: account.provider,
      country: account.country,
      currency: account.currency,
      rail: account.rail,
      label: account.account_label,
      institution: account.institution_name,
      last4: account.account_last4,
      status: account.status,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    }));
  });

export const requestBankAccountConnection = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => connectionSchema.parse(input))
  .handler(async ({ context, data }) => {
    const user = walletUser(context);
    const { error } = await supabaseAdmin.from("bank_account_connections").insert({
      telegram_user_id: user.telegramUserId,
      web_user_id: user.webUserId,
      provider: "stripe_checkout_ready",
      country: data.country.toUpperCase(),
      currency: data.currency.toLowerCase(),
      rail: data.rail,
      account_label: data.accountLabel,
      institution_name: data.institutionName?.trim() || null,
      status: "provider_required",
    });

    if (error) throw error;
    return { ok: true as const };
  });

export const listBankTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireWalletUser])
  .handler(async ({ context }) => {
    const query = supabaseAdmin
      .from("bank_transfer_requests")
      .select(
        "id,bank_account_connection_id,direction,amount,currency,rail,provider_transfer_id,status,review_note,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);

    const { data, error } = await accountOwnerFilter(query, context);
    if (error) {
      console.warn("[banking] bank_transfer_requests no disponible:", error.message);
      return [];
    }

    return (data ?? []).map((transfer) => ({
      id: transfer.id,
      accountId: transfer.bank_account_connection_id,
      direction: transfer.direction,
      amount: Math.abs((transfer.amount ?? 0) / 100),
      currency: (transfer.currency ?? "usd").toUpperCase(),
      rail: transfer.rail,
      providerTransferId: transfer.provider_transfer_id,
      status: transfer.status,
      reviewNote: transfer.review_note,
      createdAt: transfer.created_at,
      updatedAt: transfer.updated_at,
    }));
  });

export const createBankTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => bankTransferSchema.parse(input))
  .handler(async ({ context, data }) => {
    const user = walletUser(context);
    const accountQuery = supabaseAdmin
      .from("bank_account_connections")
      .select("id,provider_account_id,account_label,rail,currency,status")
      .eq("id", data.accountId)
      .maybeSingle();
    const { data: account, error: accountError } = await accountOwnerFilter(accountQuery, context);

    if (accountError) throw accountError;
    if (!account) throw new Response("Cuenta bancaria no encontrada.", { status: 404 });

    const amountCents = Math.round(data.amount * 100);
    const currency = data.currency.toLowerCase();
    const availableCents = await getWalletBalanceCentsForUser(user, currency);
    if (amountCents > availableCents) {
      throw new Response(
        `Saldo insuficiente. Disponible: ${new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: currency.toUpperCase(),
        }).format(availableCents / 100)}.`,
        { status: 400 },
      );
    }

    const { data: movement, error: movementError } = await supabaseAdmin
      .from("wallet_movements")
      .insert({
        telegram_user_id: user.telegramUserId,
        web_user_id: user.webUserId,
        type: "withdrawal_request",
        title: `Bank withdrawal to ${account.account_label}`,
        amount: amountCents,
        currency,
        recipient_handle: account.account_label,
        status: "pending_provider",
      })
      .select("id")
      .single();

    if (movementError) throw movementError;

    const { data: transfer, error: insertError } = await supabaseAdmin
      .from("bank_transfer_requests")
      .insert({
        wallet_movement_id: movement.id,
        bank_account_connection_id: data.accountId,
        telegram_user_id: user.telegramUserId,
        web_user_id: user.webUserId,
        direction: "outbound",
        amount: amountCents,
        currency,
        rail: account.rail,
        status: "pending_provider",
        review_note: "Solicitud creada. Falta proveedor bancario tokenizado.",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const config = treasuryConfig();
    if (!config.financialAccountId || !account.provider_account_id) {
      return {
        ok: true as const,
        status: "pending_provider",
        message:
          "Solicitud guardada. Para enviar dinero real falta activar Stripe Treasury y tokenizar la cuenta bancaria.",
      };
    }

    try {
      const outboundTransfer = await getStripe().treasury.outboundTransfers.create(
        {
          financial_account: config.financialAccountId,
          amount: amountCents,
          currency,
          destination_payment_method: account.provider_account_id,
          statement_descriptor: "WalletBRED",
          description: data.description || "WalletBRED bank transfer",
          metadata: {
            walletbred_transfer_request_id: transfer.id,
            walletbred_user_id: user.id,
          },
          ...(account.rail === "ach" || account.rail === "wire"
            ? {
                destination_payment_method_options: {
                  us_bank_account: {
                    network: account.rail === "wire" ? "us_domestic_wire" : "ach",
                  },
                },
              }
            : {}),
        },
        config.connectedAccountId ? { stripeAccount: config.connectedAccountId } : undefined,
      );

      const { error: updateError } = await supabaseAdmin
        .from("bank_transfer_requests")
        .update({
          provider_transfer_id: outboundTransfer.id,
          status: outboundTransfer.status ?? "processing",
          review_note: "Enviado a Stripe Treasury.",
        })
        .eq("id", transfer.id);

      if (updateError) throw updateError;

      const { error: movementUpdateError } = await supabaseAdmin
        .from("wallet_movements")
        .update({
          status: outboundTransfer.status ?? "processing",
          title: "Bank withdrawal sent",
        })
        .eq("id", movement.id);

      if (movementUpdateError) throw movementUpdateError;

      return {
        ok: true as const,
        status: outboundTransfer.status ?? "processing",
        providerTransferId: outboundTransfer.id,
        message: "Transferencia enviada a Stripe Treasury.",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Stripe Treasury rechazo la transferencia.";
      await supabaseAdmin
        .from("bank_transfer_requests")
        .update({
          status: "provider_failed",
          review_note: message,
        })
        .eq("id", transfer.id);
      await supabaseAdmin
        .from("wallet_movements")
        .update({
          status: "failed",
          title: "Bank withdrawal failed",
        })
        .eq("id", movement.id);

      throw new Response(message, { status: 400 });
    }
  });
