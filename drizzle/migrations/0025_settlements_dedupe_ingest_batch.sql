-- Prevent duplicate settlements going forward (specifier/outcome can be NULL)
CREATE UNIQUE INDEX IF NOT EXISTS settlements_unique_entry
  ON public.settlements (match_id, market, specifier, outcome, state) NULLS NOT DISTINCT;

-- Batched ingest: match status updates, suspension toggles and producer heartbeats in one call
CREATE OR REPLACE FUNCTION public.ingest_batch(_matches jsonb, _producers jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE _n int := 0;
BEGIN
  UPDATE public.matches m SET
    status = coalesce(r->>'status', m.status),
    match_minute = CASE WHEN r ? 'match_minute' THEN nullif(r->>'match_minute','')::int ELSE m.match_minute END,
    updated_at = now()
  FROM jsonb_array_elements(coalesce(_matches, '[]'::jsonb)) r
  WHERE m.id = r->>'id'
    AND (m.status IS DISTINCT FROM coalesce(r->>'status', m.status)
      OR m.match_minute IS DISTINCT FROM CASE WHEN r ? 'match_minute' THEN nullif(r->>'match_minute','')::int ELSE m.match_minute END);
  GET DIAGNOSTICS _n = ROW_COUNT;

  INSERT INTO public.uof_producers (id, name, last_message_at, last_alive_at, down, updated_at)
  SELECT (p->>'id')::int, p->>'name',
         nullif(p->>'last_message_at','')::timestamptz,
         nullif(p->>'last_alive_at','')::timestamptz,
         coalesce((p->>'down')::boolean, false), now()
  FROM jsonb_array_elements(coalesce(_producers, '[]'::jsonb)) p
  ON CONFLICT (id) DO UPDATE SET
    last_message_at = greatest(uof_producers.last_message_at, EXCLUDED.last_message_at),
    last_alive_at = greatest(uof_producers.last_alive_at, EXCLUDED.last_alive_at),
    down = EXCLUDED.down,
    updated_at = now()
  WHERE EXCLUDED.last_message_at > uof_producers.updated_at - interval '30 seconds'
     OR uof_producers.updated_at < now() - interval '30 seconds';
  RETURN _n;
END
$fn$;

REVOKE ALL ON FUNCTION public.ingest_batch(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_batch(jsonb, jsonb) TO service_role;