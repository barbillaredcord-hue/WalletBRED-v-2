import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdminUser, type AdminAuthContext } from "@/lib/telegram-auth.middleware";
import { deliverTelegramStarsPurchase } from "@/lib/telegram-stars.functions";

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

type AdminPremiumProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: string;
  price_amount_cents: number;
  price_currency: string;
  stars_amount: number | null;
  stripe_price_id: string | null;
  external_url: string | null;
  active: boolean;
  featured: boolean;
  sort_order: number;
  updated_at: string;
};

type AdminPremiumContent = {
  id: string;
  product_id: string | null;
  title: string;
  content_type: string;
  preview: string;
  content_url: string | null;
  access_level: string;
  active: boolean;
  sort_order: number;
  updated_at: string;
};

type AdminPremiumEntitlement = {
  id: string;
  product_id: string | null;
  telegram_user_id: number | null;
  web_user_id: string | null;
  source: string;
  status: string;
  expires_at: string | null;
  updated_at: string;
};

type AdminStarsPurchase = {
  id: string;
  product_id: string | null;
  telegram_user_id: number;
  telegram_username: string | null;
  chat_id: number | null;
  total_amount: number;
  currency: string;
  status: string;
  delivery_status: string;
  delivery_error: string | null;
  delivered_at: string | null;
  telegram_payment_charge_id: string | null;
  created_at: string;
};

type AdminPremiumDelivery = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  content_item_id: string | null;
  delivery_key: string;
  delivery_type: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  sent_message_id: number | null;
  delivered_at: string | null;
  resend_requested_by: string | null;
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

const premiumProductSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).default(""),
  kind: z.enum(["premium_content", "telegram_store", "stars_pack", "crypto_external"]),
  amount: z.number().positive().max(100000),
  currency: z.string().trim().min(3).max(3).default("USD"),
  starsAmount: z.number().int().positive().max(1000000).optional(),
  stripePriceId: z.string().trim().max(120).optional(),
  externalUrl: z.string().trim().max(240).optional(),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(100),
});

const premiumContentSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(120),
  contentType: z.enum(["post", "video", "image", "file", "link", "ai_prompt"]),
  preview: z.string().trim().max(320).default(""),
  contentUrl: z.string().trim().max(240).optional(),
  accessLevel: z.enum(["free", "paid", "vip", "stars"]),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(100),
});

const entitlementSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  telegramUserId: z
    .string()
    .trim()
    .regex(/^\d{4,30}$/)
    .optional(),
  webUserId: z.string().trim().max(120).optional(),
  source: z.string().trim().min(2).max(40).default("admin"),
  status: z.enum(["active", "expired", "revoked", "pending"]).default("active"),
  expiresAt: z.string().trim().max(40).optional(),
});

