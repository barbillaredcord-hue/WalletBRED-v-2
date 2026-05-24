import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireWalletUser, type WalletAuthContext } from "@/lib/telegram-auth.middleware";

type PremiumProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: string;
  price_amount_cents: number;
  price_currency: string;
  stars_amount: number | null;
  active: boolean;
  featured: boolean;
  sort_order: number;
};

type PremiumContentRow = {
  id: string;
  product_id: string | null;
  title: string;
  content_type: string;
  preview: string;
  content_url: string | null;
  access_level: string;
  active: boolean;
  sort_order: number;
};

type TelegramSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
};

type TelegramUserLike = {
  id?: number;
  username?: string;
};

const invoiceSchema = z.object({
  productId: z.string().uuid(),
});

function walletContext(context: unknown) {
  return (context as WalletAuthContext).walletUser;
}

function truncateTelegram(value: string, max: number) {
  return value.trim().slice(0, max) || "WalletBRED Premium";
}

function starsForProduct(product: PremiumProductRow) {
  return product.stars_amount && product.stars_amount > 0
    ? product.stars_amount
    : Math.max(1, Math.round(product.price_amount_cents / 100));
}

function productView(product: PremiumProductRow, content: PremiumContentRow[] = []) {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    kind: product.kind,
    starsAmount: starsForProduct(product),
    featured: product.featured,
    active: product.active,
    content: content.map((item) => ({
      id: item.id,
      title: item.title,
      contentType: item.content_type,
      preview: item.preview,
      contentUrl: item.content_url ?? "",
      accessLevel: item.access_level,
    })),
  };
}

