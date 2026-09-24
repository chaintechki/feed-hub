ALTER TABLE public.api_clients ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS api_clients_owner_idx ON public.api_clients (owner_id);

CREATE OR REPLACE FUNCTION public.owns_api_client(_user uuid, _client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.api_clients WHERE id = _client AND owner_id = _user) $$;
REVOKE EXECUTE ON FUNCTION public.owns_api_client(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_api_client(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "owners read own api_usage" ON public.api_usage FOR SELECT TO authenticated
  USING (public.owns_api_client(auth.uid(), client_id));
CREATE POLICY "owners read own api_denials" ON public.api_denials FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND public.owns_api_client(auth.uid(), client_id));