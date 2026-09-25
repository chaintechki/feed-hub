ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS seq bigint;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS hash text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_role text;

CREATE SEQUENCE IF NOT EXISTS public.audit_log_seq;
GRANT USAGE ON SEQUENCE public.audit_log_seq TO service_role;

CREATE OR REPLACE FUNCTION public.audit_hash(_prev text, _seq bigint, _user uuid, _action text, _entity text, _entity_id text, _details jsonb, _at timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT encode(sha256(convert_to(concat_ws('|', coalesce(_prev,''), _seq::text, coalesce(_user::text,''), _action,
    coalesce(_entity,''), coalesce(_entity_id,''), coalesce(_details::text,''),
    to_char(_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.top_role(_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _user IS NULL THEN 'system'
    WHEN public.has_role(_user,'super_admin') THEN 'super_admin'
    WHEN public.has_role(_user,'admin') THEN 'admin'
    WHEN public.has_role(_user,'trader') THEN 'trader'
    WHEN public.has_role(_user,'viewer') THEN 'viewer'
    ELSE 'none' END
$$;

-- Backfill existing rows into the chain (ordered by time)
DO $$
DECLARE r record; _prev text := NULL; _n bigint := 0;
BEGIN
  FOR r IN SELECT id FROM public.audit_log ORDER BY created_at, id LOOP
    _n := _n + 1;
    UPDATE public.audit_log a SET seq = _n, prev_hash = _prev,
      actor_role = coalesce(a.actor_role, public.top_role(a.user_id)),
      hash = public.audit_hash(_prev, _n, a.user_id, a.action, a.entity, a.entity_id, a.details, a.created_at)
    WHERE a.id = r.id RETURNING a.hash INTO _prev;
  END LOOP;
  PERFORM setval('public.audit_log_seq', greatest(_n, 1), _n > 0);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS audit_log_seq_key ON public.audit_log(seq);

CREATE OR REPLACE FUNCTION public.audit_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
  IF auth.uid() IS NOT NULL THEN NEW.user_id := auth.uid(); END IF;
  NEW.created_at := clock_timestamp();
  NEW.seq := nextval('public.audit_log_seq');
  NEW.actor_role := public.top_role(NEW.user_id);
  SELECT hash INTO _prev FROM public.audit_log ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := _prev;
  NEW.hash := public.audit_hash(_prev, NEW.seq, NEW.user_id, NEW.action, NEW.entity, NEW.entity_id, NEW.details, NEW.created_at);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_immutable' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS audit_log_chain ON public.audit_log;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_chain();
DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_immutable();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log FOR EACH STATEMENT EXECUTE FUNCTION public.audit_immutable();

-- Automatic logging of role and visibility changes (also for direct DB writes)
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
    VALUES (auth.uid(), 'role.grant', 'user', NEW.user_id::text, jsonb_build_object('role', NEW.role, 'source', 'db'));
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'role.revoke', 'user', OLD.user_id::text, jsonb_build_object('role', OLD.role, 'source', 'db'));
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles AFTER INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_exclusions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
    VALUES (auth.uid(), 'visibility.hide', 'api_client', NEW.client_id::text, jsonb_build_object('admin_id', NEW.admin_id, 'source', 'db'));
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'visibility.show', 'api_client', OLD.client_id::text, jsonb_build_object('admin_id', OLD.admin_id, 'source', 'db'));
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS audit_exclusions ON public.api_client_exclusions;
CREATE TRIGGER audit_exclusions AFTER INSERT OR DELETE ON public.api_client_exclusions FOR EACH ROW EXECUTE FUNCTION public.audit_exclusions();

-- Visibility of audit rows
CREATE OR REPLACE FUNCTION public.can_see_audit(_user uuid, _actor uuid, _entity text, _entity_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user,'super_admin') OR (
    public.has_role(_user,'admin')
    AND NOT (_actor IS NOT NULL AND public.has_role(_actor,'super_admin'))
    AND NOT (_entity = 'user' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.role='super_admin' AND r.user_id::text = _entity_id))
    AND NOT (_entity = 'api_client' AND EXISTS (SELECT 1 FROM public.api_client_exclusions e WHERE e.admin_id = _user AND e.client_id::text = _entity_id))
  )
$$;

DROP POLICY IF EXISTS "admins read audit" ON public.audit_log;
CREATE POLICY "audit visible by role" ON public.audit_log FOR SELECT TO authenticated
  USING (public.can_see_audit(auth.uid(), user_id, entity, entity_id));

CREATE OR REPLACE FUNCTION public.audit_verify()
RETURNS TABLE(ok boolean, checked bigint, broken_seq bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; _prev text := NULL; _n bigint := 0; _last bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT * FROM public.audit_log ORDER BY seq LOOP
    _n := _n + 1;
    IF r.seq <> _last + 1 OR r.prev_hash IS DISTINCT FROM _prev
       OR r.hash <> public.audit_hash(_prev, r.seq, r.user_id, r.action, r.entity, r.entity_id, r.details, r.created_at) THEN
      RETURN QUERY SELECT false, _n, r.seq; RETURN;
    END IF;
    _prev := r.hash; _last := r.seq;
  END LOOP;
  RETURN QUERY SELECT true, _n, NULL::bigint;
END $$;

REVOKE EXECUTE ON FUNCTION public.audit_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_verify() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_see_audit(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_audit(uuid, uuid, text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.top_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.top_role(uuid) TO authenticated, service_role;