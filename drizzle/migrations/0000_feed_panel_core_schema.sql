-- Roles ---------------------------------------------------------------
create type public.app_role as enum ('admin','trader','viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "admins read all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Profiles ------------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'trader') on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sport hierarchy -----------------------------------------------------
create table public.sports (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create table public.categories (
  id text primary key,
  sport_id text not null references public.sports(id) on delete cascade,
  name text not null,
  country_code text
);
create table public.tournaments (
  id text primary key,
  category_id text not null references public.categories(id) on delete cascade,
  sport_id text not null references public.sports(id) on delete cascade,
  name text not null
);
create index on public.categories (sport_id);
create index on public.tournaments (category_id);

create table public.matches (
  id text primary key,
  tournament_id text not null references public.tournaments(id) on delete cascade,
  sport_id text not null references public.sports(id) on delete cascade,
  category_id text not null references public.categories(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  scheduled timestamptz not null,
  status text not null default 'not_started',
  liveodds text not null default 'not_available',
  match_minute int,
  booked boolean not null default false,
  suspended boolean not null default false,
  hotlisted boolean not null default false,
  alerted boolean not null default false,
  control_mode text not null default 'auto',
  comment_count int not null default 0,
  early_odds boolean not null default false,
  provider_only boolean not null default false,
  updated_at timestamptz not null default now()
);
create index on public.matches (scheduled);
create index on public.matches (sport_id, category_id, tournament_id);

create table public.match_odds (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  source text not null check (source in ('own','average')),
  market text not null,
  specifier text,
  outcomes jsonb not null default '[]'::jsonb,
  margin numeric(6,2),
  updated_at timestamptz not null default now(),
  unique (match_id, source, market, specifier)
);
create index on public.match_odds (match_id);

create table public.outrights (
  id text primary key,
  tournament_id text not null references public.tournaments(id) on delete cascade,
  name text not null,
  scheduled timestamptz,
  status text not null default 'open',
  competitors jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  match_id text references public.matches(id) on delete cascade,
  severity text not null default 'info',
  type text not null,
  message text not null,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.alerts (created_at desc);

create table public.match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.match_comments (match_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  match_id text references public.matches(id) on delete set null,
  market text not null,
  specifier text,
  outcome text,
  state text not null default 'pending',
  settled_by uuid,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.settlements (state);

create table public.user_settings (
  user_id uuid primary key,
  odds_format text not null default 'eu',
  language text not null default 'en',
  theme text not null default 'light',
  default_sports text[] not null default '{}',
  notifications jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.margin_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport_id text references public.sports(id) on delete cascade,
  market text not null,
  margin numeric(6,2) not null default 105,
  max_stake numeric(12,2),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

-- Grants ---------------------------------------------------------------
grant select on public.sports, public.categories, public.tournaments, public.matches,
  public.match_odds, public.outrights, public.alerts, public.match_comments,
  public.settlements, public.margin_templates, public.audit_log to authenticated;
grant insert, update, delete on public.matches, public.match_odds, public.alerts,
  public.match_comments, public.settlements, public.margin_templates to authenticated;
grant select, insert, update, delete on public.user_settings, public.filter_presets to authenticated;
grant insert on public.audit_log to authenticated;
grant all on public.sports, public.categories, public.tournaments, public.matches,
  public.match_odds, public.outrights, public.alerts, public.match_comments,
  public.settlements, public.user_settings, public.filter_presets,
  public.margin_templates, public.audit_log to service_role;

alter table public.sports enable row level security;
alter table public.categories enable row level security;
alter table public.tournaments enable row level security;
alter table public.matches enable row level security;
alter table public.match_odds enable row level security;
alter table public.outrights enable row level security;
alter table public.alerts enable row level security;
alter table public.match_comments enable row level security;
alter table public.settlements enable row level security;
alter table public.user_settings enable row level security;
alter table public.filter_presets enable row level security;
alter table public.margin_templates enable row level security;
alter table public.audit_log enable row level security;

-- Reference data: every signed-in operator may read
create policy "auth read sports" on public.sports for select to authenticated using (true);
create policy "auth read categories" on public.categories for select to authenticated using (true);
create policy "auth read tournaments" on public.tournaments for select to authenticated using (true);
create policy "auth read matches" on public.matches for select to authenticated using (true);
create policy "auth read odds" on public.match_odds for select to authenticated using (true);
create policy "auth read outrights" on public.outrights for select to authenticated using (true);
create policy "auth read alerts" on public.alerts for select to authenticated using (true);
create policy "auth read comments" on public.match_comments for select to authenticated using (true);
create policy "auth read settlements" on public.settlements for select to authenticated using (true);
create policy "auth read templates" on public.margin_templates for select to authenticated using (true);

-- Traders and admins may act on trading data
create policy "traders update matches" on public.matches for update to authenticated
  using (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'));
create policy "traders write odds" on public.match_odds for all to authenticated
  using (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'));
create policy "traders ack alerts" on public.alerts for update to authenticated
  using (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'));
create policy "traders write settlements" on public.settlements for all to authenticated
  using (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'));
create policy "traders write templates" on public.margin_templates for all to authenticated
  using (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'trader') or public.has_role(auth.uid(),'admin'));

create policy "own comments insert" on public.match_comments for insert to authenticated with check (auth.uid() = author_id);
create policy "own comments delete" on public.match_comments for delete to authenticated using (auth.uid() = author_id);

create policy "own settings" on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own presets" on public.filter_presets for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "admins read audit" on public.audit_log for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "insert own audit" on public.audit_log for insert to authenticated with check (auth.uid() = user_id);
