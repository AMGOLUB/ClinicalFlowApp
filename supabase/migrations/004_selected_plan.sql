-- 004_selected_plan.sql
-- Store the user's pre-trial plan preference (Pro/Team, monthly/annual).
-- Values match the PRICE_MAP keys in create-checkout/index.ts so they can be
-- passed straight through when the trial ends and the user converts.

ALTER TABLE public.profiles
  ADD COLUMN selected_plan TEXT
  CHECK (selected_plan IN ('pro_monthly', 'pro_annual', 'team_monthly', 'team_annual'));

-- ── Column-restriction trigger ──────────────────────────────────────────────
-- Prevents the authenticated (anon-key) client from writing to sensitive
-- columns.  Only the service_role (Edge Functions, webhooks) may touch them.
-- Client-writable columns: full_name, selected_plan, email.

CREATE OR REPLACE FUNCTION public.restrict_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.tier                   := OLD.tier;
    NEW.status                 := OLD.status;
    NEW.stripe_customer_id     := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.stripe_price_id        := OLD.stripe_price_id;
    NEW.seats                  := OLD.seats;
    NEW.trial_ends_at          := OLD.trial_ends_at;
    NEW.subscription_ends_at   := OLD.subscription_ends_at;
    NEW.email_verified_at      := OLD.email_verified_at;
    NEW.license_key            := OLD.license_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_profile_update_restrictions
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_profile_update();
