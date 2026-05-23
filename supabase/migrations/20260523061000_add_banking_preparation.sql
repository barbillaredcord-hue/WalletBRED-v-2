CREATE TABLE IF NOT EXISTS public.bank_account_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint,
  web_user_id text,
  provider text NOT NULL DEFAULT 'pending_provider',
  country text NOT NULL,
  currency text NOT NULL,
  rail text NOT NULL,
  account_label text NOT NULL,
  institution_name text,
  account_last4 text,
  provider_account_id text,
  status text NOT NULL DEFAULT 'pending_provider',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_connection_id uuid REFERENCES public.bank_account_connections(id),
  telegram_user_id bigint,
  web_user_id text,
  direction text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  rail text NOT NULL,
  provider_transfer_id text,
  status text NOT NULL DEFAULT 'draft',
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_account_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bank_account_connections_telegram_user_id
  ON public.bank_account_connections(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_bank_account_connections_web_user_id
  ON public.bank_account_connections(web_user_id);

CREATE INDEX IF NOT EXISTS idx_bank_account_connections_status
  ON public.bank_account_connections(status);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_connection_id
  ON public.bank_transfer_requests(bank_account_connection_id);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_status
  ON public.bank_transfer_requests(status);

DROP TRIGGER IF EXISTS update_bank_account_connections_updated_at ON public.bank_account_connections;
CREATE TRIGGER update_bank_account_connections_updated_at
BEFORE UPDATE ON public.bank_account_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();

DROP TRIGGER IF EXISTS update_bank_transfer_requests_updated_at ON public.bank_transfer_requests;
CREATE TRIGGER update_bank_transfer_requests_updated_at
BEFORE UPDATE ON public.bank_transfer_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_walletbred_updated_at();
