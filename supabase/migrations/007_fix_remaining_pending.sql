-- ============================================================
-- 007_fix_remaining_pending.sql — Fix profiles stuck in
-- pending_verification. Must disable the column-restriction
-- trigger first since migrations don't have a JWT context.
-- ============================================================

-- Disable the trigger that blocks status updates from non-service-role
ALTER TABLE public.profiles DISABLE TRIGGER enforce_profile_update_restrictions;

-- Upgrade all remaining pending_verification users to trial
UPDATE public.profiles
SET status = 'trial',
    email_verified_at = COALESCE(email_verified_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')
WHERE status = 'pending_verification';

-- Re-enable the trigger
ALTER TABLE public.profiles ENABLE TRIGGER enforce_profile_update_restrictions;
