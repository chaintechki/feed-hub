CREATE TABLE public.ops_metrics (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  db_bytes bigint NOT NULL,
  wal_bytes bigint,
  cache_hit_pct numeric,
  connections integer,
  dead_rows bigint,
  tables jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX ops_metrics_at_idx ON public.ops_metrics (at DESC);
GRANT SELECT ON public.ops_metrics TO authenticated;
GRANT ALL ON public.ops_metrics TO service_role;
ALTER TABLE public.ops_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read admins" ON public.ops_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cleanup_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  ok boolean NOT NULL,
  result jsonb,
  error text
);
CREATE INDEX cleanup_runs_started_idx ON public.cleanup_runs (started_at DESC);
GRANT SELECT ON public.cleanup_runs TO authenticated;
GRANT ALL ON public.cleanup_runs TO service_role;
ALTER TABLE public.cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cleanup read admins" ON public.cleanup_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cache_stats (
  source text NOT NULL,
  minute timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  misses integer NOT NULL DEFAULT 0,
  db_reads integer NOT NULL DEFAULT 0,
  load_ms integer NOT NULL DEFAULT 0,
  loads integer NOT NULL DEFAULT 0,
  entries integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz,
  PRIMARY KEY (source, minute)
);
GRANT SELECT ON public.cache_stats TO authenticated;
GRANT ALL ON public.cache_stats TO service_role;
ALTER TABLE public.cache_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache read admins" ON public.cache_stats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.cache_track(_source text, _hits int, _misses int, _db_reads int, _load_ms int, _loads int, _entries int, _refreshed_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cache_stats (source, minute, hits, misses, db_reads, load_ms, loads, entries, refreshed_at)
  VALUES (left(_source,40), date_trunc('minute', now()), greatest(_hits,0), greatest(_misses,0), greatest(_db_reads,0), greatest(_load_ms,0), greatest(_loads,0), greatest(_entries,0), _refreshed_at)
  ON CONFLICT (source, minute) DO UPDATE SET
    hits = cache_stats.hits + EXCLUDED.hits, misses = cache_stats.misses + EXCLUDED.misses,
    db_reads = cache_stats.db_reads + EXCLUDED.db_reads, load_ms = cache_stats.load_ms + EXCLUDED.load_ms,
    loads = cache_stats.loads + EXCLUDED.loads, entries = greatest(cache_stats.entries, EXCLUDED.entries),
    refreshed_at = greatest(cache_stats.refreshed_at, EXCLUDED.refreshed_at);
END $$;
REVOKE ALL ON FUNCTION public.cache_track(text,int,int,int,int,int,int,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cache_track(text,int,int,int,int,int,int,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.ops_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wal bigint;
BEGIN
  BEGIN SELECT sum(size) INTO _wal FROM pg_ls_waldir(); EXCEPTION WHEN others THEN _wal := NULL; END;
  INSERT INTO ops_metrics (db_bytes, wal_bytes, cache_hit_pct, connections, dead_rows, tables)
  SELECT pg_database_size(current_database()), _wal,
    (SELECT round(100.0 * blks_hit / nullif(blks_hit + blks_read,0), 2) FROM pg_stat_database WHERE datname = current_database()),
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    (SELECT coalesce(sum(n_dead_tup),0) FROM pg_stat_user_tables WHERE schemaname='public'),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name', relname, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) FROM (
       SELECT relname, pg_total_relation_size(relid) b FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY b DESC LIMIT 6) t);
  DELETE FROM ops_metrics WHERE at < now() - interval '90 days';
  DELETE FROM cleanup_runs WHERE started_at < now() - interval '90 days';
  DELETE FROM cache_stats WHERE minute < now() - interval '30 days';
END $$;
REVOKE ALL ON FUNCTION public.ops_snapshot() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.db_cleanup() RENAME TO db_cleanup_core;
REVOKE ALL ON FUNCTION public.db_cleanup_core() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.db_cleanup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10min' AS $$
DECLARE _t timestamptz := clock_timestamp(); _r jsonb; _e text;
BEGIN
  BEGIN
    _r := public.db_cleanup_core();
  EXCEPTION WHEN others THEN _e := SQLERRM;
  END;
  INSERT INTO cleanup_runs (started_at, duration_ms, ok, result, error)
  VALUES (_t, (extract(epoch FROM clock_timestamp() - _t) * 1000)::int, _e IS NULL, _r, _e);
  RETURN coalesce(_r, jsonb_build_object('error', _e));
END $$;
REVOKE ALL ON FUNCTION public.db_cleanup() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('feed-ops-snapshot', '0 * * * *', 'SELECT public.ops_snapshot()');