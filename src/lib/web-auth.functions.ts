import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createWebSession,
  hashPassword,
  publicWebUser,
  randomWebUserId,
  revokeWebSessionToken,
  validateWebSessionToken,
  verifyPassword,
  type WebWalletUserRecord,
} from "@/lib/web-auth.server";

const emailSchema = z.string().trim().email().max(160);
const passwordSchema = z.string().min(8).max(128);

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .min(8)
      .max(24)
      .regex(/^[0-9+().\-\s]+$/),
    country: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/),
    dateOfBirth: z.string().trim().max(20).optional(),
    addressLine1: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(24).optional(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    acceptTerms: z.literal(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden.",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const sessionSchema = z.object({
  sessionToken: z.string().trim().max(200).optional().nullable(),
});

function requestIp() {
  return (
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    getRequestHeader("x-real-ip") ||
    null
  );
}

function requestUserAgent() {
  return getRequestHeader("user-agent") ?? null;
}

function cleanOptional(value: string | undefined) {
  const next = value?.trim();
  return next || null;
}

async function issueSession(user: WebWalletUserRecord) {
  const session = await createWebSession({
    userId: user.id,
    userAgent: requestUserAgent(),
    ipAddress: requestIp(),
  });

  return {
    ok: true as const,
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    user: publicWebUser(user),
  };
}

export const registerWebWalletUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim();
    const emailLower = email.toLowerCase();
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("web_wallet_users")
      .select("id")
      .eq("email_lower", emailLower)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) throw new Response("Ese correo ya esta registrado.", { status: 409 });

    const payload = {
      id: randomWebUserId(),
      email,
      email_lower: emailLower,
      phone: data.phone.trim(),
      full_name: data.fullName.trim(),
      country: data.country.toUpperCase(),
      date_of_birth: cleanOptional(data.dateOfBirth),
      address_line1: cleanOptional(data.addressLine1),
      city: cleanOptional(data.city),
      postal_code: cleanOptional(data.postalCode),
      password_hash: await hashPassword(data.password),
      accepted_terms_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    const { data: user, error } = await supabaseAdmin
      .from("web_wallet_users")
      .insert(payload)
      .select("id,email,phone,full_name,country,status")
      .single();

    if (error) throw error;
    return issueSession(user as WebWalletUserRecord);
  });

export const loginWebWalletUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: user, error } = await supabaseAdmin
      .from("web_wallet_users")
      .select("id,email,phone,full_name,country,status,password_hash")
      .eq("email_lower", data.email.trim().toLowerCase())
      .maybeSingle();

    if (error) throw error;
    if (!user || user.status !== "active") {
      throw new Response("Correo o contrasena incorrectos.", { status: 401 });
    }

    const ok = await verifyPassword(data.password, user.password_hash);
    if (!ok) throw new Response("Correo o contrasena incorrectos.", { status: 401 });

    await supabaseAdmin
      .from("web_wallet_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return issueSession(user as WebWalletUserRecord);
  });

export const getWebWalletSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sessionSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await validateWebSessionToken(data.sessionToken);
    return user ? { ok: true as const, user } : { ok: false as const, user: null };
  });

export const logoutWebWalletUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sessionSchema.parse(input))
  .handler(async ({ data }) => {
    await revokeWebSessionToken(data.sessionToken);
    return { ok: true as const };
  });
