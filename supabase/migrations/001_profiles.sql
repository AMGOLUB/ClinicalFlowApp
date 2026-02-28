-- ============================================================
-- 001_profiles.sql — User profiles with subscription state
-- ============================================================

-- Profiles table: one row per auth.users entry
CREATE TABLE public.profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                  TEXT NOT NULL,
  full_name              TEXT,
  license_key            UUID NOT NULL DEFAULT gen_random_uuid(),   -- v4 UUID
  stripe_customer_id     TEXT,
  tier                   TEXT NOT NULL DEFAULT 'trial'
                         CHECK (tier IN ('trial', 'pro', 'team', 'enterprise', 'none')),
  status                 TEXT NOT NULL DEFAULT 'pending_verification'
                         CHECK (status IN ('pending_verification', 'trial', 'active',
                                           'past_due', 'canceled', 'expired', 'none')),
  seats                  INT NOT NULL DEFAULT 1,
  trial_ends_at          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_ends_at   TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_price_id        TEXT,
  email_verified_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_profiles_license_key       ON public.profiles(license_key);
CREATE UNIQUE INDEX idx_profiles_email             ON public.profiles(email);
CREATE        INDEX idx_profiles_stripe_customer   ON public.profiles(stripe_customer_id);
CREATE        INDEX idx_profiles_stripe_sub        ON public.profiles(stripe_subscription_id);

-- ────────────────────────────────────────────────────────────
-- Auto-create profile when a new user signs up via Supabase Auth.
-- The trial does NOT activate until email is verified.
-- Status starts as 'pending_verification'.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending_verification'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- When email is confirmed, activate the 14-day trial.
-- Supabase Auth sets email_confirmed_at on the auth.users row.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_email_verified()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET status = 'trial',
        email_verified_at = NEW.email_confirmed_at,
        trial_ends_at = NEW.email_confirmed_at + INTERVAL '14 days'
    WHERE id = NEW.id AND status = 'pending_verification';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_email_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_verified();

-- ────────────────────────────────────────────────────────────
-- Auto-update updated_at on profile changes
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own name"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role (Edge Functions / webhooks) bypass RLS implicitly
-- when using the service_role key, so no explicit policy needed.