function createPurchaseId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API error: ${method}`);
  }
  return payload.result as T;
}

async function readActiveStarsProductById(productId: string) {
  const { data, error } = await supabaseAdmin
    .from("premium_products")
    .select(
      "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,active,featured,sort_order",
    )
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Response("Producto premium no encontrado.", { status: 404 });
  return data as PremiumProductRow;
}

async function readActiveStarsProductBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("premium_products")
    .select(
      "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,active,featured,sort_order",
    )
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data as PremiumProductRow | null;
}

async function readPremiumContent(productIds: string[]) {
  if (!productIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("premium_content_items")
    .select("id,product_id,title,content_type,preview,content_url,access_level,active,sort_order")
    .in("product_id", productIds)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PremiumContentRow[];
}

async function createPendingStarsPurchase({
  product,
  telegramUserId,
  telegramUsername,
  chatId,
}: {
  product: PremiumProductRow;
  telegramUserId: number;
  telegramUsername: string | null;
  chatId: number | null;
}) {
  const purchaseId = createPurchaseId();
  const invoicePayload = `wb:${purchaseId}`;
  const { data: purchase, error } = await supabaseAdmin
    .from("telegram_stars_purchases")
    .insert({
      id: purchaseId,
      product_id: product.id,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      chat_id: chatId,
      invoice_payload: invoicePayload,
      currency: "XTR",
      total_amount: starsForProduct(product),
      status: "pending",
      delivery_status: "not_ready",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { purchaseId: purchase.id, invoicePayload };
}

async function createStarsInvoiceLink({
  product,
  invoicePayload,
}: {
  product: PremiumProductRow;
  invoicePayload: string;
}) {
  return telegramApi<string>("createInvoiceLink", {
    title: truncateTelegram(product.title, 32),
    description: truncateTelegram(product.description || product.title, 255),
    payload: invoicePayload,
    currency: "XTR",
    prices: [{ label: truncateTelegram(product.title, 32), amount: starsForProduct(product) }],
  });
}

async function sendStarsInvoice({
  chatId,
  product,
  invoicePayload,
}: {
  chatId: number;
  product: PremiumProductRow;
  invoicePayload: string;
}) {
  await telegramApi<boolean>("sendInvoice", {
    chat_id: chatId,
    title: truncateTelegram(product.title, 32),
    description: truncateTelegram(product.description || product.title, 255),
    payload: invoicePayload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: truncateTelegram(product.title, 32), amount: starsForProduct(product) }],
    start_parameter: `walletbred-${product.slug}`.slice(0, 64),
  });
}

export async function answerTelegramPreCheckoutQuery({
  preCheckoutQueryId,
  ok,
  errorMessage,
}: {
  preCheckoutQueryId: string;
  ok: boolean;
  errorMessage?: string;
}) {
  await telegramApi<boolean>("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage || "No se pudo validar esta compra." }),
  });
}

export async function sendTelegramMessage(chatId: number, text: string) {
  await telegramApi<boolean>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function markPurchaseFailed(purchaseId: string, reason: string) {
  await supabaseAdmin
    .from("telegram_stars_purchases")
    .update({ status: "failed", delivery_status: "failed", delivery_error: reason.slice(0, 500) })
    .eq("id", purchaseId);
}

function purchaseIdFromPayload(payload: string) {
  const match = /^wb:([0-9a-f-]{36})$/i.exec(payload);
  return match?.[1] ?? null;
}

async function getPurchaseForPayload(payload: string) {
  const purchaseId = purchaseIdFromPayload(payload);
  if (!purchaseId) return null;
  const { data, error } = await supabaseAdmin
    .from("telegram_stars_purchases")
    .select(
      "id,product_id,telegram_user_id,chat_id,invoice_payload,total_amount,currency,status,delivery_status,telegram_payment_charge_id",
    )
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function validateTelegramStarsPreCheckout(query: {
  id: string;
  from?: TelegramUserLike;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}) {
  const purchase = await getPurchaseForPayload(query.invoice_payload);
  if (!purchase) {
    await answerTelegramPreCheckoutQuery({
      preCheckoutQueryId: query.id,
      ok: false,
      errorMessage: "Compra no encontrada. Vuelve a abrir la tienda.",
    });
    return;
  }

  const ok =
    query.currency === "XTR" &&
    purchase.currency === "XTR" &&
    query.total_amount === purchase.total_amount &&
    (!query.from?.id || Number(query.from.id) === Number(purchase.telegram_user_id)) &&
    ["pending", "pre_checkout"].includes(purchase.status);

  if (!ok) {
    await answerTelegramPreCheckoutQuery({
      preCheckoutQueryId: query.id,
      ok: false,
      errorMessage: "El producto o el importe ya no coinciden. Genera una compra nueva.",
    });
    return;
  }

  await supabaseAdmin
    .from("telegram_stars_purchases")
    .update({ status: "pre_checkout", pre_checkout_query_id: query.id })
    .eq("id", purchase.id);

  await answerTelegramPreCheckoutQuery({ preCheckoutQueryId: query.id, ok: true });
}

async function buildDeliveryMessage(product: PremiumProductRow, content: PremiumContentRow[]) {
  const lines = [
    `Compra confirmada: <b>${escapeHtml(product.title)}</b>`,
    "",
    "Tu acceso premium ya esta activo.",
  ];

  if (content.length) {
    lines.push("", "Contenido disponible:");
    for (const item of content.slice(0, 8)) {
      const url = item.content_url ? `\n${escapeHtml(item.content_url)}` : "";
      lines.push(
        `- ${escapeHtml(item.title)}: ${escapeHtml(item.preview || item.content_type)}${url}`,
      );
    }
  } else {
    lines.push("", "El contenido quedo preparado y aparecera en tu historial premium.");
  }

  return lines.join("\n");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function fulfillTelegramStarsPayment({
  payment,
  from,
  chatId,
}: {
  payment: TelegramSuccessfulPayment;
  from?: TelegramUserLike;
  chatId?: number;
}) {
  const purchase = await getPurchaseForPayload(payment.invoice_payload);
  if (!purchase) return;

  if (
    purchase.status === "fulfilled" &&
    purchase.delivery_status === "sent" &&
    purchase.telegram_payment_charge_id === payment.telegram_payment_charge_id
  ) {
    return;
  }

  if (payment.currency !== "XTR" || payment.total_amount !== purchase.total_amount) {
    await markPurchaseFailed(purchase.id, "El pago confirmado no coincide con la orden.");
    return;
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from("premium_products")
    .select(
      "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,active,featured,sort_order",
    )
    .eq("id", purchase.product_id)
    .maybeSingle();

  if (productError) throw productError;
  if (!product) {
    await markPurchaseFailed(purchase.id, "Producto premium no encontrado.");
    return;
  }

  const telegramUserId = from?.id ?? purchase.telegram_user_id;
  const targetChatId = chatId ?? purchase.chat_id ?? telegramUserId;

  const { error: updateError } = await supabaseAdmin
    .from("telegram_stars_purchases")
    .update({
      status: "paid",
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      provider_payment_charge_id: payment.provider_payment_charge_id ?? null,
      raw_successful_payment: payment,
      chat_id: targetChatId,
      delivery_status: "pending",
    })
    .eq("id", purchase.id);
  if (updateError) throw updateError;

  await supabaseAdmin.from("premium_user_entitlements").insert({
    product_id: product.id,
    telegram_user_id: telegramUserId,
    source: "telegram_stars",
    status: "active",
  });

  const content = await readPremiumContent([product.id]);
  try {
    await sendTelegramMessage(
      targetChatId,
      await buildDeliveryMessage(product as PremiumProductRow, content),
    );
    await supabaseAdmin
      .from("telegram_stars_purchases")
      .update({
        status: "fulfilled",
        delivery_status: "sent",
        delivered_at: new Date().toISOString(),
        delivery_error: null,
      })
      .eq("id", purchase.id);
  } catch (error) {
    await supabaseAdmin
      .from("telegram_stars_purchases")
      .update({
        status: "paid",
        delivery_status: "failed",
        delivery_error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
      })
      .eq("id", purchase.id);
  }
}

export async function sendTelegramStore(chatId: number) {
  const products = await listTelegramStarsProductsRaw();
  if (!products.length) {
    await sendTelegramMessage(chatId, "No hay productos premium activos por ahora.");
    return;
  }

  const lines = [
    "<b>WalletBRED Store</b>",
    "Compra contenido digital con Telegram Stars.",
    "",
    ...products.map(
      (product) =>
        `- <b>${escapeHtml(product.title)}</b> (${starsForProduct(product)} XTR)\n  /buy ${escapeHtml(product.slug)}`,
    ),
  ];
  await sendTelegramMessage(chatId, lines.join("\n"));
}

export async function sendTelegramPurchaseHistory(chatId: number, telegramUserId: number) {
  const purchases = await listPurchasesForTelegramUser(telegramUserId);
  if (!purchases.length) {
    await sendTelegramMessage(chatId, "Todavia no tienes compras premium registradas.");
    return;
  }

  const lines = [
    "<b>Mis compras WalletBRED</b>",
    "",
    ...purchases
      .slice(0, 10)
      .map(
        (purchase) =>
          `- ${escapeHtml(purchase.productTitle)} · ${purchase.totalAmount} XTR · ${purchase.status}`,
      ),
  ];
  await sendTelegramMessage(chatId, lines.join("\n"));
}

export async function sendTelegramProductInvoice({
  chatId,
  from,
  slug,
}: {
  chatId: number;
  from: TelegramUserLike;
  slug: string;
}) {
  const product = await readActiveStarsProductBySlug(slug);
  if (!product) {
    await sendTelegramMessage(chatId, "Producto no encontrado. Usa /store para ver opciones.");
    return;
  }

  const { invoicePayload } = await createPendingStarsPurchase({
    product,
    telegramUserId: Number(from.id),
    telegramUsername: from.username ?? null,
    chatId,
  });
  await sendStarsInvoice({ chatId, product, invoicePayload });
}

async function listTelegramStarsProductsRaw() {
  const { data, error } = await supabaseAdmin
    .from("premium_products")
    .select(
      "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,active,featured,sort_order",
    )
    .eq("active", true)
    .not("stars_amount", "is", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PremiumProductRow[];
}

async function listPurchasesForTelegramUser(telegramUserId: number) {
  const { data: purchases, error } = await supabaseAdmin
    .from("telegram_stars_purchases")
    .select(
      "id,product_id,total_amount,status,delivery_status,delivered_at,created_at,telegram_payment_charge_id",
    )
    .eq("telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const productIds = [
    ...new Set((purchases ?? []).map((purchase) => purchase.product_id).filter(Boolean)),
  ];
  const { data: products, error: productError } = productIds.length
    ? await supabaseAdmin.from("premium_products").select("id,title,slug").in("id", productIds)
    : { data: [], error: null };
  if (productError) throw productError;

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  return (purchases ?? []).map((purchase) => {
    const product = purchase.product_id ? productMap.get(purchase.product_id) : null;
    return {
      id: purchase.id,
      productId: purchase.product_id ?? "",
      productTitle: product?.title ?? "Producto premium",
      productSlug: product?.slug ?? "",
      totalAmount: purchase.total_amount,
      status: purchase.status,
      deliveryStatus: purchase.delivery_status,
      deliveredAt: purchase.delivered_at,
      createdAt: purchase.created_at,
      telegramPaymentChargeId: purchase.telegram_payment_charge_id ?? "",
    };
  });
}

export const listTelegramStarsProducts = createServerFn({ method: "GET" }).handler(async () => {
  const products = await listTelegramStarsProductsRaw();
  const content = await readPremiumContent(products.map((product) => product.id));
  const contentByProduct = new Map<string, PremiumContentRow[]>();
  for (const item of content) {
    const list = contentByProduct.get(item.product_id ?? "") ?? [];
    list.push(item);
    contentByProduct.set(item.product_id ?? "", list);
  }
  return products.map((product) => productView(product, contentByProduct.get(product.id) ?? []));
});

export const createTelegramStarsInvoice = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => invoiceSchema.parse(input))
  .handler(async ({ context, data }) => {
    const walletUser = walletContext(context);
    if (walletUser.source !== "telegram" || !walletUser.telegramUserId) {
      throw new Response("Abre WalletBRED dentro de Telegram para pagar con Stars.", {
        status: 400,
      });
    }

    const product = await readActiveStarsProductById(data.productId);
    const { purchaseId, invoicePayload } = await createPendingStarsPurchase({
      product,
      telegramUserId: walletUser.telegramUserId,
      telegramUsername: walletUser.handle.replace(/^@/, "") || null,
      chatId: walletUser.telegramUserId,
    });

    try {
      const invoiceUrl = await createStarsInvoiceLink({ product, invoicePayload });
      const { error } = await supabaseAdmin
        .from("telegram_stars_purchases")
        .update({ invoice_url: invoiceUrl })
        .eq("id", purchaseId);
      if (error) throw error;
      return { invoiceUrl, purchaseId };
    } catch (error) {
      await markPurchaseFailed(
        purchaseId,
        error instanceof Error ? error.message : "Invoice failed",
      );
      throw error;
    }
  });

export const listMyTelegramStarsPurchases = createServerFn({ method: "GET" })
  .middleware([requireWalletUser])
  .handler(async ({ context }) => {
    const walletUser = walletContext(context);
    if (walletUser.source !== "telegram" || !walletUser.telegramUserId) return [];
    return listPurchasesForTelegramUser(walletUser.telegramUserId);
  });
