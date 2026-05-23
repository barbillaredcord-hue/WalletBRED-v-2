import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyInitData } from "./telegram-auth.server";

const inputSchema = z.object({
  initData: z.string().min(1).max(8192),
});

/**
 * Verifies Telegram Mini App initData and returns the user identity.
 *
 * This stays an UNMIDDLEWARED public server fn because it IS the verifier —
 * the `/_app` mount-time guard calls it before any other RPC is allowed.
 * For all other sensitive endpoints, use `requireTelegramUser` middleware.
 */
export const verifyTelegramInitData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("Server misconfigured");
    const verified = verifyInitData(data.initData, botToken);
    return { ok: true as const, user: verified.user, authDate: verified.authDate };
  });
