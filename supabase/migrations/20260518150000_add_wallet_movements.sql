CREATE TABLE public.wallet_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint,
  type text NOT NULL,
  title text NOT NULL,
  amount integer,
  currency text,
  status text NOT NULL,
  stripe_event_id text UNIQUE,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_movements_telegram_user_id
  ON public.wallet_movements(telegram_user_id);

CREATE INDEX idx_wallet_movements_created_at
  ON public.wallet_movements(created_at DESC);

ALTER TABLE public.wallet_movements ENABLE ROW LEVEL SECURITY;
