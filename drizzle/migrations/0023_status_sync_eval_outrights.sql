ALTER TABLE public.ops_metrics
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS server_mem_rss bigint,
  ADD COLUMN IF NOT EXISTS server_mem_heap bigint,
  ADD COLUMN IF NOT EXISTS server_mem_total bigint,
  ADD COLUMN IF NOT EXISTS server_mem_free bigint;

CREATE TABLE public.status_sync_runs (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT true,
  checked integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  forced integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  details jsonb
);
GRANT SELECT ON public.status_sync_runs TO authenticated;
GRANT ALL ON public.status_sync_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.status_sync_runs_id_seq TO service_role;
ALTER TABLE public.status_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read status sync runs" ON public.status_sync_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.ai_eval_runs (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  total integer NOT NULL,
  correct integer NOT NULL,
  accuracy numeric NOT NULL,
  resolver_accuracy numeric,
  details jsonb
);
GRANT SELECT ON public.ai_eval_runs TO authenticated;
GRANT ALL ON public.ai_eval_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_eval_runs_id_seq TO service_role;
ALTER TABLE public.ai_eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai eval runs" ON public.ai_eval_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.outrights
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS market_id integer,
  ADD COLUMN IF NOT EXISTS market_name text;
CREATE INDEX IF NOT EXISTS outrights_event_idx ON public.outrights(event_id);

CREATE OR REPLACE FUNCTION public.ops_snapshot_ext(_kind text, _rss bigint, _heap bigint, _total bigint, _free bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _wal bigint;
BEGIN
  BEGIN SELECT sum(size) INTO _wal FROM pg_ls_waldir(); EXCEPTION WHEN others THEN _wal := NULL; END;
  INSERT INTO ops_metrics (kind, db_bytes, wal_bytes, cache_hit_pct, connections, dead_rows, tables, server_mem_rss, server_mem_heap, server_mem_total, server_mem_free)
  SELECT _kind, pg_database_size(current_database()), _wal,
    (SELECT round(100.0 * blks_hit / nullif(blks_hit + blks_read,0), 2) FROM pg_stat_database WHERE datname = current_database()),
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    (SELECT coalesce(sum(n_dead_tup),0) FROM pg_stat_user_tables WHERE schemaname='public'),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name', relname, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) FROM (
       SELECT relname, pg_total_relation_size(relid) b FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY b DESC LIMIT 6) t),
    _rss, _heap, _total, _free;
  DELETE FROM status_sync_runs WHERE at < now() - interval '30 days';
  DELETE FROM ai_eval_runs WHERE at < now() - interval '180 days';
END $$;
REVOKE EXECUTE ON FUNCTION public.ops_snapshot_ext(text,bigint,bigint,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_snapshot_ext(text,bigint,bigint,bigint,bigint) TO service_role;