CREATE TABLE public.captcha_used (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.captcha_used TO service_role;
ALTER TABLE public.captcha_used ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.login_attempts (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;