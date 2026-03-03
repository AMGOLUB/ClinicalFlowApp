-- ============================================================
-- 006_skip_email_verification.sql — Start new users directly
-- in trial status, bypassing email verification requirement.
-- ============================================================

-- Update the trigger to start users in 'trial' immediately
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status, email_verified_at, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upgrade any existing pending_verification users to trial
UPDATE public.profiles
SET status = 'trial',
    email_verified_at = COALESCE(email_verified_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')
WHERE status = 'pending_verification';
