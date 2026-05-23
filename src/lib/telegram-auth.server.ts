import { createHmac, timingSafeEqual } from "crypto";

export type VerifiedTelegramUser = {
  id: string;
  username: string | null;
  firstName: string | null;
};

export type VerifiedInitData = {
  user: VerifiedTelegramUser;
  authDate: number;
};

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Validates Telegram Mini App initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Throws Response(401) on any verification failure.
 */
export function verifyInitData(initData: string, botToken: string): VerifiedInitData {
  if (!initData) throw new Response("Unauthorized", { status: 401 });

  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  params.delete("hash");
  if (!hash) throw new Response("Unauthorized", { status: 401 });

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(computed, hash)) throw new Response("Unauthorized", { status: 401 });

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const userRaw = params.get("user");
  let user: { id?: number | string; username?: string; first_name?: string } | null = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (!user?.id) throw new Response("Unauthorized", { status: 401 });

  return {
    user: {
      id: String(user.id),
      username: user.username ?? null,
      firstName: user.first_name ?? null,
    },
    authDate,
  };
}

/**
 * Extracts initData from an `Authorization: tma <initData>` header.
 * Returns null if missing or malformed (caller decides how to react).
 */
export function extractInitDataFromAuthHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const match = /^tma\s+(.+)$/i.exec(trimmed);
  return match ? match[1].trim() : null;
}
