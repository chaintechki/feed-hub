ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u text;
BEGIN
  _u := lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (NEW.id, NEW.email, _u, _u)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'trader')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;