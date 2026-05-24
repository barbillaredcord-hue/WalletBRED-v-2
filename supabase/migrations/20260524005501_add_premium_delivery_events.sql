ALTER TABLE public.premium_user_entitlements
  ADD COLUMN IF NOT EXISTS telegram_stars_purchase_id uuid
  REFERENCES public.telegram_stars_purchases(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_user_entitlements_stars_purchase
  ON public.premium_user_entitlements(telegram_stars_purchase_id);

CREATE TABLE IF NOT EXISTS public.premium_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.telegram_stars_purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.premium_products(id) ON DELETE SET NULL,
  content_item_id uuid REFERENCES public.premium_content_items(id) ON DELETE SET NULL,
  delivery_key text NOT NULL,
  telegram_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  delivery_type text NOT NULL DEFAULT 'message' CHECK (delivery_type IN ('message', 'link', 'file', 'image', 'video')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  sent_message_id bigint,
  content_snapshot jsonb,
  resend_requested_by text,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, delivery_key)
);

ALTER TABLE public.premium_delivery_events ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.update_walletbred_updated_at() SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_premium_delivery_events_purchase_id
  ON public.premium_delivery_events(purchase_id);

CREATE INDEX IF NOT EXISTS idx_premium_delivery_events_status
  ON public.premium_delivery_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_premium_delivery_events_telegram_user_id
  ON public.premium_delivery_events(telegram_user_id, created_at DESC);

DROP TRIGGER IF EXISTS update_premium_delivery_events_updated_at ON public.premium_delivery_events;
CREATE TRIGGER update_premium_delivery_events_updated_at
BEFORE UPDATE ON public.premium_delivery_events
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();
