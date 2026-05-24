import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAppUrl, getStripe } from "@/lib/stripe.server";
import {
  requireAdminUser,
  requireWalletUser,
  type AdminAuthContext,
  type WalletAuthContext,
} from "@/lib/telegram-auth.middleware";

const sellerProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .default("US"),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .default("USD"),
});

const sellerProductSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().min(8).max(600),
  amount: z.number().positive().max(100000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .default("USD"),
  contentUrl: z.string().trim().max(500).optional(),
  coverUrl: z.string().trim().max(500).optional(),
});

const checkoutSchema = z.object({
  productId: z.string().uuid(),
});

const withdrawalSchema = z.object({
  amount: z.number().positive().max(100000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .default("USD"),
});

const connectOnboardingSchema = z
  .object({
    returnPath: z.enum(["/sell", "/wallet", "/transfers", "/banking"]).default("/sell"),
  })
  .optional();

const adminReviewProductSchema = z.object({
  productId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "disabled"]),
  note: z.string().trim().max(240).optional(),
});

const adminWithdrawalSchema = z.object({
  withdrawalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "canceled"]),
  note: z.string().trim().max(240).optional(),
});

type SellerRow = {
  id: string;
  telegram_user_id: number | null;
  web_user_id: string | null;
  display_name: string;
  handle: string | null;
  country: string;
  currency: string;
  status: string;
  stripe_account_id: string | null;
  stripe_account_status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type ProductRow = {
  id: string;
  seller_id: string;
  slug: string;
  title: string;
  description: string;
  price_amount_cents: number;
  price_currency: string;
  content_url: string | null;
  cover_url: string | null;
  status: string;
  active: boolean;
  featured: boolean;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  product_id: string | null;
  seller_id: string | null;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  seller_amount_cents: number;
  status: string;
  stripe_session_id: string | null;
  created_at: string;
  paid_at: string | null;
};

type WithdrawalRow = {
  id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  provider_transfer_id: string | null;
  admin_note: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
};

function db() {
  return supabaseAdmin as unknown as {
    from: (table: string) => ReturnType<typeof supabaseAdmin.from>;
  };
}

function walletUser(context: unknown) {
  return (context as WalletAuthContext).walletUser;
}

function adminId(context: unknown) {
  return (context as AdminAuthContext).adminTelegramUserId;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function platformFeeBps() {
  const configured = Number(process.env.MARKETPLACE_PLATFORM_FEE_BPS ?? "1500");
  if (!Number.isFinite(configured)) return 1500;
  return Math.min(Math.max(Math.round(configured), 0), 5000);
}

function money(cents: number, currency: string) {
  return {
    amount: cents / 100,
    currency: currency.toUpperCase(),
  };
}

function sellerView(seller: SellerRow, balanceCents = 0, pendingWithdrawalCents = 0) {
  return {
    id: seller.id,
    displayName: seller.display_name,
    handle: seller.handle ?? "",
    country: seller.country.toUpperCase(),
    currency: seller.currency.toUpperCase(),
    status: seller.status,
    stripeAccountId: seller.stripe_account_id ?? "",
    stripeStatus: seller.stripe_account_status,
    adminNote: seller.admin_note ?? "",
    balance: balanceCents / 100,
    pendingWithdrawal: pendingWithdrawalCents / 100,
    availableBalance: Math.max(0, balanceCents - pendingWithdrawalCents) / 100,
    createdAt: seller.created_at,
    updatedAt: seller.updated_at,
  };
}

function productView(product: ProductRow, sellerName?: string) {
  return {
    id: product.id,
    sellerId: product.seller_id,
    sellerName: sellerName ?? "Vendedor WalletBRED",
    slug: product.slug,
    title: product.title,
    description: product.description,
    amount: product.price_amount_cents / 100,
    currency: product.price_currency.toUpperCase(),
    contentUrl: product.content_url ?? "",
    coverUrl: product.cover_url ?? "",
    status: product.status,
    active: product.active,
    featured: product.featured,
    adminNote: product.admin_note ?? "",
    reviewedBy: product.reviewed_by ?? "",
    reviewedAt: product.reviewed_at ?? "",
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

function orderView(order: OrderRow) {
  return {
    id: order.id,
    productId: order.product_id ?? "",
    sellerId: order.seller_id ?? "",
    ...money(order.amount_cents, order.currency),
    platformFee: order.platform_fee_cents / 100,
    sellerAmount: order.seller_amount_cents / 100,
    status: order.status,
    stripeSessionId: order.stripe_session_id ?? "",
    createdAt: order.created_at,
    paidAt: order.paid_at ?? "",
  };
}

function withdrawalView(withdrawal: WithdrawalRow) {
  return {
    id: withdrawal.id,
    sellerId: withdrawal.seller_id,
    ...money(withdrawal.amount_cents, withdrawal.currency),
    status: withdrawal.status,
    provider: withdrawal.provider,
    providerTransferId: withdrawal.provider_transfer_id ?? "",
    adminNote: withdrawal.admin_note ?? "",
    requestedAt: withdrawal.requested_at,
    reviewedBy: withdrawal.reviewed_by ?? "",
    reviewedAt: withdrawal.reviewed_at ?? "",
    completedAt: withdrawal.completed_at ?? "",
  };
}

async function findSellerForWallet(context: unknown): Promise<SellerRow | null> {
  const user = walletUser(context);
  let query = db()
    .from("marketplace_sellers")
    .select(
      "id,telegram_user_id,web_user_id,display_name,handle,country,currency,status,stripe_account_id,stripe_account_status,admin_note,created_at,updated_at",
    )
    .maybeSingle();

  query =
    user.source === "telegram"
      ? query.eq("telegram_user_id", user.telegramUserId)
      : query.eq("web_user_id", user.webUserId);

  const { data, error } = await query;
  if (error) throw error;
  return (data as SellerRow | null) ?? null;
}

function defaultSellerCountry() {
  return (process.env.MARKETPLACE_DEFAULT_COUNTRY || "MX").slice(0, 2).toUpperCase();
}

function defaultSellerCurrency() {
  return (process.env.MARKETPLACE_DEFAULT_CURRENCY || "MXN").slice(0, 3).toLowerCase();
}

async function ensureSellerForWallet(context: unknown): Promise<SellerRow> {
  const existing = await findSellerForWallet(context);
  if (existing) return existing;

  const user = walletUser(context);
  const { data, error } = await db()
    .from("marketplace_sellers")
    .insert({
      telegram_user_id: user.telegramUserId,
      web_user_id: user.webUserId,
      display_name: user.source === "telegram" ? user.name : user.handle,
      handle: user.handle,
      country: defaultSellerCountry(),
      currency: defaultSellerCurrency(),
      status: "pending_onboarding",
      admin_note: "Perfil creado automaticamente al iniciar Stripe Connect.",
    })
    .select(
      "id,telegram_user_id,web_user_id,display_name,handle,country,currency,status,stripe_account_id,stripe_account_status,admin_note,created_at,updated_at",
    )
    .single();

  if (error) throw error;
  return data as SellerRow;
}

async function sellerBalanceCents(sellerId: string, currency = "usd") {
  const { data, error } = await db()
    .from("seller_ledger_entries")
    .select("amount_cents,currency,status")
    .eq("seller_id", sellerId)
    .eq("currency", currency.toLowerCase())
    .eq("status", "posted");

  if (error) throw error;
  return ((data ?? []) as Array<{ amount_cents: number }>).reduce(
    (sum, entry) => sum + entry.amount_cents,
    0,
  );
}

async function pendingWithdrawalCents(sellerId: string, currency = "usd") {
  const { data, error } = await db()
    .from("seller_withdrawal_requests")
    .select("amount_cents,currency,status")
    .eq("seller_id", sellerId)
    .eq("currency", currency.toLowerCase())
    .in("status", ["pending_review", "approved", "processing"]);

  if (error) throw error;
  return ((data ?? []) as Array<{ amount_cents: number }>).reduce(
    (sum, withdrawal) => sum + withdrawal.amount_cents,
    0,
  );
}

async function sellerAvailableBalanceCents(sellerId: string, currency = "usd") {
  const [balance, pending] = await Promise.all([
    sellerBalanceCents(sellerId, currency),
    pendingWithdrawalCents(sellerId, currency),
  ]);
  return Math.max(0, balance - pending);
}

async function ensureUniqueProductSlug(title: string) {
  const base = slugify(title) || "producto";
  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const { data, error } = await db()
      .from("marketplace_products")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const getMarketplaceDashboard = createServerFn({ method: "GET" })
  .middleware([requireWalletUser])
  .handler(async ({ context }) => {
    const seller = await findSellerForWallet(context);
    const { data: products, error: productsError } = await db()
      .from("marketplace_products")
      .select(
        "id,seller_id,slug,title,description,price_amount_cents,price_currency,content_url,cover_url,status,active,featured,admin_note,reviewed_by,reviewed_at,created_at,updated_at",
      )
      .eq("seller_id", seller?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false });

    if (productsError) throw productsError;

    const { data: publicProducts, error: publicError } = await db()
      .from("marketplace_products")
      .select(
        "id,seller_id,slug,title,description,price_amount_cents,price_currency,content_url,cover_url,status,active,featured,admin_note,reviewed_by,reviewed_at,created_at,updated_at,marketplace_sellers(display_name)",
      )
      .eq("status", "approved")
      .eq("active", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (publicError) throw publicError;

    const [balance, pendingWithdrawal] = seller
      ? await Promise.all([
          sellerBalanceCents(seller.id, seller.currency),
          pendingWithdrawalCents(seller.id, seller.currency),
        ])
      : [0, 0];

    const { data: orders } = seller
      ? await db()
          .from("marketplace_orders")
          .select(
            "id,product_id,seller_id,amount_cents,currency,platform_fee_cents,seller_amount_cents,status,stripe_session_id,created_at,paid_at",
          )
          .eq("seller_id", seller.id)
          .order("created_at", { ascending: false })
          .limit(30)
      : { data: [] };

    const { data: withdrawals } = seller
      ? await db()
          .from("seller_withdrawal_requests")
          .select(
            "id,seller_id,amount_cents,currency,status,provider,provider_transfer_id,admin_note,requested_at,reviewed_by,reviewed_at,completed_at",
          )
          .eq("seller_id", seller.id)
          .order("requested_at", { ascending: false })
          .limit(30)
      : { data: [] };

    return {
      seller: seller ? sellerView(seller, balance, pendingWithdrawal) : null,
      products: ((products ?? []) as ProductRow[]).map((product) => productView(product)),
      publicProducts: (
        (publicProducts ?? []) as Array<
          ProductRow & { marketplace_sellers?: { display_name?: string } }
        >
      ).map((product) => productView(product, product.marketplace_sellers?.display_name)),
      orders: ((orders ?? []) as OrderRow[]).map(orderView),
      withdrawals: ((withdrawals ?? []) as WithdrawalRow[]).map(withdrawalView),
      platformFeeBps: platformFeeBps(),
    };
  });

export const saveSellerProfile = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => sellerProfileSchema.parse(input))
  .handler(async ({ context, data }) => {
    const user = walletUser(context);
    const existing = await findSellerForWallet(context);
    const payload = {
      telegram_user_id: user.telegramUserId,
      web_user_id: user.webUserId,
      display_name: data.displayName,
      handle: user.handle,
      country: data.country.toUpperCase(),
      currency: data.currency.toLowerCase(),
      status: existing?.status ?? "pending_onboarding",
    };

    const { error } = existing
      ? await db().from("marketplace_sellers").update(payload).eq("id", existing.id)
      : await db().from("marketplace_sellers").insert(payload);

    if (error) throw error;
    return { ok: true as const };
  });

export const submitMarketplaceProduct = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => sellerProductSchema.parse(input))
  .handler(async ({ context, data }) => {
    const seller = await findSellerForWallet(context);
    if (!seller) throw new Response("Primero crea tu perfil de vendedor.", { status: 400 });
    if (!["active", "pending_onboarding"].includes(seller.status)) {
      throw new Response("Tu cuenta de vendedor no esta activa.", { status: 400 });
    }

    const contentUrl = data.contentUrl?.trim() || null;
    const coverUrl = data.coverUrl?.trim() || null;
    for (const url of [contentUrl, coverUrl]) {
      if (url && !/^https?:\/\//.test(url)) {
        throw new Response("Los enlaces deben empezar con http:// o https://.", { status: 400 });
      }
    }

    const { error } = await db()
      .from("marketplace_products")
      .insert({
        seller_id: seller.id,
        slug: await ensureUniqueProductSlug(data.title),
        title: data.title,
        description: data.description,
        price_amount_cents: Math.round(data.amount * 100),
        price_currency: data.currency.toLowerCase(),
        content_url: contentUrl,
        cover_url: coverUrl,
        status: "pending_review",
        active: false,
      });

    if (error) throw error;
    return { ok: true as const };
  });

export const startSellerConnectOnboarding = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => connectOnboardingSchema.parse(input))
  .handler(async ({ context, data }) => {
    const seller = await ensureSellerForWallet(context);
    const returnPath = data?.returnPath ?? "/sell";

    const stripe = getStripe();
    let accountId = seller.stripe_account_id;
    if (!accountId) {
      const account = await stripe.v2.core.accounts.create({
        contact_email: seller.web_user_id
          ? undefined
          : `${seller.telegram_user_id}@walletbred.local`,
        display_name: seller.display_name,
        dashboard: "express",
        identity: { country: seller.country, entity_type: "individual" },
        defaults: {
          currency: seller.currency,
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        metadata: { walletbred_seller_id: seller.id },
      });
      accountId = account.id;
      await db()
        .from("marketplace_sellers")
        .update({
          stripe_account_id: accountId,
          stripe_account_status: "onboarding",
          status: "pending_onboarding",
        })
        .eq("id", seller.id);
    }

    const appUrl = getAppUrl(new Request("https://walletbred.local"));
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${appUrl}${returnPath}?connect=refresh`,
          return_url: `${appUrl}${returnPath}?connect=return`,
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
        },
      },
    });

    return { url: link.url };
  });

export const startMarketplaceCheckout = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ context, data }) => {
    const buyer = walletUser(context);
    const { data: product, error } = await db()
      .from("marketplace_products")
      .select("id,seller_id,title,description,price_amount_cents,price_currency,status,active")
      .eq("id", data.productId)
      .maybeSingle();

    if (error) throw error;
    if (!product || product.status !== "approved" || !product.active) {
      throw new Response("Producto no disponible.", { status: 404 });
    }

    const feeCents = Math.round((product.price_amount_cents * platformFeeBps()) / 10000);
    const sellerCents = product.price_amount_cents - feeCents;
    const transferGroup = `marketplace_${crypto.randomUUID()}`;
    const appUrl = getAppUrl(new Request("https://walletbred.local"));
    const metadata: Record<string, string> = {
      kind: "marketplace_order",
      product_id: product.id,
      seller_id: product.seller_id,
      platform_fee_cents: String(feeCents),
      seller_amount_cents: String(sellerCents),
      transfer_group: transferGroup,
    };

    if (buyer.source === "telegram") metadata.buyer_telegram_user_id = String(buyer.telegramUserId);
    if (buyer.source === "web") metadata.buyer_web_user_id = buyer.webUserId;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: product.price_currency,
            unit_amount: product.price_amount_cents,
            product_data: {
              name: product.title,
              description: product.description.slice(0, 240),
            },
          },
        },
      ],
      success_url: `${appUrl}/sell?purchase=success`,
      cancel_url: `${appUrl}/sell?purchase=cancelled`,
      client_reference_id: buyer.id,
      metadata,
      payment_intent_data: {
        transfer_group: transferGroup,
        metadata,
      },
    });

    if (!session.url) throw new Response("Stripe no devolvio URL de checkout.", { status: 502 });
    return { url: session.url };
  });

export const requestSellerWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => withdrawalSchema.parse(input))
  .handler(async ({ context, data }) => {
    const seller = await findSellerForWallet(context);
    if (!seller) throw new Response("Primero crea tu perfil de vendedor.", { status: 400 });
    const amountCents = Math.round(data.amount * 100);
    const currency = data.currency.toLowerCase();
    const available = await sellerAvailableBalanceCents(seller.id, currency);
    if (amountCents > available) {
      throw new Response(
        `Saldo insuficiente. Disponible para retiro: ${new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: currency.toUpperCase(),
        }).format(available / 100)}.`,
        { status: 400 },
      );
    }

    const { error } = await db()
      .from("seller_withdrawal_requests")
      .insert({
        seller_id: seller.id,
        amount_cents: amountCents,
        currency,
        status: "pending_review",
        admin_note: seller.stripe_account_id
          ? "Pendiente de aprobacion admin."
          : "Falta completar Stripe Connect antes de pagar.",
      });

    if (error) throw error;
    return { ok: true as const };
  });

export const getAdminMarketplace = createServerFn({ method: "GET" })
  .middleware([requireAdminUser])
  .handler(async () => {
    const [{ data: sellers }, { data: products }, { data: orders }, { data: withdrawals }] =
      await Promise.all([
        db()
          .from("marketplace_sellers")
          .select(
            "id,telegram_user_id,web_user_id,display_name,handle,country,currency,status,stripe_account_id,stripe_account_status,admin_note,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        db()
          .from("marketplace_products")
          .select(
            "id,seller_id,slug,title,description,price_amount_cents,price_currency,content_url,cover_url,status,active,featured,admin_note,reviewed_by,reviewed_at,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(300),
        db()
          .from("marketplace_orders")
          .select(
            "id,product_id,seller_id,amount_cents,currency,platform_fee_cents,seller_amount_cents,status,stripe_session_id,created_at,paid_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        db()
          .from("seller_withdrawal_requests")
          .select(
            "id,seller_id,amount_cents,currency,status,provider,provider_transfer_id,admin_note,requested_at,reviewed_by,reviewed_at,completed_at",
          )
          .order("requested_at", { ascending: false })
          .limit(200),
      ]);

    const sellerRows = (sellers ?? []) as SellerRow[];
    const sellerNames = new Map(sellerRows.map((seller) => [seller.id, seller.display_name]));
    const balances = new Map<string, number>();
    for (const seller of sellerRows) {
      const [balance, pending] = await Promise.all([
        sellerBalanceCents(seller.id, seller.currency),
        pendingWithdrawalCents(seller.id, seller.currency),
      ]);
      balances.set(seller.id, balance);
      balances.set(`${seller.id}:pending`, pending);
    }

    return {
      sellers: sellerRows.map((seller) =>
        sellerView(seller, balances.get(seller.id) ?? 0, balances.get(`${seller.id}:pending`) ?? 0),
      ),
      products: ((products ?? []) as ProductRow[]).map((product) =>
        productView(product, sellerNames.get(product.seller_id)),
      ),
      orders: ((orders ?? []) as OrderRow[]).map(orderView),
      withdrawals: ((withdrawals ?? []) as WithdrawalRow[]).map(withdrawalView),
    };
  });

export const reviewMarketplaceProduct = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => adminReviewProductSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await db()
      .from("marketplace_products")
      .update({
        status: data.decision,
        active: data.decision === "approved",
        admin_note: data.note?.trim() || null,
        reviewed_by: adminId(context),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.productId);

    if (error) throw error;
    return { ok: true as const };
  });

export const reviewSellerWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireAdminUser])
  .inputValidator((input: unknown) => adminWithdrawalSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: withdrawal, error } = await db()
      .from("seller_withdrawal_requests")
      .select("id,seller_id,amount_cents,currency,status")
      .eq("id", data.withdrawalId)
      .maybeSingle();

    if (error) throw error;
    if (!withdrawal) throw new Response("Retiro no encontrado.", { status: 404 });
    if (withdrawal.status !== "pending_review") {
      throw new Response("Ese retiro ya fue revisado.", { status: 400 });
    }

    if (data.decision !== "approved") {
      const { error: updateError } = await db()
        .from("seller_withdrawal_requests")
        .update({
          status: data.decision,
          admin_note: data.note?.trim() || null,
          reviewed_by: adminId(context),
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id);
      if (updateError) throw updateError;
      return { ok: true as const, status: data.decision };
    }

    const balance = await sellerAvailableBalanceCents(withdrawal.seller_id, withdrawal.currency);
    if (withdrawal.amount_cents > balance + withdrawal.amount_cents) {
      throw new Response("Saldo insuficiente para aprobar el retiro.", { status: 400 });
    }

    const { data: seller, error: sellerError } = await db()
      .from("marketplace_sellers")
      .select("id,stripe_account_id")
      .eq("id", withdrawal.seller_id)
      .maybeSingle();
    if (sellerError) throw sellerError;
    if (!seller?.stripe_account_id) {
      throw new Response("El vendedor no tiene Stripe Connect listo.", { status: 400 });
    }

    const { error: approveError } = await db()
      .from("seller_withdrawal_requests")
      .update({
        status: "processing",
        admin_note: data.note?.trim() || "Aprobado por admin.",
        reviewed_by: adminId(context),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.id);
    if (approveError) throw approveError;

    try {
      const transfer = await getStripe().transfers.create({
        amount: withdrawal.amount_cents,
        currency: withdrawal.currency,
        destination: seller.stripe_account_id,
        transfer_group: `seller_withdrawal_${withdrawal.id}`,
        metadata: {
          walletbred_withdrawal_id: withdrawal.id,
          walletbred_seller_id: withdrawal.seller_id,
        },
      });

      await db().from("seller_ledger_entries").insert({
        seller_id: withdrawal.seller_id,
        withdrawal_request_id: withdrawal.id,
        type: "withdrawal_debit",
        amount_cents: -withdrawal.amount_cents,
        currency: withdrawal.currency,
        status: "posted",
        note: "Retiro pagado por Stripe Connect.",
      });

      await db()
        .from("seller_withdrawal_requests")
        .update({
          status: "paid",
          provider_transfer_id: transfer.id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id);

      return { ok: true as const, status: "paid", providerTransferId: transfer.id };
    } catch (transferError) {
      const message =
        transferError instanceof Error ? transferError.message : "Stripe rechazo la transferencia.";
      await db()
        .from("seller_withdrawal_requests")
        .update({ status: "failed", admin_note: message })
        .eq("id", withdrawal.id);
      throw new Response(message, { status: 400 });
    }
  });

export async function recordMarketplaceCheckoutCompleted(session: {
  id: string;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}) {
  const metadata = session.metadata ?? {};
  if (metadata.kind !== "marketplace_order") return false;

  const productId = metadata.product_id;
  const sellerId = metadata.seller_id;
  if (!productId || !sellerId) return false;

  const { data: product, error } = await db()
    .from("marketplace_products")
    .select("id,seller_id,price_amount_cents,price_currency,status,active")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  if (!product || product.seller_id !== sellerId) {
    throw new Error("Producto marketplace no coincide con el vendedor.");
  }

  const feeCents = Number(metadata.platform_fee_cents || "0");
  const sellerCents = Number(metadata.seller_amount_cents || product.price_amount_cents - feeCents);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  const orderPayload = {
    product_id: productId,
    seller_id: sellerId,
    buyer_telegram_user_id: metadata.buyer_telegram_user_id
      ? Number(metadata.buyer_telegram_user_id)
      : null,
    buyer_web_user_id: metadata.buyer_web_user_id || null,
    amount_cents: product.price_amount_cents,
    currency: product.price_currency,
    platform_fee_cents: feeCents,
    seller_amount_cents: sellerCents,
    status: "paid",
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId ?? null,
    transfer_group: metadata.transfer_group || null,
    paid_at: new Date().toISOString(),
  };

  const { data: order, error: orderError } = await db()
    .from("marketplace_orders")
    .upsert(orderPayload, { onConflict: "stripe_session_id" })
    .select("id")
    .single();
  if (orderError) throw orderError;

  const { data: existingEntry, error: existingError } = await db()
    .from("seller_ledger_entries")
    .select("id")
    .eq("order_id", order.id)
    .eq("type", "sale_credit")
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingEntry) {
    const { error: ledgerError } = await db().from("seller_ledger_entries").insert({
      seller_id: sellerId,
      order_id: order.id,
      type: "sale_credit",
      amount_cents: sellerCents,
      currency: product.price_currency,
      status: "posted",
      note: "Venta marketplace pagada.",
    });
    if (ledgerError) throw ledgerError;
  }

  return true;
}
