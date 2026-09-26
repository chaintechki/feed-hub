CREATE OR REPLACE FUNCTION public.ingest_settlements(_rows jsonb) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO settlements(match_id, market, specifier, outcome, state, settled_at)
    SELECT r->>'match_id', r->>'market', r->>'specifier', r->>'outcome', r->>'state', coalesce((r->>'settled_at')::timestamptz, now())
    FROM jsonb_array_elements(_rows) r
    ON CONFLICT (match_id, market, specifier, outcome, state) DO NOTHING
    RETURNING 1)
  SELECT count(*)::int FROM ins;
$$;
REVOKE ALL ON FUNCTION public.ingest_settlements(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_settlements(jsonb) TO service_role;

-- _groups: [{market, suspended, ids:[...]}]; _stops: match ids with bet_stop
CREATE OR REPLACE FUNCTION public.set_odds_suspended(_groups jsonb, _stops text[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int := 0; _c int;
BEGIN
  UPDATE match_odds mo SET suspended = (g->>'suspended')::boolean
  FROM jsonb_array_elements(coalesce(_groups,'[]')) g
  WHERE mo.market = g->>'market'
    AND mo.match_id = ANY (ARRAY(SELECT jsonb_array_elements_text(g->'ids')))
    AND mo.suspended <> (g->>'suspended')::boolean;
  GET DIAGNOSTICS _c = ROW_COUNT; _n := _n + _c;
  IF _stops IS NOT NULL AND array_length(_stops,1) > 0 THEN
    UPDATE match_odds SET suspended = true WHERE match_id = ANY(_stops) AND suspended = false;
    GET DIAGNOSTICS _c = ROW_COUNT; _n := _n + _c;
  END IF;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.set_odds_suspended(jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_odds_suspended(jsonb, text[]) TO service_role;

-- Feed freshness for the operations dashboard (admins only).
CREATE OR REPLACE FUNCTION public.feed_health() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t0 timestamptz := clock_timestamp(); _last timestamptz; _n int;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT max(updated_at) INTO _last FROM match_odds;
  SELECT count(*) INTO _n FROM match_odds WHERE updated_at > now() - interval '5 minutes';
  RETURN jsonb_build_object('last_odds_at', _last, 'odds_5m', _n,
    'db_bytes', pg_database_size(current_database()),
    'producers', (SELECT jsonb_agg(jsonb_build_object('name',name,'last_alive_at',last_alive_at,'down',down)) FROM uof_producers),
    'query_ms', round(extract(epoch FROM clock_timestamp()-_t0)*1000));
END $$;
REVOKE ALL ON FUNCTION public.feed_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.db_cleanup_core()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '10min'
AS $function$
DECLARE _o int := 0; _n int; _h int := 0; _s int := 0; _m int; _i int;
BEGIN
  -- odds of matches that ended > 24 h ago or started > 48 h ago, in small blocks
  FOR _i IN 1..100 LOOP
    DELETE FROM match_odds WHERE id IN (
      SELECT mo.id FROM match_odds mo JOIN matches m ON m.id = mo.match_id
      WHERE m.scheduled < now() - interval '48 hours'
         OR (m.status IN ('ended','closed','cancelled','abandoned') AND m.updated_at < now() - interval '24 hours')
      LIMIT 5000);
    GET DIAGNOSTICS _n = ROW_COUNT; _o := _o + _n; EXIT WHEN _n < 5000;
  END LOOP;
  FOR _i IN 1..100 LOOP
    DELETE FROM odds_history WHERE id IN (SELECT id FROM odds_history WHERE changed_at < now() - interval '3 days' LIMIT 5000);
    GET DIAGNOSTICS _n = ROW_COUNT; _h := _h + _n; EXIT WHEN _n < 5000;
  END LOOP;
  -- settlements: 7 days, only for matches that are over
  FOR _i IN 1..100 LOOP
    DELETE FROM settlements WHERE id IN (
      SELECT s.id FROM settlements s LEFT JOIN matches m ON m.id = s.match_id
      WHERE s.created_at < now() - interval '7 days'
        AND (m.id IS NULL OR m.status IN ('ended','closed','cancelled','abandoned') OR m.scheduled < now() - interval '7 days')
      LIMIT 5000);
    GET DIAGNOSTICS _n = ROW_COUNT; _s := _s + _n; EXIT WHEN _n < 5000;
  END LOOP;
  DELETE FROM api_usage WHERE minute < now() - interval '90 days';
  DELETE FROM api_denials WHERE minute < now() - interval '90 days';
  DELETE FROM uof_messages_log WHERE created_at < now() - interval '7 days';
  DELETE FROM uof_sync_runs WHERE created_at < now() - interval '7 days';
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
END $function$;