CREATE TABLE IF NOT EXISTS public.marketplace_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint,
  web_user_id text,
  display_name text NOT NULL,
  handle text,
  country text NOT NULL DEFAULT 'US',
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending_onboarding',
  stripe_account_id text,
  stripe_account_status text NOT NULL DEFAULT 'not_started',
  stripe_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_sellers_owner_required CHECK (
    telegram_user_id IS NOT NULL OR web_user_id IS NOT NULL
  ),
  CONSTRAINT marketplace_sellers_status_check CHECK (
    status IN ('pending_onboarding','active','paused','rejected')
  ),
  CONSTRAINT marketplace_sellers_stripe_status_check CHECK (
    stripe_account_status IN ('not_started','onboarding','restricted','enabled','disabled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_sellers_telegram_owner
  ON public.marketplace_sellers(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_sellers_web_owner
  ON public.marketplace_sellers(web_user_id)
  WHERE web_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_sellers_status
  ON public.marketplace_sellers(status);

CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_amount_cents integer NOT NULL,
  price_currency text NOT NULL DEFAULT 'usd',
  content_url text,
  cover_url text,
  status text NOT NULL DEFAULT 'pending_review',
  active boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_products_price_check CHECK (price_amount_cents > 0),
  CONSTRAINT marketplace_products_status_check CHECK (
    status IN ('pending_review','approved','rejected','disabled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_products_slug
  ON public.marketplace_products(slug);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller_status
  ON public.marketplace_products(seller_id, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_public
  ON public.marketplace_products(active, status, featured, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.marketplace_products(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.marketplace_sellers(id) ON DELETE SET NULL,
  buyer_telegram_user_id bigint,
  buyer_web_user_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  platform_fee_cents integer NOT NULL DEFAULT 0,
  seller_amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  transfer_group text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT marketplace_orders_amount_check CHECK (amount_cents > 0),
  CONSTRAINT marketplace_orders_status_check CHECK (
    status IN ('pending','paid','failed','refunded','canceled')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller
  ON public.marketplace_orders(seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_telegram
  ON public.marketplace_orders(buyer_telegram_user_id, created_at DESC)
  WHERE buyer_telegram_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_web
  ON public.marketplace_orders(buyer_web_user_id, created_at DESC)
  WHERE buyer_web_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.seller_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  withdrawal_request_id uuid,
  type text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'posted',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_ledger_type_check CHECK (
    type IN ('sale_credit','withdrawal_debit','adjustment','refund_debit')
  ),
  CONSTRAINT seller_ledger_status_check CHECK (
    status IN ('pending','posted','void')
  )
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_entries_seller
  ON public.seller_ledger_entries(seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seller_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending_review',
  provider text NOT NULL DEFAULT 'stripe_connect',
  provider_transfer_id text,
  admin_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT seller_withdrawals_amount_check CHECK (amount_cents > 0),
  CONSTRAINT seller_withdrawals_status_check CHECK (
    status IN ('pending_review','approved','processing','paid','rejected','failed','canceled')
  )
);

ALTER TABLE public.seller_ledger_entries
  DROP CONSTRAINT IF EXISTS seller_ledger_entries_withdrawal_request_id_fkey;

ALTER TABLE public.seller_ledger_entries
  ADD CONSTRAINT seller_ledger_entries_withdrawal_request_id_fkey
  FOREIGN KEY (withdrawal_request_id)
  REFERENCES public.seller_withdrawal_requests(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seller_withdrawal_requests_seller_status
  ON public.seller_withdrawal_requests(seller_id, status, requested_at DESC);

ALTER TABLE public.marketplace_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_marketplace_sellers_updated_at ON public.marketplace_sellers;
CREATE TRIGGER update_marketplace_sellers_updated_at
BEFORE UPDATE ON public.marketplace_sellers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketplace_products_updated_at ON public.marketplace_products;
CREATE TRIGGER update_marketplace_products_updated_at
BEFORE UPDATE ON public.marketplace_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON TABLE public.marketplace_sellers TO service_role;
GRANT ALL ON TABLE public.marketplace_products TO service_role;
GRANT ALL ON TABLE public.marketplace_orders TO service_role;
GRANT ALL ON TABLE public.seller_ledger_entries TO service_role;
GRANT ALL ON TABLE public.seller_withdrawal_requests TO service_role;
