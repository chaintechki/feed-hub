-- Admins may list all operators
create policy "admins read profiles" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Demo feed data so the panel is usable before the live feed is connected
insert into public.sports (id, name, sort_order) values
  ('sr:sport:1','Soccer',1),
  ('sr:sport:2','Basketball',2),
  ('sr:sport:5','Tennis',3),
  ('sr:sport:4','Ice Hockey',4)
on conflict (id) do nothing;

insert into public.categories (id, sport_id, name, country_code) values
  ('sr:category:1','sr:sport:1','England','ENG'),
  ('sr:category:31','sr:sport:1','Spain','ESP'),
  ('sr:category:30','sr:sport:1','Germany','DEU'),
  ('sr:category:3','sr:sport:2','USA','USA'),
  ('sr:category:6','sr:sport:5','ATP','INT'),
  ('sr:category:17','sr:sport:4','NHL','USA')
on conflict (id) do nothing;

insert into public.tournaments (id, category_id, sport_id, name) values
  ('sr:tournament:17','sr:category:1','sr:sport:1','Premier League'),
  ('sr:tournament:24','sr:category:1','sr:sport:1','Championship'),
  ('sr:tournament:8','sr:category:31','sr:sport:1','LaLiga'),
  ('sr:tournament:35','sr:category:30','sr:sport:1','Bundesliga'),
  ('sr:tournament:132','sr:category:3','sr:sport:2','NBA'),
  ('sr:tournament:2555','sr:category:6','sr:sport:5','ATP Masters'),
  ('sr:tournament:234','sr:category:17','sr:sport:4','NHL Regular Season')
on conflict (id) do nothing;

insert into public.matches
  (id, tournament_id, category_id, sport_id, home_team, away_team, scheduled, status,
   liveodds, booked, control_mode, suspended, hotlisted, alerted, provider_only,
   early_odds, comment_count, match_minute) values
  ('sr:match:41001','sr:tournament:17','sr:category:1','sr:sport:1','Arsenal','Liverpool', now() + interval '3 hours','not_started','booked',true,'semi_auto',false,true,true,false,true,2,null),
  ('sr:match:41002','sr:tournament:17','sr:category:1','sr:sport:1','Manchester City','Chelsea', now() + interval '6 hours','not_started','booked',true,'semi_auto',false,false,false,false,true,0,null),
  ('sr:match:41003','sr:tournament:17','sr:category:1','sr:sport:1','Everton','Newcastle United', now() - interval '35 minutes','live','booked',true,'manual',false,false,true,false,false,1,38),
  ('sr:match:41004','sr:tournament:8','sr:category:31','sr:sport:1','Real Madrid','Sevilla', now() + interval '20 hours','not_started','booked',true,'semi_auto',false,true,false,false,true,0,null),
  ('sr:match:41005','sr:tournament:8','sr:category:31','sr:sport:1','Villarreal','Athletic Bilbao', now() + interval '2 days','not_started','not_available',false,'locked',false,false,false,true,false,0,null),
  ('sr:match:41006','sr:tournament:35','sr:category:30','sr:sport:1','Bayern Munich','Borussia Dortmund', now() + interval '1 day','not_started','booked',true,'semi_auto',true,true,true,false,true,3,null),
  ('sr:match:41007','sr:tournament:132','sr:category:3','sr:sport:2','Boston Celtics','Miami Heat', now() + interval '9 hours','not_started','booked',true,'manual',false,false,false,false,false,0,null),
  ('sr:match:41008','sr:tournament:234','sr:category:17','sr:sport:4','New York Rangers','Boston Bruins', now() + interval '11 hours','not_started','booked',true,'semi_auto',false,false,false,false,false,0,null),
  ('sr:match:41009','sr:tournament:17','sr:category:1','sr:sport:1','Tottenham Hotspur','Aston Villa', now() - interval '3 days','ended','not_available',true,'locked',false,false,false,false,false,1,null),
  ('sr:match:41010','sr:tournament:8','sr:category:31','sr:sport:1','Girona','Valencia', now() - interval '5 days','ended','not_available',true,'locked',false,false,false,false,false,0,null)
on conflict (id) do nothing;

