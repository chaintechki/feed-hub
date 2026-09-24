ALTER TABLE public.match_odds ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'auto', ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS market_group text NOT NULL DEFAULT 'main', ADD COLUMN IF NOT EXISTS alerted boolean NOT NULL DEFAULT false;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS score numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS factors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS margin_skewed boolean NOT NULL DEFAULT false;

CREATE TABLE public.odds_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id text NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  market text NOT NULL,
  specifier text,
  outcome text NOT NULL,
  odds numeric NOT NULL,
  prev_odds numeric,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX odds_history_match_idx ON public.odds_history(match_id, changed_at DESC);
GRANT SELECT, INSERT ON public.odds_history TO authenticated;
GRANT ALL ON public.odds_history TO service_role;
ALTER TABLE public.odds_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read odds history" ON public.odds_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write odds history" ON public.odds_history FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'trader') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_log_match_idx ON public.alert_log(match_id, created_at DESC);
GRANT SELECT, INSERT ON public.alert_log TO authenticated;
GRANT ALL ON public.alert_log TO service_role;
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alert log" ON public.alert_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders insert alert log" ON public.alert_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(),'trader') OR public.has_role(auth.uid(),'admin')));

-- traders may regenerate alerts
CREATE POLICY "traders insert alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'trader') OR public.has_role(auth.uid(),'admin'));
GRANT INSERT ON public.alerts TO authenticated;

-- demo: alert scores
UPDATE public.alerts SET score = CASE severity WHEN 'critical' THEN 78 WHEN 'warning' THEN 42 ELSE 12 END,
  factors = CASE type
    WHEN 'odds_deviation' THEN '[{"factor":"Own vs average deviation","value":34},{"factor":"Liability","value":28},{"factor":"Tournament factor","value":16}]'::jsonb
    WHEN 'margin' THEN '[{"factor":"Margin skew","value":30},{"factor":"Market movement","value":12}]'::jsonb
    WHEN 'feed_delay' THEN '[{"factor":"Feed latency","value":42}]'::jsonb
    ELSE '[{"factor":"Line-up change","value":12}]'::jsonb END;
UPDATE public.matches SET margin_skewed = true WHERE id IN ('sr:match:41002','sr:match:41005');

-- demo: additional markets per soccer-like match
INSERT INTO public.match_odds (match_id, source, market, specifier, outcomes, margin, market_group, updated_at)
SELECT m.id, s.source, x.market, x.spec, x.outcomes::jsonb, x.margin, x.grp, now() - (random()*interval '12 minutes')
FROM public.matches m
CROSS JOIN (VALUES ('own'),('average')) s(source)
CROSS JOIN (VALUES
  ('double_chance', NULL, '[{"label":"1X","odds":1.30},{"label":"12","odds":1.28},{"label":"X2","odds":1.62}]', 105, 'main'),
  ('btts', NULL, '[{"label":"Yes","odds":1.80},{"label":"No","odds":1.95}]', 106, 'goals'),
  ('total', '1.5', '[{"label":"Over","odds":1.30},{"label":"1.5","odds":null},{"label":"Under","odds":3.30}]', 107, 'goals'),
  ('total', '3.5', '[{"label":"Over","odds":3.10},{"label":"3.5","odds":null},{"label":"Under","odds":1.35}]', 107, 'goals'),
  ('ht_1x2', NULL, '[{"label":"1","odds":3.00},{"label":"X","odds":2.05},{"label":"2","odds":3.60}]', 108, 'halves'),
  ('ht_total', '0.5', '[{"label":"Over","odds":1.40},{"label":"0.5","odds":null},{"label":"Under","odds":2.80}]', 107, 'halves'),
  ('correct_score', NULL, '[{"label":"1:0","odds":7.5},{"label":"0:0","odds":9.0},{"label":"1:1","odds":6.5},{"label":"0:1","odds":9.5}]', 120, 'score')
) x(market, spec, outcomes, margin, grp)
ON CONFLICT DO NOTHING;
UPDATE public.match_odds SET market_group = 'handicap' WHERE market = 'handicap';
UPDATE public.match_odds SET market_group = 'goals' WHERE market = 'total' AND specifier = '2.5';
UPDATE public.match_odds SET control_mode = 'semi_auto' WHERE source='own' AND market='btts' AND match_id IN ('sr:match:41001','sr:match:41003');
UPDATE public.match_odds SET control_mode = 'manual' WHERE source='own' AND market='ht_1x2' AND match_id = 'sr:match:41002';
UPDATE public.match_odds SET alerted = true WHERE source='own' AND market='1x2' AND match_id IN (SELECT match_id FROM public.alerts WHERE match_id IS NOT NULL);
UPDATE public.match_odds SET updated_at = now() - (random()*interval '12 minutes');

-- demo: odds history (recent changes for fading colours)
INSERT INTO public.odds_history (match_id, market, specifier, outcome, odds, prev_odds, changed_at)
SELECT o.match_id, o.market, o.specifier, e->>'label', (e->>'odds')::numeric,
  round(((e->>'odds')::numeric * (CASE WHEN random() < 0.5 THEN 1.04 ELSE 0.96 END))::numeric, 2),
  now() - (random()*interval '10 minutes')
FROM public.match_odds o, jsonb_array_elements(o.outcomes) e
WHERE o.source='own' AND e->>'odds' IS NOT NULL AND random() < 0.45;