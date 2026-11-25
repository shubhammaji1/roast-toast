-- Private, rolling 30-day visitor analytics. No account/profile relationship.
CREATE TABLE IF NOT EXISTS public.analytics_visits (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  visitor_id text NOT NULL CHECK (visitor_id ~ '^[a-f0-9]{64}$'),
  ip inet NOT NULL,
  visit_day date NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL CHECK (length(path) <= 200),
  city text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS analytics_visits_last_seen ON public.analytics_visits (last_seen DESC);
CREATE INDEX IF NOT EXISTS analytics_visits_visitor ON public.analytics_visits (visitor_id);
ALTER TABLE public.analytics_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_visits FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.analytics_ip_locations (
  ip inet PRIMARY KEY,
  city text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_ip_locations_updated ON public.analytics_ip_locations (updated_at);
ALTER TABLE public.analytics_ip_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_ip_locations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.analytics_visits, public.analytics_ip_locations FROM anon, authenticated;
  END IF;
END $$;
