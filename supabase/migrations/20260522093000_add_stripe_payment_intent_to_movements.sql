ALTER TABLE public.wallet_movements
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE INDEX IF NOT EXISTS idx_wallet_movements_payment_intent_id
  ON public.wallet_movements(stripe_payment_intent_id);
