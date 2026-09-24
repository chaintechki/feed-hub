-- Track denied feed-API / widget requests so admins get full usage control.
create table public.api_denials (
  id bigint generated always as identity primary key,
  client_id uuid references public.api_clients(id) on delete set null,
  key_hint text not null default '',
  bucket_key text not null,
  minute timestamptz not null,
  endpoint text not null,
  reason text not null,
  count integer not null default 0,
  unique (bucket_key, minute, endpoint, reason)
);

grant select on public.api_denials to authenticated;
grant all on public.api_denials to service_role;
alter table public.api_denials enable row level security;
create policy "admins read api_denials" on public.api_denials for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.api_track_denial(_client uuid, _key_hint text, _endpoint text, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into api_denials (client_id, key_hint, bucket_key, minute, endpoint, reason, count)
  values (
    _client,
    coalesce(_key_hint, ''),
    coalesce(_client::text, 'unknown:' || coalesce(_key_hint, '')),
    date_trunc('minute', now()),
    _endpoint,
    _reason,
    1
  )
  on conflict (bucket_key, minute, endpoint, reason)
  do update set count = api_denials.count + 1;
end $$;
revoke execute on function public.api_track_denial(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.api_track_denial(uuid,text,text,text) to service_role;