CREATE TABLE IF NOT EXISTS public.premium_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('premium_content', 'telegram_store', 'stars_pack', 'crypto_external')),
  price_amount_cents integer NOT NULL CHECK (price_amount_cents > 0),
  price_currency text NOT NULL DEFAULT 'usd',
  stars_amount integer CHECK (stars_amount IS NULL OR stars_amount > 0),
  stripe_price_id text,
  external_url text,
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.premium_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.premium_products(id) ON DELETE SET NULL,
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'post' CHECK (content_type IN ('post', 'video', 'image', 'file', 'link', 'ai_prompt')),
  preview text NOT NULL DEFAULT '',
  content_url text,
  access_level text NOT NULL DEFAULT 'paid' CHECK (access_level IN ('free', 'paid', 'vip', 'stars')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.premium_user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.premium_products(id) ON DELETE SET NULL,
  telegram_user_id bigint,
  web_user_id text,
  source text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'pending')),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (telegram_user_id IS NOT NULL OR web_user_id IS NOT NULL)
);

ALTER TABLE public.premium_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_user_entitlements ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.update_walletbred_updated_at() SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_premium_products_active_sort
  ON public.premium_products(active, sort_order);

CREATE INDEX IF NOT EXISTS idx_premium_products_kind
  ON public.premium_products(kind);

CREATE INDEX IF NOT EXISTS idx_premium_content_items_product_id
  ON public.premium_content_items(product_id);

CREATE INDEX IF NOT EXISTS idx_premium_content_items_active_sort
  ON public.premium_content_items(active, sort_order);

CREATE INDEX IF NOT EXISTS idx_premium_user_entitlements_product_id
  ON public.premium_user_entitlements(product_id);

CREATE INDEX IF NOT EXISTS idx_premium_user_entitlements_telegram_user_id
  ON public.premium_user_entitlements(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_premium_user_entitlements_web_user_id
  ON public.premium_user_entitlements(web_user_id);

DROP TRIGGER IF EXISTS update_premium_products_updated_at ON public.premium_products;
CREATE TRIGGER update_premium_products_updated_at
BEFORE UPDATE ON public.premium_products
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

DROP TRIGGER IF EXISTS update_premium_content_items_updated_at ON public.premium_content_items;
CREATE TRIGGER update_premium_content_items_updated_at
BEFORE UPDATE ON public.premium_content_items
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

DROP TRIGGER IF EXISTS update_premium_user_entitlements_updated_at ON public.premium_user_entitlements;
CREATE TRIGGER update_premium_user_entitlements_updated_at
BEFORE UPDATE ON public.premium_user_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

INSERT INTO public.premium_products (
  slug,
  title,
  description,
  kind,
  price_amount_cents,
  price_currency,
  stars_amount,
  active,
  featured,
  sort_order
) VALUES
  (
    'walletbred-premium-content',
    'Contenido premium WalletBRED',
    'Acceso a contenido privado y herramientas premium dentro del bot.',
    'premium_content',
    10000,
    'usd',
    NULL,
    true,
    true,
    10
  ),
  (
    'telegram-stars-pack',
    'Pack Telegram Stars',
    'Producto preparado para vender acceso mediante Telegram Stars.',
    'stars_pack',
    2500,
    'usd',
    500,
    true,
    false,
    20
  ),
  (
    'crypto-external-access',
    'Acceso crypto externo',
    'Acceso administrable para compras verificadas con proveedor crypto externo.',
    'crypto_external',
    5000,
    'usd',
    NULL,
    false,
    false,
    30
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.premium_content_items (
  product_id,
  title,
  content_type,
  preview,
  content_url,
  access_level,
  active,
  sort_order
)
SELECT
  product.id,
  'Bienvenida premium',
  'post',
  'Primer contenido privado listo para editar desde el panel admin.',
  NULL,
  'paid',
  true,
  10
FROM public.premium_products product
WHERE product.slug = 'walletbred-premium-content'
ON CONFLICT DO NOTHING;
