CREATE TABLE public.bookmakers (
  id text PRIMARY KEY,
  name text NOT NULL,
  suggested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bookmakers TO authenticated;
GRANT ALL ON public.bookmakers TO service_role;
ALTER TABLE public.bookmakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bookmakers" ON public.bookmakers FOR SELECT TO authenticated USING (true);

CREATE TABLE public.bookmaker_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('sport','category','tournament')),
  ref_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmaker_lists TO authenticated;
GRANT ALL ON public.bookmaker_lists TO service_role;
ALTER TABLE public.bookmaker_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bl" ON public.bookmaker_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write bl" ON public.bookmaker_lists FOR ALL TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));

CREATE TABLE public.bookmaker_list_items (
  list_id uuid NOT NULL REFERENCES public.bookmaker_lists(id) ON DELETE CASCADE,
  bookmaker_id text NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 10),
  PRIMARY KEY (list_id, bookmaker_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmaker_list_items TO authenticated;
GRANT ALL ON public.bookmaker_list_items TO service_role;
ALTER TABLE public.bookmaker_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bli" ON public.bookmaker_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write bli" ON public.bookmaker_list_items FOR ALL TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));

CREATE TABLE public.bookmaker_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  bookmaker_id text NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  market text NOT NULL,
  specifier text,
  outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookmaker_odds_match_idx ON public.bookmaker_odds(match_id);
GRANT SELECT ON public.bookmaker_odds TO authenticated;
GRANT ALL ON public.bookmaker_odds TO service_role;
ALTER TABLE public.bookmaker_odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bo" ON public.bookmaker_odds FOR SELECT TO authenticated USING (true);

INSERT INTO public.bookmakers (id, name, suggested) VALUES
('bm:1','Bet365',true),('bm:2','Pinnacle',true),('bm:3','William Hill',true),('bm:4','Unibet',true),
('bm:5','Betfair Sportsbook',false),('bm:6','Bwin',false),('bm:7','Tipico',false),('bm:8','Betway',false),('bm:9','1xBet',false),('bm:10','Interwetten',false);

WITH l AS (INSERT INTO public.bookmaker_lists (level, ref_id) SELECT 'sport', id FROM public.sports WHERE id='sr:sport:1' RETURNING id)
INSERT INTO public.bookmaker_list_items (list_id, bookmaker_id, weight) SELECT l.id, b.id, b.w FROM l, (VALUES ('bm:2',3.0),('bm:1',2.0),('bm:3',1.5),('bm:4',1.0),('bm:7',1.0)) b(id,w);

-- demo competitor odds: average odds perturbed per bookmaker
INSERT INTO public.bookmaker_odds (match_id, bookmaker_id, market, specifier, outcomes, updated_at)
SELECT o.match_id, b.id, o.market, o.specifier,
  (SELECT jsonb_agg(CASE WHEN e->>'odds' IS NULL THEN e ELSE jsonb_set(e,'{odds}', to_jsonb(round(greatest(1.01,(e->>'odds')::numeric * (0.94 + random()*0.1))::numeric,2))) END ORDER BY ord)
   FROM jsonb_array_elements(o.outcomes) WITH ORDINALITY AS x(e, ord)),
  now() - random()*interval '20 minutes'
FROM public.match_odds o CROSS JOIN public.bookmakers b
WHERE o.source='average' AND o.market IN ('1x2','total','handicap','btts','double_chance') AND random() < 0.85;