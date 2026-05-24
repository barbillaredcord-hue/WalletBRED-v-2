import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireWalletUser, type WalletAuthContext } from "@/lib/telegram-auth.middleware";
import { sendTelegramMessage, sendTelegramProductInvoice } from "@/lib/telegram-stars.functions";

type CatalogProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: string;
  starsAmount: number | null;
  stripePriceId: string;
  externalUrl: string;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  content: Array<{
    title: string;
    type: string;
    accessLevel: string;
    available: boolean;
  }>;
};

type AiAction = {
  type: "buy_stars";
  productId: string;
  slug: string;
  label: string;
} | null;

type AiReply = {
  text: string;
  action: AiAction;
};

type TelegramUserLike = {
  id?: number;
  username?: string;
};

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const inputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
  mode: z.enum(["client", "admin"]).default("client"),
  demo: z.boolean().optional(),
});

type ResponsesApiTextPart = {
  type?: string;
  text?: string;
};

type ResponsesApiOutputItem = {
  type?: string;
  content?: ResponsesApiTextPart[];
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: ResponsesApiOutputItem[];
  error?: {
    message?: string;
    code?: string | null;
  };
};

function extractText(payload: ResponsesApiResponse) {
  if (payload.output_text) return payload.output_text.trim();

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return text || "No pude generar una respuesta en este momento.";
}

function getAiConfig() {
  const provider = process.env.AI_PROVIDER === "groq" ? "groq" : "openai";

  if (provider === "groq") {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY,
      apiKeyName: "GROQ_API_KEY",
      endpoint: "https://api.groq.com/openai/v1/responses",
      model:
        process.env.AI_CHAT_MODEL ??
        process.env.GROQ_CHAT_MODEL ??
        process.env.OPENAI_CHAT_MODEL ??
        "openai/gpt-oss-20b",
    };
  }

  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY,
    apiKeyName: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/responses",
    model: process.env.AI_CHAT_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
  };
}

function formatAiError(provider: string, status: number, payload: ResponsesApiResponse) {
  const providerName = provider === "groq" ? "Groq" : "OpenAI";

  if (payload.error?.code === "insufficient_quota") {
    return [
      `No pude completar la respuesta con ${providerName} porque el proyecto no tiene cuota disponible.`,
      "Revisa billing/credits o usa otra API key con saldo activo.",
    ].join(" ");
  }

  return `No pude completar la respuesta con ${providerName} (${status}). ${
    payload.error?.message ?? "Intenta de nuevo."
  }`;
}

function walletContext(context: unknown) {
  return (context as WalletAuthContext).walletUser;
}

