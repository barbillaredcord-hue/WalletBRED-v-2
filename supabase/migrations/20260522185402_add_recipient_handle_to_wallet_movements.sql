ALTER TABLE public.wallet_movements
  ADD COLUMN IF NOT EXISTS recipient_handle text;

CREATE INDEX IF NOT EXISTS idx_wallet_movements_recipient_handle
  ON public.wallet_movements(recipient_handle);
