-- ============================================================
-- 005_oauth_email_verified.sql — Fix: Google OAuth users should
-- skip pending_verification and go straight to trial status.
--
-- Root cause: handle_new_user() always sets status to
-- 'pending_verification', but Google OAuth users already have
-- email_confirmed_at set on INSERT (not UPDATE), so the
-- handle_email_verified() trigger never fires for them.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status, email_verified_at, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.email_confirmed_at IS NOT NULL THEN 'trial'
      ELSE 'pending_verification'
    END,
    NEW.email_confirmed_at,                -- NULL for email signups, set for OAuth
    CASE
      WHEN NEW.email_confirmed_at IS NOT NULL THEN NEW.email_confirmed_at + INTERVAL '14 days'
      ELSE NOW() + INTERVAL '14 days'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Backfill: fix existing OAuth users stuck in pending_verification ──
-- These are users whose email_confirmed_at is already set in auth.users
-- but whose profile was created with 'pending_verification' by the old trigger.
UPDATE public.profiles p
SET status            = 'trial',
    email_verified_at = u.email_confirmed_at,
    trial_ends_at     = u.email_confirmed_at + INTERVAL '14 days'
FROM auth.users u
WHERE p.id = u.id
  AND p.status = 'pending_verification'
  AND u.email_confirmed_at IS NOT NULL;