function adminIdsFromEnv() {
  return (process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_USER_ID || "91147095")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function allowedAdminIds() {
  const { data } = await supabaseAdmin
    .from("admin_access_grants")
    .select("telegram_user_id")
    .eq("active", true);
  return [
    ...new Set([
      ...adminIdsFromEnv(),
      ...(data ?? []).map((row) => row.telegram_user_id).filter(Boolean),
    ]),
  ];
}

async function assertAdminTelegramUser(telegramUserId: number | null | undefined) {
  if (!telegramUserId)
    throw new Response("Admin IA solo funciona dentro de Telegram.", { status: 401 });
  const allowed = await allowedAdminIds();
  if (!allowed.includes(String(telegramUserId))) {
    throw new Response("No tienes permiso para usar el modo admin IA.", { status: 403 });
  }
}

function starsForProduct(product: { stars_amount: number | null; price_amount_cents: number }) {
  return product.stars_amount && product.stars_amount > 0
    ? product.stars_amount
    : Math.max(1, Math.round(product.price_amount_cents / 100));
}

async function readCatalog({ includeInactive = false }: { includeInactive?: boolean } = {}) {
  let productQuery = supabaseAdmin
    .from("premium_products")
    .select(
      "id,slug,title,description,kind,price_amount_cents,price_currency,stars_amount,stripe_price_id,external_url,active,featured,sort_order",
    )
    .order("sort_order", { ascending: true });

  if (!includeInactive) productQuery = productQuery.eq("active", true);

  const [{ data: products, error: productError }, { data: content, error: contentError }] =
    await Promise.all([
      productQuery,
      supabaseAdmin
        .from("premium_content_items")
        .select("product_id,title,content_type,access_level,active,sort_order")
        .order("sort_order", { ascending: true }),
    ]);

  if (productError) throw productError;
  if (contentError) throw contentError;

  const contentByProduct = new Map<string, NonNullable<typeof content>>();
  for (const item of content ?? []) {
    const list = contentByProduct.get(item.product_id ?? "") ?? [];
    list.push(item);
    contentByProduct.set(item.product_id ?? "", list);
  }

  return (products ?? []).map((product) => ({
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    kind: product.kind,
    starsAmount: product.stars_amount ? starsForProduct(product) : null,
    stripePriceId: product.stripe_price_id ?? "",
    externalUrl: product.external_url ?? "",
    active: product.active,
    featured: product.featured,
    sortOrder: product.sort_order,
    content: (contentByProduct.get(product.id) ?? []).map((item) => ({
      title: item.title,
      type: item.content_type,
      accessLevel: item.access_level,
      available: item.active,
    })),
  })) satisfies CatalogProduct[];
}

async function readSalesSummary() {
  const [{ data: purchases }, { data: deliveries }] = await Promise.all([
    supabaseAdmin
      .from("telegram_stars_purchases")
      .select("id,total_amount,status,delivery_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("premium_delivery_events")
      .select("id,status,attempt_count,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const paid = (purchases ?? []).filter((purchase) =>
    ["paid", "fulfilled"].includes(purchase.status),
  );
  return {
    purchases: purchases?.length ?? 0,
    paid: paid.length,
    fulfilled: paid.filter((purchase) => purchase.delivery_status === "sent").length,
    failedDeliveries: (deliveries ?? []).filter((delivery) => delivery.status === "failed").length,
    starsTotal: paid.reduce((sum, purchase) => sum + (purchase.total_amount ?? 0), 0),
  };
}

function latestUserText(messages: Array<{ role: string; content: string }>) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findProductInText(text: string, catalog: CatalogProduct[]) {
  const haystack = normalize(text);
  return (
    catalog.find((product) => haystack.includes(normalize(product.slug))) ??
    catalog.find((product) => haystack.includes(normalize(product.title))) ??
    null
  );
}

function wantsToBuy(text: string) {
  return /\b(comprar|compra|quiero|pagar|adquirir|buy|pay|suscribir|obtener)\b/i.test(text);
}

function fallbackClientReply(text: string, catalog: CatalogProduct[]): AiReply {
  const product = findProductInText(text, catalog);
  const buyIntent = wantsToBuy(text);

  if (product) {
    const stars = product.starsAmount ? `${product.starsAmount} XTR` : "sin precio Stars activo";
    return {
      text: [
        `${product.title}: ${product.description || "Producto premium WalletBRED."}`,
        `Precio Stars: ${stars}. Estado: ${product.active ? "activo" : "inactivo"}.`,
        product.content.length
          ? `Incluye: ${product.content.map((item) => item.title).join(", ")}.`
          : "No tiene contenido publicado todavia.",
        buyIntent && product.starsAmount
          ? `Para comprarlo con Telegram Stars usa /buy ${product.slug} o pulsa el boton de compra.`
          : "Si quieres comprarlo, dime: quiero comprar este producto.",
      ].join("\n"),
      action: buyIntent && product.starsAmount ? buyAction(product) : null,
    };
  }

  const available = catalog.filter((item) => item.active && item.starsAmount);
  return {
    text: [
      "Puedo ayudarte con compras, accesos, pagos con Telegram Stars y entregas premium.",
      available.length
        ? `Productos activos: ${available
            .map((item) => `${item.title} (${item.starsAmount} XTR)`)
            .join(", ")}.`
        : "Ahora mismo no hay productos con Stars activos.",
      "Dime que buscas y te recomiendo una opcion real del catalogo.",
    ].join("\n"),
    action: null,
  };
}

function buyAction(product: CatalogProduct): NonNullable<AiAction> {
  return {
    type: "buy_stars",
    productId: product.id,
    slug: product.slug,
    label: `Comprar ${product.title} con Stars`,
  };
}

function catalogFacts(catalog: CatalogProduct[]) {
  return catalog.map((product) => ({
    slug: product.slug,
    title: product.title,
    description: product.description,
    kind: product.kind,
    starsAmount: product.starsAmount,
    active: product.active,
    featured: product.featured,
    content: product.content,
  }));
}

async function callAi(messages: Array<{ role: string; content: string }>, instructions: string) {
  const aiConfig = getAiConfig();
  if (!aiConfig.apiKey) return null;

  const response = await fetch(aiConfig.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aiConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: aiConfig.model,
      instructions,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_output_tokens: 700,
    }),
  });

  const payload = (await response.json()) as ResponsesApiResponse;
  if (!response.ok) return formatAiError(aiConfig.provider, response.status, payload);
  return extractText(payload);
}

async function clientAiReply(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const catalog = await readCatalog();
  const userText = latestUserText(messages);
  const matchedProduct = findProductInText(userText, catalog);
  const action =
    matchedProduct && wantsToBuy(userText) && matchedProduct.starsAmount
      ? buyAction(matchedProduct)
      : null;
  const fallback = fallbackClientReply(userText, catalog);
  const instructions = [
    "Eres el asistente de ventas y soporte de WalletBRED.",
    "Responde en español, breve y concreto.",
    "Solo puedes hablar de productos, precios, disponibilidad y beneficios presentes en CATALOGO_REAL.",
    "No inventes productos, precios, descuentos ni disponibilidad.",
    "Si preguntan por pagos, explica que los productos digitales se pagan con Telegram Stars (XTR) y se entregan despues de successful_payment.",
    "Si quieren comprar un producto con precio Stars, indica el comando exacto /buy slug o que usen el boton de compra de la Mini App.",
    `CATALOGO_REAL=${JSON.stringify(catalogFacts(catalog))}`,
  ].join("\n");

  const text = await callAi(messages, instructions);
  return { text: text ?? fallback.text, action: action ?? fallback.action };
}

function parseAdminCommand(text: string) {
  const trimmed = text.replace(/^\/adminai\s*/i, "").trim();
  const parts = trimmed.split(/\s+/);
  const command = normalize(parts[0] ?? "");
  return { trimmed, command, parts };
}

async function adminAiReply(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  telegramUserId: number | null,
) {
  await assertAdminTelegramUser(telegramUserId);
  const userText = latestUserText(messages);
  const { trimmed, command, parts } = parseAdminCommand(userText);

  if (!trimmed || ["ayuda", "help"].includes(command)) {
    return {
      text: [
        "Modo admin IA activo. Comandos disponibles:",
        "- ventas",
        "- activar <slug>",
        "- desactivar <slug>",
        "- precio <slug> <stars>",
        "- agregar <slug> | <titulo> | <descripcion> | <stars>",
        "- reenviar <purchase_id>",
      ].join("\n"),
      action: null,
    };
  }

  if (["ventas", "sales", "resumen"].includes(command)) {
    const [catalog, sales] = await Promise.all([
      readCatalog({ includeInactive: true }),
      readSalesSummary(),
    ]);
    return {
      text: [
        `Ventas Stars pagadas: ${sales.paid}/${sales.purchases}.`,
        `Stars cobradas: ${sales.starsTotal} XTR.`,
        `Entregas completas: ${sales.fulfilled}. Errores de entrega: ${sales.failedDeliveries}.`,
        `Productos totales: ${catalog.length}. Activos: ${catalog.filter((item) => item.active).length}.`,
      ].join("\n"),
      action: null,
    };
  }

  if (["activar", "desactivar"].includes(command)) {
    const slug = parts[1];
    if (!slug)
      return { text: "Falta slug. Ejemplo: activar walletbred-premium-content", action: null };
    const { error } = await supabaseAdmin
      .from("premium_products")
      .update({ active: command === "activar" })
      .eq("slug", slug);
    if (error) throw error;
    return {
      text: `Producto ${slug} ${command === "activar" ? "activado" : "desactivado"}.`,
      action: null,
    };
  }

  if (command === "precio") {
    const slug = parts[1];
    const stars = Number(parts[2]);
    if (!slug || !Number.isFinite(stars) || stars <= 0) {
      return {
        text: "Formato: precio <slug> <stars>. Ejemplo: precio telegram-stars-pack 500",
        action: null,
      };
    }
    const { error } = await supabaseAdmin
      .from("premium_products")
      .update({ stars_amount: Math.round(stars), price_amount_cents: Math.round(stars) * 100 })
      .eq("slug", slug);
    if (error) throw error;
    return { text: `Precio Stars actualizado: ${slug} = ${Math.round(stars)} XTR.`, action: null };
  }

  if (command === "agregar") {
    const raw = trimmed.replace(/^agregar\s+/i, "");
    const [slugRaw, titleRaw, descriptionRaw, starsRaw] = raw
      .split("|")
      .map((value) => value.trim());
    const stars = Number(starsRaw);
    if (!slugRaw || !titleRaw || !Number.isFinite(stars) || stars <= 0) {
      return {
        text: "Formato: agregar <slug> | <titulo> | <descripcion> | <stars>",
        action: null,
      };
    }
    const slug = slugRaw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const { error } = await supabaseAdmin.from("premium_products").insert({
      slug,
      title: titleRaw,
      description: descriptionRaw ?? "",
      kind: "telegram_store",
      price_amount_cents: Math.round(stars) * 100,
      price_currency: "usd",
      stars_amount: Math.round(stars),
      active: true,
      featured: false,
      sort_order: 100,
    });
    if (error) throw error;
    return {
      text: `Producto agregado y activo: ${titleRaw} (${Math.round(stars)} XTR).`,
      action: null,
    };
  }

  if (command === "reenviar") {
    const purchaseId = parts[1];
    if (!purchaseId) return { text: "Formato: reenviar <purchase_id>", action: null };
    const { deliverTelegramStarsPurchase } = await import("@/lib/telegram-stars.functions");
    const result = await deliverTelegramStarsPurchase({
      purchaseId,
      force: true,
      requestedBy: String(telegramUserId),
    });
    return {
      text: `Reenvio ejecutado. Enviados: ${result.delivered}, omitidos: ${result.skipped}, errores: ${result.failed}.`,
      action: null,
    };
  }

  return {
    text: "No reconozco ese comando admin. Escribe 'ayuda' en modo admin IA para ver formatos seguros.",
    action: null,
  };
}

export const sendAiChatMessage = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const walletUser = walletContext(context);
    if (data.mode === "admin") {
      return adminAiReply(data.messages, walletUser.telegramUserId);
    }
    return clientAiReply(data.messages);
  });

export async function handleTelegramAiMessage({
  chatId,
  from,
  text,
  adminMode = false,
}: {
  chatId: number;
  from: TelegramUserLike;
  text: string;
  adminMode?: boolean;
}) {
  const mode = adminMode ? "admin" : "client";
  const reply =
    mode === "admin"
      ? await adminAiReply([{ role: "user", content: text }], from.id ?? null)
      : await clientAiReply([{ role: "user", content: text }]);

  await sendTelegramMessage(chatId, reply.text);
  if (!adminMode && reply.action?.type === "buy_stars" && from.id && wantsToBuy(text)) {
    await sendTelegramProductInvoice({ chatId, from, slug: reply.action.slug });
  }
}
