ALTER TABLE public.wallet_movements
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by_owner text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_wallet_movements_canceled_at
  ON public.wallet_movements(canceled_at);
