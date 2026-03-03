-- Disable trigger that blocks status column updates in non-JWT context
ALTER TABLE public.profiles DISABLE TRIGGER enforce_profile_update_restrictions;

UPDATE public.profiles
SET status = 'trial',
    email_verified_at = COALESCE(email_verified_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')
WHERE status = 'pending_verification';

ALTER TABLE public.profiles ENABLE TRIGGER enforce_profile_update_restrictions;