insert into public.match_odds (match_id, source, market, specifier, outcomes, margin) values
  ('sr:match:41001','own','1x2',null,'[{"label":"1","odds":2.35,"trend":"up"},{"label":"X","odds":3.40},{"label":"2","odds":2.95,"trend":"down"}]',105),
  ('sr:match:41001','average','1x2',null,'[{"label":"1","odds":2.30},{"label":"X","odds":3.45},{"label":"2","odds":3.00}]',103),
  ('sr:match:41001','own','total','2.5','[{"label":"Over","odds":1.85,"trend":"up"},{"label":"2.5","odds":null},{"label":"Under","odds":1.95}]',106),
  ('sr:match:41001','average','total','2.5','[{"label":"Over","odds":1.88},{"label":"2.5","odds":null},{"label":"Under","odds":1.92}]',103),
  ('sr:match:41001','own','handicap','-0.5','[{"label":"1","odds":1.75},{"label":"-0.5","odds":null},{"label":"2","odds":2.10}]',105),
  ('sr:match:41001','average','handicap','-0.5','[{"label":"1","odds":1.78},{"label":"-0.5","odds":null},{"label":"2","odds":2.06}]',103),
  ('sr:match:41002','own','1x2',null,'[{"label":"1","odds":1.72,"trend":"down"},{"label":"X","odds":3.90},{"label":"2","odds":4.60}]',105),
  ('sr:match:41002','average','1x2',null,'[{"label":"1","odds":1.75},{"label":"X","odds":3.85},{"label":"2","odds":4.50}]',103),
  ('sr:match:41002','own','total','3.0','[{"label":"Over","odds":2.05},{"label":"3.0","odds":null},{"label":"Under","odds":1.78}]',105),
  ('sr:match:41002','average','total','3.0','[{"label":"Over","odds":2.02},{"label":"3.0","odds":null},{"label":"Under","odds":1.80}]',103),
  ('sr:match:41003','own','1x2',null,'[{"label":"1","odds":3.10,"trend":"up"},{"label":"X","odds":2.90},{"label":"2","odds":2.45,"trend":"down"}]',107),
  ('sr:match:41003','average','1x2',null,'[{"label":"1","odds":3.05},{"label":"X","odds":2.95},{"label":"2","odds":2.48}]',104),
  ('sr:match:41004','own','1x2',null,'[{"label":"1","odds":1.45},{"label":"X","odds":4.60},{"label":"2","odds":6.80}]',105),
  ('sr:match:41004','average','1x2',null,'[{"label":"1","odds":1.47},{"label":"X","odds":4.50},{"label":"2","odds":6.60}]',103),
  ('sr:match:41006','own','1x2',null,'[{"label":"1","odds":1.95,"trend":"down"},{"label":"X","odds":3.80},{"label":"2","odds":3.60,"trend":"up"}]',106),
  ('sr:match:41006','average','1x2',null,'[{"label":"1","odds":1.98},{"label":"X","odds":3.75},{"label":"2","odds":3.55}]',103),
  ('sr:match:41007','own','handicap','-4.5','[{"label":"1","odds":1.90},{"label":"-4.5","odds":null},{"label":"2","odds":1.90}]',105),
  ('sr:match:41007','average','handicap','-4.5','[{"label":"1","odds":1.92},{"label":"-4.5","odds":null},{"label":"2","odds":1.88}]',103),
  ('sr:match:41008','own','1x2',null,'[{"label":"1","odds":2.20},{"label":"X","odds":4.10},{"label":"2","odds":2.75}]',105),
  ('sr:match:41008','average','1x2',null,'[{"label":"1","odds":2.22},{"label":"X","odds":4.00},{"label":"2","odds":2.78}]',103)
on conflict (match_id, source, market, specifier) do nothing;

insert into public.outrights (id, tournament_id, name, scheduled, status, competitors) values
  ('sr:outright:101','sr:tournament:17','Premier League Winner 2025/26', now() + interval '120 days','open','[{"name":"Arsenal","odds":2.5},{"name":"Manchester City","odds":2.8},{"name":"Liverpool","odds":4.0}]'),
  ('sr:outright:102','sr:tournament:8','LaLiga Winner 2025/26', now() + interval '130 days','open','[{"name":"Real Madrid","odds":1.9},{"name":"Barcelona","odds":2.4}]'),
  ('sr:outright:103','sr:tournament:132','NBA Champion', now() + interval '200 days','open','[{"name":"Boston Celtics","odds":4.5},{"name":"Denver Nuggets","odds":5.5}]')
on conflict (id) do nothing;

insert into public.alerts (match_id, severity, type, message) values
  ('sr:match:41001','critical','odds_deviation','Own 1X2 odds deviate more than 6% from market average'),
  ('sr:match:41003','warning','feed_delay','Live feed delayed by 12 seconds'),
  ('sr:match:41006','info','lineup','Lineup confirmed, odds recalculated'),
  ('sr:match:41002','warning','margin','Margin below configured minimum for Total 3.0');

insert into public.settlements (match_id, market, specifier, outcome, state) values
  ('sr:match:41009','1x2',null,'1','pending'),
  ('sr:match:41009','total','2.5','Over','pending'),
  ('sr:match:41010','1x2',null,'2','settled');

insert into public.margin_templates (name, sport_id, market, margin, max_stake) values
  ('Soccer default','sr:sport:1','1x2',105,5000),
  ('Soccer totals','sr:sport:1','total',106,3000),
  ('Basketball default','sr:sport:2','handicap',104,4000);