create table if not exists public.afterparty_achievement_awards (
  participant_id uuid not null references public.afterparty_participants(id) on delete cascade,
  achievement_id text not null,
  bonus_points int not null default 0 check (bonus_points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (participant_id, achievement_id)
);

alter table public.afterparty_achievement_awards enable row level security;

drop policy if exists "afterparty_achievement_awards_read" on public.afterparty_achievement_awards;
create policy "afterparty_achievement_awards_read" on public.afterparty_achievement_awards
  for select using (auth.role() in ('anon', 'authenticated', 'service_role'));

grant select on public.afterparty_achievement_awards to anon, authenticated;

create or replace view public.afterparty_individual_leaderboard as
select
  p.id as participant_id,
  p.display_name,
  p.troop_name,
  (coalesce(o.points, 0) + coalesce(a.bonus, 0))::int as total_points,
  coalesce(o.orders, 0)::int as approved_orders
from public.afterparty_participants p
left join (
  select participant_id, sum(total_points) as points, count(*) as orders
  from public.afterparty_orders
  where status = 'approved'
  group by participant_id
) o on o.participant_id = p.id
left join (
  select participant_id, sum(bonus_points) as bonus
  from public.afterparty_achievement_awards
  group by participant_id
) a on a.participant_id = p.id;

create or replace view public.afterparty_troop_leaderboard as
select
  p.troop_name,
  coalesce(sum(coalesce(o.points, 0) + coalesce(a.bonus, 0)), 0)::int as total_points,
  count(p.id)::int as participants,
  coalesce(sum(o.orders), 0)::int as approved_orders
from public.afterparty_participants p
left join (
  select participant_id, sum(total_points) as points, count(*) as orders
  from public.afterparty_orders
  where status = 'approved'
  group by participant_id
) o on o.participant_id = p.id
left join (
  select participant_id, sum(bonus_points) as bonus
  from public.afterparty_achievement_awards
  group by participant_id
) a on a.participant_id = p.id
group by p.troop_name;

grant select on public.afterparty_individual_leaderboard to anon, authenticated;
grant select on public.afterparty_troop_leaderboard to anon, authenticated;
