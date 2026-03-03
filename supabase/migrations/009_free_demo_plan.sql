-- ============================================================
-- 009_free_demo_plan.sql — Allow 'free_demo' as a selected_plan
-- value for v1.0.0 early release demo users.
-- ============================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_selected_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_selected_plan_check
  CHECK (selected_plan IN ('pro_monthly', 'pro_annual', 'team_monthly', 'team_annual', 'free_demo'));
