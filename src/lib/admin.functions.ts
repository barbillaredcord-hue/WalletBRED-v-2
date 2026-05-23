import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdminUser, type AdminAuthContext } from "@/lib/telegram-auth.middleware";

type AdminMovement = {
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
  canceled_at: string | null;
  canceled_by_owner: string | null;
  cancel_reason: string | null;
};

type AdminSubscription = {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

type AdminVipPlan = {
  plan_id: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
  stripe_price_id: string | null;
  perks: string[];
  featured: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
};

type AdminAccessGrant = {
  id: string;
  label: string;
  telegram_user_id: string;
  role: string;
  active: boolean;
  updated_at: string;
};

const cancelTransferSchema = z.object({
  movementId: z.string().uuid(),
  reason: z.string().trim().min(4).max(180),
});

const movementUpdateSchema = z.object({
  movementId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  recipient: z.string().trim().max(120).optional(),
  amount: z.number().min(0).max(1000000),
  currency: z.string().trim().min(3).max(3).default("USD"),
  status: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/),
  type: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_-]+$/),
});

const planSchema = z.object({
  planId: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(180).default(""),
  amount: z.number().positive().max(100000),
  currency: z.string().trim().min(3).max(3).default("USD"),
  stripePriceId: z.string().trim().max(120).optional(),
  perks: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(100),
});

const accessGrantSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(80),
  telegramUserId: z
    .string()
    .trim()
    .regex(/^\d{4,30}$/),
  role: z.enum(["owner", "admin", "support"]).default("admin"),
  active: z.boolean().default(true),
});

function adminId(context: unknown) {
  return (context as AdminAuthContext).adminTelegramUserId;
}

function money(cents: number | null, currency: string | null) {
  return {
    amount: Math.abs((cents ?? 0) / 100),
    currency: (currency ?? "usd").toUpperCase(),
  };
}

function ownerKey(movement: AdminMovement) {
  if (movement.telegram_user_id) return `telegram:${movement.telegram_user_id}`;
  if (movement.web_user_id) return `web:${movement.web_user_id}`;
  return "unknown";
}

function ownerLabel(movement: AdminMovement) {
  if (movement.telegram_user_id) return `Telegram ${movement.telegram_user_id}`;
  if (movement.web_user_id) return `Web ${movement.web_user_id.replace(/^web_/, "").slice(0, 8)}`;
  return "Sin usuario";
}

function canCancelTransfer(movement: AdminMovement) {
  return (
    ["transfer_out", "withdrawal_request"].includes(movement.type) &&
    ["pending", "completed", "processing", "review"].includes(movement.status)
  );
}

function transferStatusLabel(movement: AdminMovement) {
  if (movement.status === "canceled" || movement.status === "cancelled") return "Cancelada";
  if (movement.status === "failed") return "Fallida";
  if (movement.status === "pending") return "Pendiente";
  if (movement.status === "processing") return "Procesando";
  if (movement.status === "review") return "En revision";
  if (movement.status === "completed") return "Completada";
  return movement.status;
}

function movementDirection(movement: AdminMovement) {
  return movement.type.includes("deposit") ||
    movement.type === "transfer_in" ||
    movement.type === "qr_payment_received"
    ? "in"
    : "out";
}

function movementView(movement: AdminMovement) {
  return {
    id: movement.id,
    ownerId: ownerKey(movement),
    owner: ownerLabel(movement),
    type: movement.type,
    title: movement.title,
    recipient: movement.recipient_handle ?? "",
    status: movement.status,
    statusLabel: transferStatusLabel(movement),
    direction: movementDirection(movement),
    createdAt: movement.created_at,
    canceledAt: movement.canceled_at,
    canceledBy: movement.canceled_by_owner,
    cancelReason: movement.cancel_reason,
    canCancel: canCancelTransfer(movement),
    ...money(movement.amount, movement.currency),
  };
}

