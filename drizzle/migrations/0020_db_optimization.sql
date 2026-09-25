ALTER TABLE public.match_odds DROP CONSTRAINT IF EXISTS match_odds_match_id_source_market_specifier_key;
DROP INDEX IF EXISTS public.match_odds_match_id_idx;

CREATE OR REPLACE FUNCTION public.upsert_match_odds(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int;
BEGIN
  INSERT INTO match_odds (match_id, source, market, specifier, market_group, suspended, outcomes, updated_at)
  SELECT r->>'match_id', r->>'source', r->>'market', r->>'specifier', coalesce(r->>'market_group','other'),
         coalesce((r->>'suspended')::boolean,false), r->'outcomes', now()
  FROM jsonb_array_elements(_rows) r
  ON CONFLICT (match_id, source, market, specifier) DO UPDATE
    SET outcomes = EXCLUDED.outcomes, suspended = EXCLUDED.suspended,
        market_group = EXCLUDED.market_group, updated_at = EXCLUDED.updated_at
    WHERE match_odds.outcomes IS DISTINCT FROM EXCLUDED.outcomes
       OR match_odds.suspended IS DISTINCT FROM EXCLUDED.suspended
       OR match_odds.market_group IS DISTINCT FROM EXCLUDED.market_group;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.upsert_match_odds(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_match_odds(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.db_cleanup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '10min' AS $$
DECLARE _o int := 0; _n int; _h int; _s int; _m int;
BEGIN
  LOOP
    DELETE FROM match_odds WHERE id IN (
      SELECT mo.id FROM match_odds mo JOIN matches m ON m.id = mo.match_id
      WHERE m.scheduled < now() - interval '48 hours' LIMIT 20000);
    GET DIAGNOSTICS _n = ROW_COUNT; _o := _o + _n; EXIT WHEN _n < 20000;
  END LOOP;
  DELETE FROM odds_history WHERE changed_at < now() - interval '7 days'; GET DIAGNOSTICS _h = ROW_COUNT;
  DELETE FROM settlements WHERE created_at < now() - interval '30 days'; GET DIAGNOSTICS _s = ROW_COUNT;
  DELETE FROM api_usage WHERE minute < now() - interval '90 days';
  DELETE FROM api_denials WHERE minute < now() - interval '90 days';
  DELETE FROM uof_messages_log WHERE created_at < now() - interval '14 days';
  DELETE FROM uof_sync_runs WHERE created_at < now() - interval '14 days';
  DELETE FROM rate_events WHERE at < now() - interval '1 hour';
  DELETE FROM matches m WHERE m.scheduled < now() - interval '14 days'
    AND NOT EXISTS (SELECT 1 FROM match_odds x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM odds_history x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM settlements x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM alerts x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM alert_log x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM match_comments x WHERE x.match_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM bookmaker_odds x WHERE x.match_id = m.id);
  GET DIAGNOSTICS _m = ROW_COUNT;
  RETURN jsonb_build_object('odds', _o, 'history', _h, 'settlements', _s, 'matches', _m);
END $$;
REVOKE ALL ON FUNCTION public.db_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.db_cleanup() TO service_role;

CREATE INDEX IF NOT EXISTS settlements_created_idx ON public.settlements (created_at);
CREATE INDEX IF NOT EXISTS settlements_match_idx ON public.settlements (match_id);
CREATE INDEX IF NOT EXISTS odds_history_changed_idx ON public.odds_history (changed_at);

ALTER TABLE public.match_odds SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.matches SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.settlements SET (autovacuum_vacuum_scale_factor = 0.05);

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('feed-db-cleanup', '7 * * * *', $$SELECT public.db_cleanup()$$);