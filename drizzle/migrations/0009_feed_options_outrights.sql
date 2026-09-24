CREATE TABLE public.feed_options (
  scope text PRIMARY KEY CHECK (scope IN ('prematch','live')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.feed_options TO authenticated;
GRANT ALL ON public.feed_options TO service_role;
ALTER TABLE public.feed_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read feed options" ON public.feed_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write feed options" ON public.feed_options FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.feed_options (scope, options) VALUES
('prematch','{"fgs_void":"void_non_fielders","ags_void":"void_non_fielders","lgs_void":"void_non_fielders","harmonisation":"none","send_probabilities":false,"abandoned":"void_undecided","tennis_retirement":"void_undecided","goalscorer_extra":false,"outrights_others":false,"mlb_pitcher":false,"golf_3ball":"dead_heat"}'),
('live','{"harmonisation":"none","rounding":"betradar","dynamic_key":true}');

ALTER TABLE public.outrights ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS odds_key numeric NOT NULL DEFAULT 115 CHECK (odds_key >= 100 AND odds_key <= 200),
  ADD COLUMN IF NOT EXISTS custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid;
GRANT INSERT, UPDATE, DELETE ON public.outrights TO authenticated;
CREATE POLICY "traders insert outrights" ON public.outrights FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) AND custom);
CREATE POLICY "traders update outrights" ON public.outrights FOR UPDATE TO authenticated USING (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin'));
CREATE POLICY "traders delete custom outrights" ON public.outrights FOR DELETE TO authenticated USING ((has_role(auth.uid(),'trader') OR has_role(auth.uid(),'admin')) AND custom);