CREATE TABLE public.ladders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','pairs')),
  "values" jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ladders TO authenticated;
GRANT ALL ON public.ladders TO service_role;
ALTER TABLE public.ladders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read ladders" ON public.ladders FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write ladders" ON public.ladders FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) AND NOT is_system);
CREATE POLICY "traders update ladders" ON public.ladders FOR UPDATE TO authenticated USING ((has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) AND NOT is_system) WITH CHECK (NOT is_system);
CREATE POLICY "traders delete ladders" ON public.ladders FOR DELETE TO authenticated USING ((has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) AND NOT is_system);

CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sport_id text REFERENCES public.sports(id) ON DELETE SET NULL,
  ladder_id uuid REFERENCES public.ladders(id) ON DELETE SET NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tpl" ON public.templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write tpl" ON public.templates FOR ALL TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));

CREATE TABLE public.template_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  category_id text REFERENCES public.categories(id) ON DELETE CASCADE,
  tournament_id text REFERENCES public.tournaments(id) ON DELETE CASCADE,
  CHECK ((category_id IS NULL) <> (tournament_id IS NULL))
);
CREATE UNIQUE INDEX template_assign_cat ON public.template_assignments(category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX template_assign_tour ON public.template_assignments(tournament_id) WHERE tournament_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_assignments TO authenticated;
GRANT ALL ON public.template_assignments TO service_role;
ALTER TABLE public.template_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read ta" ON public.template_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write ta" ON public.template_assignments FOR ALL TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));

CREATE TABLE public.tournament_config (
  tournament_id text PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  activation text NOT NULL DEFAULT 'ctrl' CHECK (activation IN ('off','mon','ctrl')),
  alert_factor numeric NOT NULL DEFAULT 1 CHECK (alert_factor >= 0 AND alert_factor <= 2),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_config TO authenticated;
GRANT ALL ON public.tournament_config TO service_role;
ALTER TABLE public.tournament_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tc" ON public.tournament_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "traders write tc" ON public.tournament_config FOR ALL TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));

INSERT INTO public.tournament_config (tournament_id) SELECT id FROM public.tournaments ON CONFLICT DO NOTHING;

INSERT INTO public.ladders (name, kind, "values", is_system) VALUES
('Betradar standard','single','[1.01,1.02,1.03,1.04,1.05,1.06,1.07,1.08,1.09,1.1,1.12,1.14,1.15,1.17,1.19,1.21,1.23,1.25,1.3,1.35,1.4,1.45,1.5,1.55,1.6,1.65,1.7,1.75,1.8,1.85,1.9,1.95,2,2.05,2.1,2.2,2.3,2.4,2.5,2.6,2.75,2.9,3,3.25,3.5,3.75,4,4.5,5,5.5,6,6.5,7,7.5,8,9,10,11,12,13,15,17,19,21,26,31,41,51]',true),
('Betradar low key','single','[1.01,1.02,1.03,1.04,1.05,1.1,1.15,1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.55,1.6,1.65,1.7,1.75,1.8,1.85,1.9,1.95,2,2.02,2.04,2.1,2.2,2.3,2.4,2.5,2.6,2.8,3,3.05,3.5,4,4.1,4.5,5,6,6.2,7,8,10,10.5,15,20,21,30]',true),
('US standard','single','[1.1,1.2,1.25,1.33,1.4,1.5,1.53,1.57,1.61,1.67,1.71,1.77,1.83,1.87,1.91,1.95,2,2.05,2.1,2.2,2.3,2.4,2.5,2.75,3,3.5,4,5,6,8,11]',true),
('Pairs 2-way standard','pairs','[[1.01,15],[1.05,9],[1.1,6.5],[1.2,4.33],[1.3,3.4],[1.4,2.8],[1.5,2.5],[1.6,2.25],[1.7,2.1],[1.8,1.95],[1.87,1.87]]',true),
('Pairs 2-way low margin','pairs','[[1.05,11],[1.1,7],[1.2,4.6],[1.3,3.6],[1.4,2.95],[1.5,2.6],[1.6,2.35],[1.7,2.15],[1.8,2],[1.91,1.91]]',true);

INSERT INTO public.templates (name, sport_id, ladder_id, config)
SELECT 'Soccer default', 'sr:sport:1', (SELECT id FROM public.ladders WHERE name='Betradar standard'),
'{"markets":{
 "1x2":{"enabled":true,"timeline":[{"at":"inst","key":112},{"at":72,"key":108},{"at":24,"key":106},{"at":3,"key":103}],"distribution":[0,0,0],"lines":null,"ladder_id":null},
 "total":{"enabled":true,"timeline":[{"at":"inst","key":105},{"at":3,"key":107}],"distribution":[0,0],"lines":{"types":["0.5"],"max":3},"ladder_id":null},
 "handicap":{"enabled":true,"timeline":[{"at":24,"key":106}],"distribution":[0,0],"lines":{"types":["0.25","0.5"],"max":2},"ladder_id":null},
 "double_chance":{"enabled":true,"timeline":[{"at":"inst","key":105}],"distribution":[0,0,0],"lines":null,"ladder_id":null},
 "btts":{"enabled":true,"timeline":[{"at":"inst","key":106}],"distribution":[0,0],"lines":null,"ladder_id":null},
 "ht_1x2":{"enabled":false,"timeline":[{"at":"inst","key":108}],"distribution":[0,0,0],"lines":null,"ladder_id":null},
 "ht_total":{"enabled":false,"timeline":[{"at":"inst","key":107}],"distribution":[0,0],"lines":{"types":["0.5"],"max":2},"ladder_id":null},
 "correct_score":{"enabled":true,"timeline":[{"at":"inst","key":120}],"distribution":[],"lines":null,"ladder_id":null}
}}'::jsonb
WHERE EXISTS (SELECT 1 FROM public.sports WHERE id='sr:sport:1');