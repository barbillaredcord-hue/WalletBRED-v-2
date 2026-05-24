CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.web_wallet_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  email_lower text NOT NULL UNIQUE,
  phone text NOT NULL,
  full_name text NOT NULL,
  country text NOT NULL DEFAULT 'MX',
  date_of_birth date,
  address_line1 text,
  city text,
  postal_code text,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  kyc_status text NOT NULL DEFAULT 'not_started',
  risk_level text NOT NULL DEFAULT 'standard',
  accepted_terms_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id ~ '^web_[a-zA-Z0-9._:-]{8,120}$'),
  CHECK (email_lower = lower(email)),
  CHECK (country ~ '^[A-Z]{2}$'),
  CHECK (status IN ('active', 'restricted', 'suspended', 'closed')),
  CHECK (kyc_status IN ('not_started', 'pending', 'verified', 'rejected')),
  CHECK (risk_level IN ('standard', 'review', 'high'))
);

CREATE TABLE IF NOT EXISTS public.web_wallet_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  web_user_id text NOT NULL REFERENCES public.web_wallet_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_wallet_sessions_user_id
  ON public.web_wallet_sessions(web_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_wallet_sessions_active
  ON public.web_wallet_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.web_wallet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_wallet_sessions ENABLE ROW LEVEL SECURITY;
