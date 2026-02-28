-- ============================================================
-- 003_subscription_events.sql — Stripe webhook audit log
-- ============================================================

CREATE TABLE public.subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  user_id         UUID REFERENCES public.profiles(id),
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_user ON public.subscription_events(user_id);
CREATE INDEX idx_sub_events_type ON public.subscription_events(event_type);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access (Edge Functions / webhooks)
-- No user-facing policies needed.
