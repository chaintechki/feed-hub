CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.payment_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  free_monthly int NOT NULL DEFAULT 100,
  pack_size int NOT NULL DEFAULT 100,
  pack_price_usdt numeric NOT NULL DEFAULT 10,
  order_ttl_min int NOT NULL DEFAULT 60,
  confirmations jsonb NOT NULL DEFAULT '{"bsc":15,"eth":12,"polygon":64,"tron":20}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.payment_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps read" ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps super write" ON public.payment_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.payment_addresses (
  network text PRIMARY KEY CHECK (network IN ('bsc','eth','polygon','tron')),
  address text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_addresses TO authenticated;
GRANT ALL ON public.payment_addresses TO service_role;
ALTER TABLE public.payment_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa read" ON public.payment_addresses FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "pa super ins" ON public.payment_addresses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "pa super upd" ON public.payment_addresses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "pa super del" ON public.payment_addresses FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.payment_address_check() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.address := btrim(NEW.address);
  IF NEW.network = 'tron' AND NEW.address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' THEN
    RAISE EXCEPTION 'invalid_tron_address' USING ERRCODE = '22023';
  ELSIF NEW.network <> 'tron' AND NEW.address !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'invalid_evm_address' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER payment_address_check BEFORE INSERT OR UPDATE ON public.payment_addresses FOR EACH ROW EXECUTE FUNCTION public.payment_address_check();

CREATE OR REPLACE FUNCTION public.audit_payment_addresses() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'payment.address.' || lower(TG_OP), 'payment_address', coalesce(NEW.network, OLD.network),
    jsonb_build_object('before', CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('address', OLD.address, 'active', OLD.active) END,
                       'after', CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('address', NEW.address, 'active', NEW.active) END));
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER audit_payment_addresses AFTER INSERT OR UPDATE OR DELETE ON public.payment_addresses FOR EACH ROW EXECUTE FUNCTION public.audit_payment_addresses();

CREATE TABLE public.ai_credits (
  user_id uuid PRIMARY KEY,
  purchased int NOT NULL DEFAULT 0,
  free_used int NOT NULL DEFAULT 0,
  period date NOT NULL DEFAULT date_trunc('month', now())::date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_credits TO authenticated;
GRANT ALL ON public.ai_credits TO service_role;
ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credits own" ON public.ai_credits FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  network text NOT NULL CHECK (network IN ('bsc','eth','polygon','tron')),
  packs int NOT NULL CHECK (packs BETWEEN 1 AND 10),
  credits int NOT NULL,
  amount_exact numeric NOT NULL,
  address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirming','paid','expired','rejected')),
  tx_hash text UNIQUE,
  reject_reason text,
  confirmations int,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  checked_at timestamptz,
  raw jsonb
);
CREATE INDEX payment_orders_user ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX payment_orders_open ON public.payment_orders (status) WHERE status IN ('pending','confirming');
CREATE UNIQUE INDEX payment_orders_amount_open ON public.payment_orders (network, amount_exact) WHERE status IN ('pending','confirming');
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders own" ON public.payment_orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.ai_consume(_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _free int; _p date := date_trunc('month', now())::date; r public.ai_credits;
BEGIN
  IF public.has_role(_user,'super_admin') THEN RETURN jsonb_build_object('ok', true, 'unlimited', true); END IF;
  SELECT free_monthly INTO _free FROM payment_settings WHERE id = 1;
  INSERT INTO ai_credits (user_id, period) VALUES (_user, _p) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO r FROM ai_credits WHERE user_id = _user FOR UPDATE;
  IF r.period <> _p THEN r.free_used := 0; r.period := _p; END IF;
  IF r.free_used < _free THEN r.free_used := r.free_used + 1;
  ELSIF r.purchased > 0 THEN r.purchased := r.purchased - 1;
  ELSE
    UPDATE ai_credits SET free_used = r.free_used, period = r.period WHERE user_id = _user;
    RETURN jsonb_build_object('ok', false, 'free_left', 0, 'purchased', 0);
  END IF;
  UPDATE ai_credits SET free_used = r.free_used, purchased = r.purchased, period = r.period, updated_at = now() WHERE user_id = _user;
  RETURN jsonb_build_object('ok', true, 'free_left', greatest(_free - r.free_used, 0), 'purchased', r.purchased);
END $$;

CREATE OR REPLACE FUNCTION public.ai_refund(_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.has_role(_user,'super_admin') THEN RETURN; END IF;
  UPDATE ai_credits SET free_used = CASE WHEN free_used > 0 THEN free_used - 1 ELSE free_used END,
    purchased = CASE WHEN free_used > 0 THEN purchased ELSE purchased + 1 END WHERE user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_order(_order uuid, _tx text, _raw jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.payment_orders;
BEGIN
  SELECT * INTO o FROM payment_orders WHERE id = _order FOR UPDATE;
  IF NOT FOUND OR o.status = 'paid' THEN RETURN false; END IF;
  UPDATE payment_orders SET status = 'paid', tx_hash = _tx, paid_at = now(), checked_at = now(), raw = _raw, reject_reason = NULL WHERE id = _order;
  INSERT INTO ai_credits (user_id, purchased) VALUES (o.user_id, o.credits)
    ON CONFLICT (user_id) DO UPDATE SET purchased = ai_credits.purchased + EXCLUDED.purchased, updated_at = now();
  INSERT INTO audit_log (user_id, action, entity, entity_id, details)
  VALUES (o.user_id, 'payment.paid', 'payment_order', _order::text,
    jsonb_build_object('network', o.network, 'amount', o.amount_exact, 'credits', o.credits, 'tx', _tx));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.ai_admin_adjust(_actor uuid, _user uuid, _delta int, _reason text) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(_actor,'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO ai_credits (user_id, purchased) VALUES (_user, greatest(_delta,0))
    ON CONFLICT (user_id) DO UPDATE SET purchased = greatest(ai_credits.purchased + _delta, 0), updated_at = now()
    RETURNING purchased INTO _n;
  INSERT INTO audit_log (user_id, action, entity, entity_id, details)
  VALUES (_actor, 'credits.adjust', 'user', _user::text, jsonb_build_object('delta', _delta, 'reason', left(_reason, 300), 'after', _n));
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.ai_consume(uuid), public.ai_refund(uuid), public.ai_credit_order(uuid,text,jsonb), public.ai_admin_adjust(uuid,uuid,int,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_consume(uuid), public.ai_refund(uuid), public.ai_credit_order(uuid,text,jsonb), public.ai_admin_adjust(uuid,uuid,int,text) TO service_role;