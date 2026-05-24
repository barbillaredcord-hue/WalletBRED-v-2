import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 180000;

export type WebWalletUserRecord = {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  country: string;
  status: string;
};

export type WebWalletSessionUser = {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  country: string;
};

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function randomWebUserId() {
  return `web_${crypto.randomUUID()}`;
}

export function randomSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashSessionToken(token: string) {
  return sha256(token);
}

export async function hashPassword(password: string, salt = randomSessionToken()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterations, salt, expected] = storedHash.split(":");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const next = await hashPassword(password, salt);
  return next === storedHash;
}

export function publicWebUser(user: WebWalletUserRecord): WebWalletSessionUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.full_name,
    country: user.country,
  };
}

export async function createWebSession({
  userId,
  userAgent,
  ipAddress,
}: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = randomSessionToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("web_wallet_sessions").insert({
    web_user_id: userId,
    token_hash: tokenHash,
    user_agent: userAgent ?? null,
    ip_address: ipAddress ?? null,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function validateWebSessionToken(token: string | null | undefined) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;

  const tokenHash = await hashSessionToken(token);
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("web_wallet_sessions")
    .select("id,web_user_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("web_wallet_users")
    .select("id,email,phone,full_name,country,status")
    .eq("id", session.web_user_id)
    .maybeSingle();

  if (userError) throw userError;
  if (!user || user.status !== "active") return null;

  await supabaseAdmin
    .from("web_wallet_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  return publicWebUser(user as WebWalletUserRecord);
}

export async function revokeWebSessionToken(token: string | null | undefined) {
  if (!token) return;
  await supabaseAdmin
    .from("web_wallet_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", await hashSessionToken(token));
}
