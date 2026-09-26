CREATE TABLE public.feed_connections (
  id text PRIMARY KEY CHECK (id IN ('uof','gateway')),
  active boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  status text,
  last_check timestamptz,
  info jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.feed_connections TO authenticated;
GRANT ALL ON public.feed_connections TO service_role;
ALTER TABLE public.feed_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc super read" ON public.feed_connections FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE UNIQUE INDEX feed_connections_one_active ON public.feed_connections ((true)) WHERE active;
INSERT INTO public.feed_connections (id, active, verified, status) VALUES ('uof', true, true, 'ok'), ('gateway', false, false, 'not_configured');

-- Queue credentials of the gateway: service role only.
CREATE TABLE public.feed_connection_secrets (
  id text PRIMARY KEY REFERENCES public.feed_connections(id) ON DELETE CASCADE,
  mq_password text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.feed_connection_secrets TO service_role;
ALTER TABLE public.feed_connection_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.feed_connection_activate(_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT verified INTO v FROM public.feed_connections WHERE id=_id;
  IF v IS NULL THEN RAISE EXCEPTION 'unknown_connection' USING ERRCODE='22023'; END IF;
  IF NOT v THEN RAISE EXCEPTION 'not_verified' USING ERRCODE='22023'; END IF;
  UPDATE public.feed_connections SET active=false, updated_at=now(), updated_by=auth.uid() WHERE active AND id<>_id;
  UPDATE public.feed_connections SET active=true, updated_at=now(), updated_by=auth.uid() WHERE id=_id;
  RETURN jsonb_build_object('ok', true, 'active', _id);
END $$;
REVOKE ALL ON FUNCTION public.feed_connection_activate(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.feed_connection_activate(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_feed_connections() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.active IS DISTINCT FROM NEW.active OR OLD.verified IS DISTINCT FROM NEW.verified THEN
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
    VALUES (auth.uid(), CASE WHEN OLD.active IS DISTINCT FROM NEW.active THEN (CASE WHEN NEW.active THEN 'feed.connection.activate' ELSE 'feed.connection.deactivate' END) ELSE 'feed.connection.verify' END,
      'feed_connection', NEW.id,
      jsonb_build_object('before', jsonb_build_object('active', OLD.active, 'verified', OLD.verified), 'after', jsonb_build_object('active', NEW.active, 'verified', NEW.verified)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_feed_connections AFTER UPDATE ON public.feed_connections FOR EACH ROW EXECUTE FUNCTION public.audit_feed_connections();