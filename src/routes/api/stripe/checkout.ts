import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAppUrl, getStripe, getVipPlanPrice } from "@/lib/stripe.server";
import { extractInitDataFromAuthHeader, verifyInitData } from "@/lib/telegram-auth.server";

const checkoutSchema = z.object({
  planId: z.string(),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
});

type CheckoutUser = {
  id: string;
  metadata: Record<string, string>;
};

function webWalletIdFromRequest(request: Request) {
  const value = request.headers.get("x-wallet-web-user");
  return value && /^web_[a-zA-Z0-9._:-]{8,100}$/.test(value) ? value : null;
}

function getCheckoutUser(request: Request): CheckoutUser {
  const initData = extractInitDataFromAuthHeader(request.headers.get("authorization"));
  if (!initData) {
    const webId = webWalletIdFromRequest(request) ?? `web_checkout_${randomUUID()}`;
    return {
      id: webId,
      metadata: {
        source: "web",
        web_user_id: webId,
      },
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[stripe-checkout] TELEGRAM_BOT_TOKEN is not configured");
    throw new Response("Server misconfigured", { status: 500 });
  }

  const user = verifyInitData(initData, botToken).user;
  return {
    id: user.id,
    metadata: {
      source: "telegram",
      telegram_user_id: user.id,
      telegram_username: user.username ?? "",
    },
  };
}

export const Route = createFileRoute("/api/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const checkoutUser = getCheckoutUser(request);
        const body = checkoutSchema.parse(await request.json());
        const planPrice = await getVipPlanPrice(body.planId);
        const appUrl = getAppUrl(request);
        const selectedCurrency = body.currency?.toLowerCase();

        const session = await getStripe().checkout.sessions.create({
          mode: "subscription",
          ...(selectedCurrency && planPrice.type === "price_id"
            ? { currency: selectedCurrency }
            : {}),
          line_items: [
            planPrice.type === "price_id"
              ? { price: planPrice.priceId, quantity: 1 }
              : {
                  quantity: 1,
                  price_data: {
                    currency: selectedCurrency ?? planPrice.currency,
                    unit_amount: planPrice.unitAmount,
                    recurring: { interval: "month" },
                    product_data: {
                      name: planPrice.name,
                    },
                  },
                },
          ],
          success_url: `${appUrl}/vip?checkout=success`,
          cancel_url: `${appUrl}/vip?checkout=cancelled`,
          client_reference_id: checkoutUser.id,
          metadata: {
            plan_id: planPrice.planId,
            ...checkoutUser.metadata,
          },
          subscription_data: {
            metadata: {
              plan_id: planPrice.planId,
              ...checkoutUser.metadata,
            },
          },
        });

        if (!session.url) {
          throw new Response("Stripe did not return a checkout URL", { status: 502 });
        }

        return Response.json({ url: session.url });
      },
    },
  },
});
