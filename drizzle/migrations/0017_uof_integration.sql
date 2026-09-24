create table public.uof_markets (
  id integer not null, variant text not null default '', name text not null, outcomes jsonb not null default '[]', specifiers text,
  updated_at timestamptz not null default now(), primary key (id, variant));
grant select on public.uof_markets to authenticated; grant all on public.uof_markets to service_role;
alter table public.uof_markets enable row level security;
create policy "auth read uof_markets" on public.uof_markets for select to authenticated using (true);

create table public.uof_producers (
  id integer primary key, name text not null, last_alive_at timestamptz, last_message_at timestamptz,
  last_recovery_at timestamptz, down boolean not null default true, updated_at timestamptz not null default now());
grant select on public.uof_producers to authenticated; grant all on public.uof_producers to service_role;
alter table public.uof_producers enable row level security;
create policy "auth read uof_producers" on public.uof_producers for select to authenticated using (true);

create table public.uof_sync_runs (
  id bigint generated always as identity primary key, kind text not null, ok boolean not null, details jsonb,
  created_at timestamptz not null default now());
grant select on public.uof_sync_runs to authenticated; grant all on public.uof_sync_runs to service_role;
alter table public.uof_sync_runs enable row level security;
create policy "admins read uof_sync_runs" on public.uof_sync_runs for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

create table public.uof_messages_log (
  id bigint generated always as identity primary key, kind text not null, event_id text, error text not null,
  created_at timestamptz not null default now());
grant select on public.uof_messages_log to authenticated; grant all on public.uof_messages_log to service_role;
alter table public.uof_messages_log enable row level security;
create policy "admins read uof_messages_log" on public.uof_messages_log for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

delete from public.odds_history; delete from public.bookmaker_odds; delete from public.match_odds;
delete from public.alert_log; delete from public.alerts; delete from public.match_comments; delete from public.settlements;
delete from public.matches; delete from public.outrights;

create unique index match_odds_feed_key on public.match_odds (match_id, source, market, specifier) nulls not distinct;
alter table public.matches add column if not exists home_id text, add column if not exists away_id text;