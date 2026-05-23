CREATE TABLE IF NOT EXISTS public.vip_plans (
  plan_id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_price_id text,
  perks text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  telegram_user_id text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_access_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vip_plans_active_sort
  ON public.vip_plans(active, sort_order);

CREATE INDEX IF NOT EXISTS idx_admin_access_grants_active_telegram
  ON public.admin_access_grants(active, telegram_user_id);

CREATE OR REPLACE FUNCTION public.update_walletbred_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_vip_plans_updated_at ON public.vip_plans;
CREATE TRIGGER update_vip_plans_updated_at
BEFORE UPDATE ON public.vip_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

DROP TRIGGER IF EXISTS update_admin_access_grants_updated_at ON public.admin_access_grants;
CREATE TRIGGER update_admin_access_grants_updated_at
BEFORE UPDATE ON public.admin_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

INSERT INTO public.vip_plans
  (plan_id, name, description, amount_cents, currency, perks, featured, active, sort_order)
VALUES
  ('basic', 'Basic', 'Acceso inicial VIP', 10000, 'usd', ARRAY['Sin anuncios', 'Acceso basico', 'Soporte por email'], false, true, 10),
  ('pro', 'Pro', 'Plan recomendado para usuarios frecuentes', 25000, 'usd', ARRAY['Todo Basic', 'Contenido premium', 'Soporte prioritario'], true, true, 20),
  ('elite', 'Elite', 'Acceso completo y prioridad maxima', 50000, 'usd', ARRAY['Todo Pro', 'Acceso temprano', 'Atencion privada'], false, true, 30)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.admin_access_grants
  (label, telegram_user_id, role, active)
VALUES
  ('Dueno principal', '91147095', 'owner', true)
ON CONFLICT (telegram_user_id) DO NOTHING;
