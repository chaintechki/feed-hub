INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin' FROM public.profiles WHERE username = 'chaintech'
ON CONFLICT DO NOTHING;

-- Roles are only written by the backend user-management function
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

CREATE TABLE public.api_client_exclusions (
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, admin_id)
);
GRANT SELECT ON public.api_client_exclusions TO authenticated;
GRANT ALL ON public.api_client_exclusions TO service_role;
ALTER TABLE public.api_client_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins read exclusions" ON public.api_client_exclusions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.can_see_api_client(_user uuid, _client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user, 'super_admin')
    OR (public.has_role(_user, 'admin') AND NOT EXISTS (
          SELECT 1 FROM public.api_client_exclusions e WHERE e.client_id = _client AND e.admin_id = _user))
    OR EXISTS (SELECT 1 FROM public.api_clients c WHERE c.id = _client AND c.owner_id = _user)
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_api_client(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_see_api_client(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "admins manage api_clients" ON public.api_clients;
CREATE POLICY "visible api_clients" ON public.api_clients FOR SELECT TO authenticated
  USING (public.can_see_api_client(auth.uid(), id));
DROP POLICY IF EXISTS "admins manage api_keys" ON public.api_keys;
CREATE POLICY "visible api_keys" ON public.api_keys FOR SELECT TO authenticated
  USING (public.can_see_api_client(auth.uid(), client_id));
REVOKE INSERT, UPDATE, DELETE ON public.api_clients, public.api_keys FROM authenticated, anon;

DROP POLICY IF EXISTS "admins read api_usage" ON public.api_usage;
DROP POLICY IF EXISTS "owners read own api_usage" ON public.api_usage;
CREATE POLICY "visible api_usage" ON public.api_usage FOR SELECT TO authenticated
  USING (public.can_see_api_client(auth.uid(), client_id));
DROP POLICY IF EXISTS "admins read api_denials" ON public.api_denials;
DROP POLICY IF EXISTS "owners read own api_denials" ON public.api_denials;
CREATE POLICY "visible api_denials" ON public.api_denials FOR SELECT TO authenticated
  USING (CASE WHEN client_id IS NULL THEN public.has_role(auth.uid(), 'admin')
              ELSE public.can_see_api_client(auth.uid(), client_id) END);