const resendDeliverySchema = z.object({
  purchaseId: z.string().uuid(),
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
      { data: premiumProductRows },
      { data: premiumContentRows },
      { data: entitlementRows },
      { data: starsPurchaseRows },
      { data: deliveryRows },
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
      supabaseAdmin
        .from("premium_products")
        .select(
          "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,stripe_price_id,external_url,active,featured,sort_order,updated_at",
        )
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("premium_content_items")
        .select(
          "id,product_id,title,content_type,preview,content_url,access_level,active,sort_order,updated_at",
        )
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("premium_user_entitlements")
        .select("id,product_id,telegram_user_id,web_user_id,source,status,expires_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("telegram_stars_purchases")
        .select(
          "id,product_id,telegram_user_id,telegram_username,chat_id,total_amount,currency,status,delivery_status,delivery_error,delivered_at,telegram_payment_charge_id,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("premium_delivery_events")
        .select(
          "id,purchase_id,product_id,content_item_id,delivery_key,delivery_type,status,attempt_count,last_error,sent_message_id,delivered_at,resend_requested_by,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(500),
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
      premiumProducts: ((premiumProductRows ?? []) as AdminPremiumProduct[]).map((product) => ({
        id: product.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        kind: product.kind,
        amount: product.price_amount_cents / 100,
        currency: product.price_currency.toUpperCase(),
        starsAmount: product.stars_amount ?? 0,
        stripePriceId: product.stripe_price_id ?? "",
        externalUrl: product.external_url ?? "",
        featured: product.featured,
        active: product.active,
        sortOrder: product.sort_order,
        updatedAt: product.updated_at,
      })),
      premiumContent: ((premiumContentRows ?? []) as AdminPremiumContent[]).map((content) => ({
        id: content.id,
        productId: content.product_id ?? "",
        title: content.title,
        contentType: content.content_type,
        preview: content.preview,
        contentUrl: content.content_url ?? "",
        accessLevel: content.access_level,
        active: content.active,
        sortOrder: content.sort_order,
        updatedAt: content.updated_at,
      })),
      premiumEntitlements: ((entitlementRows ?? []) as AdminPremiumEntitlement[]).map(
        (entitlement) => ({
          id: entitlement.id,
          productId: entitlement.product_id ?? "",
          telegramUserId: entitlement.telegram_user_id?.toString() ?? "",
          webUserId: entitlement.web_user_id ?? "",
          source: entitlement.source,
          status: entitlement.status,
          expiresAt: entitlement.expires_at ?? "",
          updatedAt: entitlement.updated_at,
        }),
      ),
      starsPurchases: ((starsPurchaseRows ?? []) as AdminStarsPurchase[]).map((purchase) => ({
        id: purchase.id,
        productId: purchase.product_id ?? "",
        telegramUserId: purchase.telegram_user_id.toString(),
        telegramUsername: purchase.telegram_username ?? "",
        chatId: purchase.chat_id?.toString() ?? "",
        totalAmount: purchase.total_amount,
        currency: purchase.currency,
        status: purchase.status,
        deliveryStatus: purchase.delivery_status,
        deliveryError: purchase.delivery_error ?? "",
        deliveredAt: purchase.delivered_at ?? "",
        telegramPaymentChargeId: purchase.telegram_payment_charge_id ?? "",
        createdAt: purchase.created_at,
      })),
      premiumDeliveries: ((deliveryRows ?? []) as AdminPremiumDelivery[]).map((delivery) => ({
        id: delivery.id,
        purchaseId: delivery.purchase_id,
        productId: delivery.product_id ?? "",
        contentItemId: delivery.content_item_id ?? "",
        deliveryKey: delivery.delivery_key,
        deliveryType: delivery.delivery_type,
        status: delivery.status,
        attemptCount: delivery.attempt_count,
        lastError: delivery.last_error ?? "",
        sentMessageId: delivery.sent_message_id?.toString() ?? "",
        deliveredAt: delivery.delivered_at ?? "",
        resendRequestedBy: delivery.resend_requested_by ?? "",
        updatedAt: delivery.updated_at,
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

export const saveAdminPremiumProduct = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => premiumProductSchema.parse(input))
  .handler(async ({ data }) => {
    const stripePriceId = data.stripePriceId?.trim() || null;
    if (stripePriceId && !stripePriceId.startsWith("price_")) {
      throw new Response("Stripe Price ID debe empezar con price_.", { status: 400 });
    }

    const externalUrl = data.externalUrl?.trim() || null;
    if (externalUrl && !/^https?:\/\//.test(externalUrl)) {
      throw new Response("El enlace externo debe empezar con http:// o https://.", {
        status: 400,
      });
    }

    const payload = {
      slug: data.slug,
      title: data.title,
      description: data.description,
      kind: data.kind,
      price_amount_cents: Math.round(data.amount * 100),
      price_currency: data.currency.toLowerCase(),
      stars_amount: data.starsAmount || null,
      stripe_price_id: stripePriceId,
      external_url: externalUrl,
      featured: data.featured,
      active: data.active,
      sort_order: data.sortOrder,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("premium_products").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("premium_products").insert(payload);

    if (error) throw error;
    return { ok: true as const };
  });

export const saveAdminPremiumContent = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => premiumContentSchema.parse(input))
  .handler(async ({ data }) => {
    const payload = {
      product_id: data.productId || null,
      title: data.title,
      content_type: data.contentType,
      preview: data.preview,
      content_url: data.contentUrl?.trim() || null,
      access_level: data.accessLevel,
      active: data.active,
      sort_order: data.sortOrder,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("premium_content_items").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("premium_content_items").insert(payload);

    if (error) throw error;
    return { ok: true as const };
  });

export const saveAdminPremiumEntitlement = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => entitlementSchema.parse(input))
  .handler(async ({ data }) => {
    const telegramUserId = data.telegramUserId ? Number(data.telegramUserId) : null;
    const webUserId = data.webUserId?.trim() || null;

    if (!telegramUserId && !webUserId) {
      throw new Response("Agrega Telegram ID o Web User ID.", { status: 400 });
    }

    const payload = {
      product_id: data.productId,
      telegram_user_id: telegramUserId,
      web_user_id: webUserId,
      source: data.source,
      status: data.status,
      expires_at: data.expiresAt?.trim() || null,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("premium_user_entitlements").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("premium_user_entitlements").insert(payload);

    if (error) throw error;
    return { ok: true as const };
  });

export const resendAdminPremiumDelivery = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => resendDeliverySchema.parse(input))
  .handler(async ({ context, data }) => {
    const result = await deliverTelegramStarsPurchase({
      purchaseId: data.purchaseId,
      force: true,
      requestedBy: adminId(context),
    });
    return { ok: true as const, ...result };
  });
