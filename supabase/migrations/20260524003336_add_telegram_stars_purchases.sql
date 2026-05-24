CREATE TABLE IF NOT EXISTS public.telegram_stars_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.premium_products(id) ON DELETE SET NULL,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  chat_id bigint,
  invoice_payload text NOT NULL UNIQUE,
  invoice_url text,
  currency text NOT NULL DEFAULT 'XTR' CHECK (currency = 'XTR'),
  total_amount integer NOT NULL CHECK (total_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pre_checkout', 'paid', 'fulfilled', 'failed', 'refunded', 'canceled')),
  telegram_payment_charge_id text UNIQUE,
  provider_payment_charge_id text,
  pre_checkout_query_id text,
  raw_successful_payment jsonb,
  delivery_status text NOT NULL DEFAULT 'not_ready' CHECK (delivery_status IN ('not_ready', 'pending', 'sent', 'failed')),
  delivery_error text,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_stars_purchases ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.update_walletbred_updated_at() SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_telegram_stars_purchases_product_id
  ON public.telegram_stars_purchases(product_id);

CREATE INDEX IF NOT EXISTS idx_telegram_stars_purchases_telegram_user_id
  ON public.telegram_stars_purchases(telegram_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_stars_purchases_status
  ON public.telegram_stars_purchases(status, created_at DESC);

DROP TRIGGER IF EXISTS update_telegram_stars_purchases_updated_at ON public.telegram_stars_purchases;
CREATE TRIGGER update_telegram_stars_purchases_updated_at
BEFORE UPDATE ON public.telegram_stars_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

UPDATE public.premium_products
SET stars_amount = CASE
    WHEN slug = 'walletbred-premium-content' THEN 100
    WHEN slug = 'telegram-stars-pack' THEN COALESCE(stars_amount, 500)
    ELSE stars_amount
  END,
  kind = CASE
    WHEN slug = 'walletbred-premium-content' THEN 'telegram_store'
    ELSE kind
  END
WHERE slug IN ('walletbred-premium-content', 'telegram-stars-pack');