async function listStorageFiles() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    return [{ bucket: "storage", name: "No se pudieron leer archivos", updatedAt: null }];
  }

  const files = [];
  for (const bucket of buckets ?? []) {
    const { data } = await supabaseAdmin.storage.from(bucket.name).list("", {
      limit: 20,
      sortBy: { column: "updated_at", order: "desc" },
    });

    for (const file of data ?? []) {
      files.push({
        bucket: bucket.name,
        name: file.name,
        updatedAt: file.updated_at ?? file.created_at ?? null,
      });
    }
  }

  return files.slice(0, 40);
}

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireAdminUser])
  .handler(async () => {
    const [
      { data: movementRows, error: movementError },
      { data: subscriptionRows },
      { data: planRows },
      { data: grantRows },
    ] = await Promise.all([
      supabaseAdmin
        .from("wallet_movements")
        .select(
          "id,telegram_user_id,web_user_id,type,title,recipient_handle,amount,currency,status,created_at,canceled_at,canceled_by_owner,cancel_reason",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("subscriptions")
        .select(
          "id,telegram_user_id,telegram_username,stripe_customer_id,stripe_subscription_id,plan_id,status,current_period_end,cancel_at_period_end,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("vip_plans")
        .select(
          "plan_id,name,description,amount_cents,currency,stripe_price_id,perks,featured,active,sort_order,updated_at",
        )
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("admin_access_grants")
        .select("id,label,telegram_user_id,role,active,updated_at")
        .order("created_at", { ascending: true }),
    ]);

    if (movementError) throw movementError;

    const movements = (movementRows ?? []) as AdminMovement[];
    const subscriptions = (subscriptionRows ?? []) as AdminSubscription[];
    const users = new Map<
      string,
      {
        id: string;
        label: string;
        source: "telegram" | "web" | "unknown";
        balance: number;
        currency: string;
        movements: number;
        sent: number;
        received: number;
        lastActivity: string;
        plan: string;
        accessStatus: string;
      }
    >();

    for (const movement of movements) {
      const key = ownerKey(movement);
      const direction = movementDirection(movement);
      const current =
        users.get(key) ??
        users
          .set(key, {
            id: key,
            label: ownerLabel(movement),
            source: movement.telegram_user_id
              ? "telegram"
              : movement.web_user_id
                ? "web"
                : "unknown",
            balance: 0,
            currency: (movement.currency ?? "usd").toUpperCase(),
            movements: 0,
            sent: 0,
            received: 0,
            lastActivity: movement.created_at,
            plan: "Sin plan",
            accessStatus: "Sin acceso VIP",
          })
          .get(key)!;

      if (!["canceled", "cancelled", "failed", "unpaid"].includes(movement.status)) {
        current.balance +=
          direction === "in" ? (movement.amount ?? 0) / 100 : -(movement.amount ?? 0) / 100;
      }
      current.movements += 1;
      current.sent += direction === "out" ? 1 : 0;
      current.received += direction === "in" ? 1 : 0;
      current.lastActivity =
        movement.created_at > current.lastActivity ? movement.created_at : current.lastActivity;
    }

    for (const subscription of subscriptions) {
      const key = `telegram:${subscription.telegram_user_id}`;
      const current = users.get(key);
      if (current) {
        current.label = subscription.telegram_username
          ? `@${subscription.telegram_username}`
          : current.label;
        current.plan = subscription.plan_id;
        current.accessStatus = subscription.status;
      }
    }

    const movementViews = movements.slice(0, 200).map(movementView);
    const transfers = movementViews
      .filter((movement) => ["transfer_out", "withdrawal_request"].includes(movement.type))
      .slice(0, 100);

    return {
      users: [...users.values()].slice(0, 100),
      movements: movementViews,
      transfers,
      accesses: subscriptions.map((subscription) => ({
        id: subscription.id,
        user: subscription.telegram_username
          ? `@${subscription.telegram_username}`
          : `Telegram ${subscription.telegram_user_id}`,
        plan: subscription.plan_id,
        status: subscription.status,
        periodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        stripeSubscriptionId: subscription.stripe_subscription_id,
      })),
      plans: ((planRows ?? []) as AdminVipPlan[]).map((plan) => ({
        id: plan.plan_id,
        name: plan.name,
        description: plan.description,
        amount: plan.amount_cents / 100,
        currency: plan.currency.toUpperCase(),
        stripePriceId: plan.stripe_price_id ?? "",
        perks: plan.perks ?? [],
        featured: plan.featured,
        active: plan.active,
        sortOrder: plan.sort_order,
        updatedAt: plan.updated_at,
      })),
      adminAccesses: ((grantRows ?? []) as AdminAccessGrant[]).map((grant) => ({
        id: grant.id,
        label: grant.label,
        telegramUserId: grant.telegram_user_id,
        role: grant.role,
        active: grant.active,
        updatedAt: grant.updated_at,
      })),
      files: await listStorageFiles(),
    };
  });

export const cancelAdminTransfer = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => cancelTransferSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: movement, error: readError } = await supabaseAdmin
      .from("wallet_movements")
      .select("id,type,status")
      .eq("id", data.movementId)
      .maybeSingle();

    if (readError) throw readError;
    if (!movement) throw new Response("Transferencia no encontrada.", { status: 404 });
    if (!["transfer_out", "withdrawal_request"].includes(movement.type)) {
      throw new Response("Ese movimiento no es una transferencia cancelable.", { status: 400 });
    }
    if (["canceled", "cancelled", "failed"].includes(movement.status)) {
      return { ok: true as const, alreadyCanceled: true };
    }
    if (!["pending", "completed", "processing", "review"].includes(movement.status)) {
      throw new Response(`No se puede cancelar una transferencia en estado ${movement.status}.`, {
        status: 400,
      });
    }

    const { error } = await supabaseAdmin
      .from("wallet_movements")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_by_owner: adminId(context),
        cancel_reason: data.reason,
      })
      .eq("id", data.movementId)
      .eq("status", movement.status);

    if (error) throw error;
    return { ok: true as const, alreadyCanceled: false };
  });

