ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS allowed_ips text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rotated_from uuid REFERENCES public.api_keys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys(key_hash);