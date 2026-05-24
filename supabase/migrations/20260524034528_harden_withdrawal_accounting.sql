ALTER TABLE public.bank_transfer_requests
  ADD COLUMN IF NOT EXISTS wallet_movement_id uuid
  REFERENCES public.wallet_movements(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_wallet_movement_id
  ON public.bank_transfer_requests(wallet_movement_id);
