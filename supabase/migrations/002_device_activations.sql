-- ============================================================
-- 002_device_activations.sql — Device tracking for team seats
-- ============================================================

CREATE TABLE public.device_activations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,              -- SHA-256 of hostname:username
  device_name TEXT DEFAULT 'Unknown',     -- human-readable, e.g. "MacBook Pro — Dr. Patel"
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_device_user_hash ON public.device_activations(user_id, device_hash);
CREATE        INDEX idx_device_user      ON public.device_activations(user_id);

ALTER TABLE public.device_activations ENABLE ROW LEVEL SECURITY;

-- Users can see their own devices (for account settings display)
CREATE POLICY "Users can view own devices"
  ON public.device_activations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own devices (to free seats)
CREATE POLICY "Users can delete own devices"
  ON public.device_activations FOR DELETE
  USING (auth.uid() = user_id);
