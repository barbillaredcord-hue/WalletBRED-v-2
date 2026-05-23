import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicVipPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  currencyOptions: Array<{
    currency: string;
    price: number;
  }>;
  perks: string[];
  featured: boolean;
  active: boolean;
};

export const fallbackVipPlans: PublicVipPlan[] = [
  {
    id: "basic",
    name: "Basic",
    description: "Acceso inicial VIP",
    price: 100,
    currency: "USD",
    currencyOptions: [{ currency: "USD", price: 100 }],
    perks: ["Sin anuncios", "Acceso basico", "Soporte por email"],
    featured: false,
    active: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Plan recomendado para usuarios frecuentes",
    price: 250,
    currency: "USD",
    currencyOptions: [{ currency: "USD", price: 250 }],
    perks: ["Todo Basic", "Contenido premium", "Soporte prioritario"],
    featured: true,
    active: true,
  },
  {
    id: "elite",
    name: "Elite",
    description: "Acceso completo y prioridad maxima",
    price: 500,
    currency: "USD",
    currencyOptions: [{ currency: "USD", price: 500 }],
    perks: ["Todo Pro", "Acceso temprano", "Atencion privada"],
    featured: false,
    active: true,
  },
];

export async function readVipPlans({ activeOnly = false }: { activeOnly?: boolean } = {}) {
  let query = supabaseAdmin
    .from("vip_plans")
    .select(
      "plan_id,name,description,amount_cents,currency,perks,featured,active,sort_order,stripe_price_id,updated_at",
    )
    .order("sort_order", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.warn("[vip-plans] Falling back to bundled VIP plans:", error.message);
    return fallbackVipPlans.filter((plan) => !activeOnly || plan.active);
  }

  return Promise.all(
    (data ?? []).map(async (plan) => {
      const baseCurrency = plan.currency.toUpperCase();
      const { envPriceIdForPlan, listStripePriceCurrencies } = await import("@/lib/stripe.server");
      const stripePriceId = plan.stripe_price_id || envPriceIdForPlan(plan.plan_id);
      const stripeCurrencies = await listStripePriceCurrencies(stripePriceId);
      const currencyOptions = stripeCurrencies.length
        ? stripeCurrencies.map((option) => ({
            currency: option.currency,
            price: option.unitAmount / 100,
          }))
        : [{ currency: baseCurrency, price: plan.amount_cents / 100 }];
      const baseOption =
        currencyOptions.find((option) => option.currency === baseCurrency) ?? currencyOptions[0];

      return {
        id: plan.plan_id,
        name: plan.name,
        description: plan.description,
        price: baseOption.price,
        currency: baseOption.currency,
        currencyOptions,
        perks: plan.perks ?? [],
        featured: plan.featured,
        active: plan.active,
      };
    }),
  );
}

export const listPublicVipPlans = createServerFn({ method: "GET" }).handler(async () => {
  return readVipPlans({ activeOnly: true });
});
