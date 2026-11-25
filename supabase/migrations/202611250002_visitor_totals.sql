-- Cumulative anonymous browser count. No IP address or visitor ID is retained here.
CREATE TABLE IF NOT EXISTS public.analytics_totals (
  id smallint PRIMARY KEY CHECK (id = 1),
  total_visitors bigint NOT NULL DEFAULT 0 CHECK (total_visitors >= 0)
);
ALTER TABLE public.analytics_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_totals FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.analytics_totals FROM anon, authenticated;
  END IF;
END $$;

-- Initialize once from the history still available when this feature is installed.
-- Reapplying migrations must never reset or increase an existing cumulative total.
INSERT INTO public.analytics_totals (id, total_visitors)
SELECT 1, count(DISTINCT visitor_id) FROM public.analytics_visits
ON CONFLICT (id) DO NOTHING;