export const updateAdminMovement = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => movementUpdateSchema.parse(input))
  .handler(async ({ data }) => {
    const amountCents = Math.round(data.amount * 100);
    const recipient = data.recipient?.trim() || null;

    const { error } = await supabaseAdmin
      .from("wallet_movements")
      .update({
        title: data.title,
        type: data.type,
        status: data.status,
        amount: amountCents,
        currency: data.currency.toLowerCase(),
        recipient_handle: recipient,
      })
      .eq("id", data.movementId);

    if (error) throw error;
    return { ok: true as const };
  });

export const saveAdminVipPlan = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data }) => {
    const amountCents = Math.round(data.amount * 100);
    const stripePriceId = data.stripePriceId?.trim() || null;
    if (stripePriceId && !stripePriceId.startsWith("price_")) {
      throw new Response("Stripe Price ID debe empezar con price_.", { status: 400 });
    }

    const { error } = await supabaseAdmin.from("vip_plans").upsert(
      {
        plan_id: data.planId,
        name: data.name,
        description: data.description,
        amount_cents: amountCents,
        currency: data.currency.toLowerCase(),
        stripe_price_id: stripePriceId,
        perks: data.perks,
        featured: data.featured,
        active: data.active,
        sort_order: data.sortOrder,
      },
      { onConflict: "plan_id" },
    );

    if (error) throw error;
    return { ok: true as const };
  });

export const saveAdminAccessGrant = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => accessGrantSchema.parse(input))
  .handler(async ({ data }) => {
    const payload = {
      label: data.label,
      telegram_user_id: data.telegramUserId,
      role: data.role,
      active: data.active,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("admin_access_grants").update(payload).eq("id", data.id)
      : await supabaseAdmin
          .from("admin_access_grants")
          .upsert(payload, { onConflict: "telegram_user_id" });

    if (error) throw error;
    return { ok: true as const };
  });
