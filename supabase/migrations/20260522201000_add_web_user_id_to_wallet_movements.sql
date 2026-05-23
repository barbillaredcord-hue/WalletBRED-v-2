ALTER TABLE public.wallet_movements
  ADD COLUMN IF NOT EXISTS web_user_id text;

CREATE INDEX IF NOT EXISTS idx_wallet_movements_web_user_id
  ON public.wallet_movements(web_user_id);
