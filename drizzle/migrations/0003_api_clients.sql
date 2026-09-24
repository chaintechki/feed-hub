CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sport_ids text[] NOT NULL DEFAULT '{}',
  tournament_ids text[] NOT NULL DEFAULT '{}',
  markup_pct numeric NOT NULL DEFAULT 0,
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  formats text[] NOT NULL DEFAULT '{json,xml}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage api_clients" ON public.api_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'server',
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage api_keys" ON public.api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.api_usage (
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  minute timestamptz NOT NULL,
  endpoint text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, minute, endpoint)
);
GRANT SELECT ON public.api_usage TO authenticated;
GRANT ALL ON public.api_usage TO service_role;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read api_usage" ON public.api_usage FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.api_track(_client uuid, _endpoint text, _limit int)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m timestamptz := date_trunc('minute', now()); _total int;
BEGIN
  INSERT INTO api_usage (client_id, minute, endpoint, count) VALUES (_client, _m, _endpoint, 1)
  ON CONFLICT (client_id, minute, endpoint) DO UPDATE SET count = api_usage.count + 1;
  SELECT coalesce(sum(count),0) INTO _total FROM api_usage WHERE client_id = _client AND minute = _m;
  RETURN _total;
END $$;
REVOKE EXECUTE ON FUNCTION public.api_track(uuid,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_track(uuid,text,int) TO service_role;