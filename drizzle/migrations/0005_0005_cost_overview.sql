ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS cache_hits integer NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS bytes bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.api_track_meta(_client uuid, _endpoint text, _cache_hit boolean, _bytes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m timestamptz := date_trunc('minute', now());
BEGIN
  INSERT INTO api_usage (client_id, minute, endpoint, count, cache_hits, bytes)
  VALUES (_client, _m, _endpoint, 0, CASE WHEN _cache_hit THEN 1 ELSE 0 END, greatest(coalesce(_bytes,0),0))
  ON CONFLICT (client_id, minute, endpoint) DO UPDATE
    SET cache_hits = api_usage.cache_hits + CASE WHEN _cache_hit THEN 1 ELSE 0 END,
        bytes = api_usage.bytes + greatest(coalesce(_bytes,0),0);
END $$;
REVOKE EXECUTE ON FUNCTION public.api_track_meta(uuid,text,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_track_meta(uuid,text,boolean,integer) TO service_role;

CREATE TABLE public.cost_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency text NOT NULL DEFAULT 'EUR',
  price_per_million_invocations numeric NOT NULL DEFAULT 2,
  price_per_million_db_reads numeric NOT NULL DEFAULT 0.5,
  price_per_gb_egress numeric NOT NULL DEFAULT 0.09,
  included_invocations bigint NOT NULL DEFAULT 2000000,
  included_egress_gb numeric NOT NULL DEFAULT 250,
  fixed_monthly numeric NOT NULL DEFAULT 25,
  upstream_monthly numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.cost_settings TO authenticated;
GRANT ALL ON public.cost_settings TO service_role;
ALTER TABLE public.cost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage cost_settings" ON public.cost_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.cost_settings (id) VALUES (1) ON CONFLICT DO NOTHING;