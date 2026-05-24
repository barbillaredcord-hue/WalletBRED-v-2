/**
 * ## Telegram auth
 *
 * Use these middlewares on EVERY sensitive server function or `/api/*` route
 * that operates on behalf of a Telegram user.
 *
 * - `requireTelegramUser` — for `createServerFn(...).middleware([requireTelegramUser])`.
 *   The `.client()` phase attaches the current `window.Telegram.WebApp.initData`
 *   as `Authorization: tma <initData>`. The `.server()` phase HMAC-validates it
 *   and exposes `context.telegramUser`.
 *
 * - `requireTelegramUserRoute` — for `createFileRoute(...).server.middleware`.
 *   Server-only validation for raw HTTP routes. Caller must send the same
 *   `Authorization: tma <initData>` header.
 *
 * Public webhooks (e.g. `/api/public/telegram/webhook`) MUST NOT use these —
 * they are called by Telegram itself and have their own secret-token scheme.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  extractInitDataFromAuthHeader,
  verifyInitData,
  type VerifiedTelegramUser,
} from "./telegram-auth.server";

export type TelegramAuthContext = {
  telegramUser: VerifiedTelegramUser;
  telegramAuthDate: number;
};

export type AdminAuthContext =
  | (TelegramAuthContext & {
      adminSource: "telegram";
      adminTelegramUserId: string;
    })
  | {
      adminSource: "web";
      adminTelegramUserId: string;
    };

export type WalletAuthContext =
  | {
      walletUser: {
        source: "telegram";
        id: string;
        name: string;
        handle: string;
        avatar: string;
        telegramUserId: number;
        webUserId: null;
      };
      telegramAuthDate: number;
    }
  | {
      walletUser: {
        source: "web";
        id: string;
        name: string;
        handle: string;
        avatar: string;
        telegramUserId: null;
        webUserId: string;
      };
    };

const WEB_WALLET_SESSION_KEY = "walletbred-web-user-id";
const WEB_WALLET_HEADER = "x-wallet-web-user";
const ADMIN_WEB_KEY_HEADER = "x-admin-web-key";
export const ADMIN_WEB_KEY_STORAGE = "walletbred-admin-web-key";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

function validateFromAuthHeader(): TelegramAuthContext {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[telegram-auth] TELEGRAM_BOT_TOKEN is not configured");
    throw new Response("Server misconfigured", { status: 500 });
  }
  const initData = extractInitDataFromAuthHeader(getRequestHeader("authorization"));
  if (!initData) throw new Response("Unauthorized", { status: 401 });
  const verified = verifyInitData(initData, botToken);
  return { telegramUser: verified.user, telegramAuthDate: verified.authDate };
}

function adminTelegramIds() {
  return (process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_USER_ID || "91147095")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function adminTelegramIdsFromDatabase() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_access_grants")
      .select("telegram_user_id")
      .eq("active", true);
    if (error) return [];
    return (data ?? []).map((row) => row.telegram_user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function allowedAdminTelegramIds() {
  return [...new Set([...adminTelegramIds(), ...(await adminTelegramIdsFromDatabase())])];
}

async function validateAdminFromAuthHeader(): Promise<AdminAuthContext> {
  const ctx = validateFromAuthHeader();
  const allowed = await allowedAdminTelegramIds();
  if (!allowed.includes(ctx.telegramUser.id)) {
    throw new Response("Solo el dueno puede entrar a este panel.", { status: 403 });
  }
  return { ...ctx, adminSource: "telegram", adminTelegramUserId: ctx.telegramUser.id };
}

function validateAdminFromWebKey(): AdminAuthContext {
  const expected = process.env.ADMIN_WEB_ACCESS_KEY;
  const provided = getRequestHeader(ADMIN_WEB_KEY_HEADER);
  if (!expected || !provided || provided !== expected) {
    throw new Response("Escribe tu codigo privado para entrar al panel.", { status: 401 });
  }

  return {
    adminSource: "web",
    adminTelegramUserId: adminTelegramIds()[0] ?? "web-owner",
  };
}

function telegramContextToWallet(ctx: TelegramAuthContext): WalletAuthContext {
  const id = Number(ctx.telegramUser.id);
  if (!Number.isFinite(id)) throw new Response("Invalid Telegram user", { status: 400 });
  const name = ctx.telegramUser.firstName || ctx.telegramUser.username || "WalletBRED user";
  return {
    walletUser: {
      source: "telegram",
      id: ctx.telegramUser.id,
      name,
      handle: ctx.telegramUser.username
        ? `@${ctx.telegramUser.username}`
        : `ID ${ctx.telegramUser.id}`,
      avatar: initials(name || "WB"),
      telegramUserId: id,
      webUserId: null,
    },
    telegramAuthDate: ctx.telegramAuthDate,
  };
}

function webWalletIdFromHeader() {
  const value = getRequestHeader(WEB_WALLET_HEADER);
  if (!value || !/^web_[a-zA-Z0-9._:-]{8,100}$/.test(value)) {
    throw new Response("Unauthorized web wallet", { status: 401 });
  }
  return value;
}

function webContextFromHeader(): WalletAuthContext {
  const webUserId = webWalletIdFromHeader();
  const shortId = webUserId.replace(/^web_/, "").slice(0, 8).toUpperCase();
  return {
    walletUser: {
      source: "web",
      id: webUserId,
      name: "WalletBRED Web",
      handle: `WEB-${shortId}`,
      avatar: "WB",
      telegramUserId: null,
      webUserId,
    },
  };
}

function getOrCreateWebWalletId() {
  if (typeof window === "undefined") return undefined;
  const current = window.localStorage.getItem(WEB_WALLET_SESSION_KEY);
  if (current) return current;

  const cryptoApi = window.crypto;
  const random =
    typeof cryptoApi?.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = `web_${random}`;
  window.localStorage.setItem(WEB_WALLET_SESSION_KEY, next);
  return next;
}

export const requireTelegramUser = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const initData =
      typeof window !== "undefined"
        ? (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
        : undefined;
    return next({
      headers: initData ? { Authorization: `tma ${initData}` } : {},
    });
  })
  .server(async ({ next }) => {
    const ctx = validateFromAuthHeader();
    return next({ context: ctx });
  });

export const requireWalletUser = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const initData =
      typeof window !== "undefined"
        ? (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
        : undefined;
    const webWalletId = initData ? undefined : getOrCreateWebWalletId();
    return next({
      headers: initData
        ? { Authorization: `tma ${initData}` }
        : webWalletId
          ? { [WEB_WALLET_HEADER]: webWalletId }
          : {},
    });
  })
  .server(async ({ next }) => {
    try {
      const ctx = validateFromAuthHeader();
      return next({ context: telegramContextToWallet(ctx) });
    } catch (error) {
      if (error instanceof Response && error.status === 401) {
        return next({ context: webContextFromHeader() });
      }
      throw error;
    }
  });

export const requireTelegramUserRoute = createMiddleware().server(async ({ next }) => {
  const ctx = validateFromAuthHeader();
  return next({ context: ctx });
});

export const requireAdminUser = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const initData =
      typeof window !== "undefined"
        ? (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
        : undefined;
    const webKey =
      !initData && typeof window !== "undefined"
        ? window.localStorage.getItem(ADMIN_WEB_KEY_STORAGE)
        : undefined;
    return next({
      headers: initData
        ? { Authorization: `tma ${initData}` }
        : webKey
          ? { [ADMIN_WEB_KEY_HEADER]: webKey }
          : {},
    });
  })
  .server(async ({ next }) => {
    let ctx: AdminAuthContext;
    try {
      ctx = await validateAdminFromAuthHeader();
    } catch (error) {
      if (error instanceof Response && error.status === 401) {
        ctx = validateAdminFromWebKey();
      } else {
        throw error;
      }
    }
    return next({ context: ctx });
  });
