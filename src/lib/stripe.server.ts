import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type VipPlanId = "basic" | "pro" | "elite";
export type VipPlanPrice =
  | { planId: string; name: string; type: "price_id"; priceId: string }
  | { planId: string; name: string; type: "amount"; unitAmount: number; currency: string };

export type StripeCurrencyOption = {
  currency: string;
  unitAmount: number;
};

export const VIP_PRICE_ENV: Record<VipPlanId, string> = {
  basic: "STRIPE_PRICE_VIP_BASIC",
  pro: "STRIPE_PRICE_VIP_PRO",
  elite: "STRIPE_PRICE_VIP_ELITE",
};

let stripeClient: Stripe | undefined;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Response("STRIPE_SECRET_KEY not configured", { status: 500 });
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export async function getVipPlanPrice(planId: string): Promise<VipPlanPrice> {
  const { data, error } = await supabaseAdmin
    .from("vip_plans")
    .select("plan_id,name,amount_cents,currency,stripe_price_id,active")
    .eq("plan_id", planId)
    .maybeSingle();

  if (!error && data) {
    if (!data.active) throw new Response("VIP plan is not active", { status: 400 });
    if (data.stripe_price_id) {
      return {
        planId: data.plan_id,
        name: data.name,
        type: "price_id",
        priceId: data.stripe_price_id,
      };
    }
    return {
      planId: data.plan_id,
      name: data.name,
      type: "amount",
      unitAmount: data.amount_cents,
      currency: data.currency,
    };
  }

  if (!isVipPlanId(planId)) {
    throw new Response("Invalid VIP plan", { status: 400 });
  }

  const envName = VIP_PRICE_ENV[planId];
  const configured = process.env[envName];
  if (!configured) {
    throw new Response(`${envName} not configured`, { status: 500 });
  }

  if (configured.startsWith("price_")) {
    return { planId, name: `WalletBRED VIP ${planId}`, type: "price_id", priceId: configured };
  }

  const unitAmount = parseCurrencyToCents(configured);
  if (!unitAmount) {
    throw new Response(`${envName} must be a Stripe price ID or amount like $100`, {
      status: 500,
    });
  }

  return { planId, name: `WalletBRED VIP ${planId}`, type: "amount", unitAmount, currency: "usd" };
}

export async function listStripePriceCurrencies(
  priceId: string | null | undefined,
): Promise<StripeCurrencyOption[]> {
  if (!priceId?.startsWith("price_")) return [];

  try {
    const price = await getStripe().prices.retrieve(priceId, {
      expand: ["currency_options"],
    });
    const options = new Map<string, number>();
    if (typeof price.unit_amount === "number") {
      options.set(price.currency.toUpperCase(), price.unit_amount);
    }

    for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
      if (typeof option.unit_amount === "number") {
        options.set(currency.toUpperCase(), option.unit_amount);
      }
    }

    return [...options.entries()].map(([currency, unitAmount]) => ({ currency, unitAmount }));
  } catch (error) {
    console.warn(
      "[stripe] No se pudieron leer currency_options:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export function envPriceIdForPlan(planId: string) {
  if (!isVipPlanId(planId)) return null;
  const configured = process.env[VIP_PRICE_ENV[planId]];
  return configured?.startsWith("price_") ? configured : null;
}

export function getAppUrl(request: Request) {
  const configured = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    return configured.startsWith("http") ? configured : `https://${configured}`;
  }
  return new URL(request.url).origin;
}

function isVipPlanId(planId: string): planId is VipPlanId {
  return planId === "basic" || planId === "pro" || planId === "elite";
}

function parseCurrencyToCents(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}
