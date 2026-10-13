begin;

do $$
declare n bigint;
begin
  if to_regclass('public.club_memberships') is not null then
    execute 'select count(*) from public.club_memberships' into n;
    if n = 0 then
      execute 'drop table public.club_memberships';
      raise notice 'Dropped empty legacy table club_memberships';
    else
      raise exception 'Legacy table club_memberships has % rows. Review it before running this migration.', n;
    end if;
  end if;
end $$;

create table if not exists public.circuit_seasons (
  id                  uuid primary key default gen_random_uuid(),
  series_id           uuid not null references public.series(id),
  season              int  not null,
  signup_fee_mxn      numeric(10,2) not null default 800,
  extra_horse_fee_mxn numeric(10,2) not null default 400,
  payment_deadline    date,
  registration_open   boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (series_id, season)
);

create table if not exists public.circuit_memberships (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.circuit_seasons(id) on delete cascade,
  club_id       uuid not null references public.clubs(id),
  rider_id      uuid not null references public.riders(id),
  registered_on date not null default current_date,
  fee_mxn       numeric(10,2) not null,
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (season_id, rider_id)
);

create index if not exists circuit_memberships_club_idx on public.circuit_memberships(club_id);
create index if not exists circuit_memberships_season_idx on public.circuit_memberships(season_id);

create table if not exists public.circuit_membership_horses (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.circuit_memberships(id) on delete cascade,
  horse_id      uuid not null references public.horses(id),
  added_on      date not null default current_date,
  is_included   boolean not null default false,
  fee_mxn       numeric(10,2) not null default 0,
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (membership_id, horse_id)
);

create index if not exists circuit_membership_horses_horse_idx on public.circuit_membership_horses(horse_id);

create or replace view public.v_club_membership_due with (security_invoker = true) as
select
  m.club_id,
  m.season_id,
  count(*) as members,
  coalesce(sum(hx.horses), 0) as horses,
  sum(m.fee_mxn) + coalesce(sum(hx.horse_fees), 0) as amount_due_mxn
from public.circuit_memberships m
left join lateral (
  select count(*) as horses, sum(h.fee_mxn) as horse_fees
  from public.circuit_membership_horses h
  where h.membership_id = m.id and h.status = 'active'
) hx on true
where m.status = 'active'
group by m.club_id, m.season_id;

alter table public.circuit_seasons           enable row level security;
alter table public.circuit_memberships       enable row level security;
alter table public.circuit_membership_horses enable row level security;

insert into public.circuit_seasons (series_id, season)
select s.id, 2027 from public.series s where s.slug = 'cesqroo'
on conflict (series_id, season) do nothing;

commit;
