-- Rate limiting for write operations
CREATE TABLE public.rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_lookup ON public.rate_events (user_id, bucket, at);
GRANT ALL ON public.rate_events TO service_role;
ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _bucket text := TG_TABLE_NAME;
  _limit int := COALESCE(NULLIF(TG_ARGV[0], '')::int, 30);
  _n int;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF; -- server-side writes are not limited
  SELECT count(*) INTO _n FROM public.rate_events
   WHERE user_id = _uid AND bucket = _bucket AND at > now() - interval '1 minute';
  IF _n >= _limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429', HINT = 'Too many requests, try again in a minute.';
  END IF;
  INSERT INTO public.rate_events (user_id, bucket) VALUES (_uid, _bucket);
  DELETE FROM public.rate_events WHERE at < now() - interval '10 minutes' AND random() < 0.05;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rl_match_comments BEFORE INSERT ON public.match_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('10');
CREATE TRIGGER rl_alert_log BEFORE INSERT ON public.alert_log FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('30');
CREATE TRIGGER rl_outrights BEFORE INSERT OR UPDATE ON public.outrights FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('30');
CREATE TRIGGER rl_bookmaker_lists BEFORE INSERT OR UPDATE ON public.bookmaker_lists FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('30');
CREATE TRIGGER rl_bookmaker_list_items BEFORE INSERT ON public.bookmaker_list_items FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('120');
CREATE TRIGGER rl_templates BEFORE INSERT OR UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit('30');

-- Username may only be changed server-side
CREATE OR REPLACE FUNCTION public.protect_username()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'username_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect_username BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_username();

-- Audit log: server-only writes
DROP POLICY IF EXISTS "insert own audit" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated;

-- Internal functions not callable anonymously
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;