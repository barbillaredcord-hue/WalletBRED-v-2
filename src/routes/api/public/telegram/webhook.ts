import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { handleTelegramAiMessage } from "@/lib/ai-chat.functions";
import {
  fulfillTelegramStarsPayment,
  sendTelegramProductInvoice,
  sendTelegramPurchaseHistory,
  sendTelegramStore,
  validateTelegramStarsPreCheckout,
} from "@/lib/telegram-stars.functions";

function deriveTelegramWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`telegram-webhook:${botToken}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          return new Response("TELEGRAM_BOT_TOKEN not configured", { status: 500 });
        }

        const expectedSecret =
          process.env.TELEGRAM_WEBHOOK_SECRET ||
          process.env.TELEGRAM_API_KEY ||
          deriveTelegramWebhookSecret(botToken);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actualSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();
        const message = update.message ?? update.edited_message;

        console.log("[telegram] update", {
          update_id: update.update_id,
          chat_id: message?.chat?.id,
          from: message?.from?.username,
          text: message?.text,
          has_pre_checkout_query: Boolean(update.pre_checkout_query),
          has_successful_payment: Boolean(message?.successful_payment),
        });

        if (update.pre_checkout_query) {
          await validateTelegramStarsPreCheckout(update.pre_checkout_query);
          return Response.json({ ok: true });
        }

        if (message?.successful_payment) {
          await fulfillTelegramStarsPayment({
            payment: message.successful_payment,
            from: message.from,
            chatId: message.chat?.id,
          });
          return Response.json({ ok: true });
        }

        const text = typeof message?.text === "string" ? message.text.trim() : "";
        const chatId = Number(message?.chat?.id);
        const from = message?.from;

        if (chatId && text === "/store") {
          await sendTelegramStore(chatId);
          return Response.json({ ok: true });
        }

        if (chatId && text === "/purchases" && from?.id) {
          await sendTelegramPurchaseHistory(chatId, Number(from.id));
          return Response.json({ ok: true });
        }

        if (chatId && text.startsWith("/buy ") && from?.id) {
          const slug = text
            .replace(/^\/buy\s+/i, "")
            .trim()
            .split(/\s+/)[0];
          await sendTelegramProductInvoice({ chatId, from, slug });
          return Response.json({ ok: true });
        }

        if (chatId && text.startsWith("/adminai") && from?.id) {
          await handleTelegramAiMessage({
            chatId,
            from,
            text,
            adminMode: true,
          });
          return Response.json({ ok: true });
        }

        if (chatId && text.startsWith("/ai ") && from?.id) {
          await handleTelegramAiMessage({
            chatId,
            from,
            text: text.replace(/^\/ai\s+/i, ""),
          });
          return Response.json({ ok: true });
        }

        if (chatId && /^\/(start|help)$/.test(text)) {
          await sendTelegramStore(chatId);
          return Response.json({ ok: true });
        }

        if (chatId && text && !text.startsWith("/") && from?.id) {
          await handleTelegramAiMessage({ chatId, from, text });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
