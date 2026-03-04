-- ============================================================
-- 010_restore_email_verification.sql — Re-enable email
-- verification for website signups. OAuth users still bypass
-- verification (email_confirmed_at is set at signup time).
-- ============================================================

-- Restore handle_new_user() with OAuth check:
-- • OAuth / pre-verified users → trial immediately
-- • Email/password users → pending_verification (until email confirmed)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    -- OAuth or pre-verified: skip verification, start trial immediately
    INSERT INTO public.profiles (id, email, full_name, status, email_verified_at, trial_ends_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      'trial',
      NEW.email_confirmed_at,
      NEW.email_confirmed_at + INTERVAL '14 days'
    );
  ELSE
    -- Email/password: require verification before trial starts
    INSERT INTO public.profiles (id, email, full_name, status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      'pending_verification'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: handle_email_verified() from migration 001 already converts
-- pending_verification → trial when auth.users.email_confirmed_at is set.
-- No changes needed to that trigger.
