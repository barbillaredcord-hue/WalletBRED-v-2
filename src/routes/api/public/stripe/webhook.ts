import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

type CheckoutSessionWithPaymentIntent = Stripe.Checkout.Session & {
  payment_intent?: string | Stripe.PaymentIntent | null;
};

function stripeId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function unixToIso(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function metadataNumber(metadata: Stripe.Metadata | undefined, key: string) {
  const raw = metadata?.[key];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function recordMovement(input: {
  telegramUserId: number | null;
  webUserId?: string | null;
  type: string;
  title: string;
  amount: number | null;
  currency: string | null;
  status: string;
  stripeEventId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const movement = {
    telegram_user_id: input.telegramUserId,
    web_user_id: input.webUserId ?? null,
    type: input.type,
    title: input.title,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    stripe_event_id: input.stripeEventId,
    stripe_session_id: input.stripeSessionId ?? null,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
    stripe_subscription_id: input.stripeSubscriptionId ?? null,
  };

  const { error } = await supabaseAdmin.from("wallet_movements").insert(movement);

  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const {
      stripe_payment_intent_id: _stripePaymentIntentId,
      web_user_id: _webUserId,
      ...legacyMovement
    } = movement;
    const { error: legacyError } = await supabaseAdmin
      .from("wallet_movements")
      .insert(legacyMovement);
    if (!legacyError || legacyError.code === "23505") return;
    throw legacyError;
  }

  if (error && error.code !== "23505") {
    throw error;
  }
}

async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  const telegramUserId = metadataNumber(session.metadata ?? undefined, "telegram_user_id");
  const subscriptionId = stripeId(session.subscription);
  if (!telegramUserId || !subscriptionId) return;

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      telegram_user_id: telegramUserId,
      telegram_username: session.metadata?.telegram_username || null,
      stripe_customer_id: stripeId(session.customer),
      stripe_subscription_id: subscriptionId,
      plan_id: session.metadata?.plan_id || "unknown",
      status: "active",
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) throw error;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const telegramUserId = metadataNumber(subscription.metadata, "telegram_user_id");
  const update = {
    telegram_username: subscription.metadata.telegram_username || null,
    stripe_customer_id: stripeId(subscription.customer),
    stripe_subscription_id: subscription.id,
    plan_id: subscription.metadata.plan_id || "unknown",
    status: subscription.status,
    current_period_start: unixToIso(
      (subscription as Stripe.Subscription & { current_period_start?: number })
        .current_period_start,
    ),
    current_period_end: unixToIso(
      (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end,
    ),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: unixToIso(subscription.canceled_at),
  };

  if (telegramUserId) {
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        telegram_user_id: telegramUserId,
        ...update,
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw error;
}

async function updateBankTransferFromTreasury(event: Stripe.Event) {
  const outboundTransfer = event.data.object as Stripe.Treasury.OutboundTransfer;
  const requestId = outboundTransfer.metadata?.walletbred_transfer_request_id;
  const status = outboundTransfer.status || "processing";
  const reviewNote = `Stripe Treasury: ${event.type}`;

  if (requestId) {
    const { error } = await supabaseAdmin
      .from("bank_transfer_requests")
      .update({
        provider_transfer_id: outboundTransfer.id,
        status,
        review_note: reviewNote,
      })
      .eq("id", requestId);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin
    .from("bank_transfer_requests")
    .update({
      status,
      review_note: reviewNote,
    })
    .eq("provider_transfer_id", outboundTransfer.id);
  if (error) throw error;
}

async function handleEvent(event: Stripe.Event) {
  const { data: existing } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const isWalletDeposit = session.metadata?.kind === "wallet_deposit";
      if (!isWalletDeposit) await upsertSubscriptionFromSession(session);
      await recordMovement({
        telegramUserId: metadataNumber(session.metadata ?? undefined, "telegram_user_id"),
        webUserId: session.metadata?.web_user_id || null,
        type: isWalletDeposit ? "stripe_deposit" : "vip_subscription",
        title: isWalletDeposit ? "Wallet deposit" : "VIP subscription started",
        amount: session.amount_total,
        currency: session.currency,
        status: session.payment_status,
        stripeEventId: event.id,
        stripeSessionId: session.id,
        stripePaymentIntentId: stripeId(
          (session as CheckoutSessionWithPaymentIntent).payment_intent,
        ),
        stripeSubscriptionId: stripeId(session.subscription),
      });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = stripeId(
        (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription,
      );
      const { data: subscription } = subscriptionId
        ? await supabaseAdmin
            .from("subscriptions")
            .select("telegram_user_id")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle()
        : { data: null };

      await recordMovement({
        telegramUserId: subscription?.telegram_user_id ?? null,
        type:
          event.type === "invoice.payment_succeeded" ? "stripe_payment" : "stripe_payment_failed",
        title:
          event.type === "invoice.payment_succeeded"
            ? "Stripe payment succeeded"
            : "Stripe payment failed",
        amount: invoice.amount_paid || invoice.amount_due || null,
        currency: invoice.currency,
        status: invoice.status ?? "unknown",
        stripeEventId: event.id,
        stripeSubscriptionId: subscriptionId,
      });
      break;
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const telegramUserId = metadataNumber(paymentIntent.metadata, "telegram_user_id");
      const webUserId = paymentIntent.metadata?.web_user_id || null;
      const isWalletDeposit = paymentIntent.metadata?.kind === "wallet_deposit";

      if (isWalletDeposit) break;

      await recordMovement({
        telegramUserId,
        webUserId,
        type:
          event.type === "payment_intent.succeeded"
            ? "stripe_payment_intent"
            : "stripe_payment_intent_failed",
        title:
          event.type === "payment_intent.succeeded"
            ? "Stripe payment intent succeeded"
            : "Stripe payment intent failed",
        amount: paymentIntent.amount_received || paymentIntent.amount || null,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        stripeEventId: event.id,
        stripePaymentIntentId: paymentIntent.id,
      });
      break;
    }
    case "payment_method.attached":
      break;
    case "treasury.outbound_transfer.created":
    case "treasury.outbound_transfer.posted":
    case "treasury.outbound_transfer.failed":
    case "treasury.outbound_transfer.canceled":
    case "treasury.outbound_transfer.returned": {
      await updateBankTransferFromTreasury(event);
      break;
    }
  }

  const { error: eventError } = await supabaseAdmin.from("stripe_webhook_events").insert({
    id: event.id,
    type: event.type,
    payload: JSON.parse(JSON.stringify(event)),
  });

  if (eventError && eventError.code !== "23505") {
    throw eventError;
  }
}

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!signature || !webhookSecret) {
          return new Response("Stripe webhook is not configured", { status: 500 });
        }

        const body = await request.text();
        let event: Stripe.Event;

        try {
          event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown signature error";
          return new Response(`Invalid signature: ${message}`, { status: 400 });
        }

        await handleEvent(event);
        return Response.json({ received: true });
      },
    },
  },
});
