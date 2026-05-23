import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

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

        // TODO: persist updates (enable Lovable Cloud) or process them here.
        console.log("[telegram] update", {
          update_id: update.update_id,
          chat_id: message?.chat?.id,
          from: message?.from?.username,
          text: message?.text,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
