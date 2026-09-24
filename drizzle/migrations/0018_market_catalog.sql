ALTER TABLE public.api_clients ADD COLUMN IF NOT EXISTS market_groups text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.uof_markets ADD COLUMN IF NOT EXISTS name_de text, ADD COLUMN IF NOT EXISTS outcomes_de jsonb, ADD COLUMN IF NOT EXISTS market_group text NOT NULL DEFAULT 'other';

CREATE OR REPLACE FUNCTION public.market_group_of(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _name ~* '(\{%player\}|player|scorer)' THEN 'players'
    WHEN _name ~* 'corner' THEN 'corners'
    WHEN _name ~* '(card|booking)' THEN 'cards'
    WHEN _name ~* '(1st half|2nd half|half)' THEN 'half'
    WHEN _name ~* '(quarter|period|set|inning|map|game|round|frame|over |overs)' THEN 'periods'
    WHEN _name ~* '(goal|score|both teams|exact|odd/even)' THEN 'goals'
    WHEN _name ~* '(total|handicap|winner|1x2|draw no bet|double chance|moneyline)' THEN 'main'
    ELSE 'other' END
$$;

UPDATE public.uof_markets SET market_group = public.market_group_of(name);
UPDATE public.match_odds o SET market_group = u.market_group
  FROM public.uof_markets u
  WHERE o.market = 'm' || u.id AND u.variant = '' AND o.market_group = 'other';