create table if not exists public.content_schedule_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date,
  kind text not null default 'event' check (kind in ('event', 'assembly', 'staff')),
  note text,
  href text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_schedule_events_start_idx
  on public.content_schedule_events (start_date);

create index if not exists content_schedule_events_published_idx
  on public.content_schedule_events (published);

create or replace function public.set_content_schedule_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_content_schedule_events_updated_at on public.content_schedule_events;
create trigger set_content_schedule_events_updated_at
  before update on public.content_schedule_events
  for each row execute function public.set_content_schedule_events_updated_at();

alter table public.content_schedule_events enable row level security;

-- Termíny školního roku 2026/2027 přenesené z konstanty SCHOOL_YEAR_EVENTS v Homepage.tsx.
-- Seedujeme jen do prázdné tabulky, aby opakované spuštění nepřepsalo úpravy z redakce.
insert into public.content_schedule_events (name, start_date, end_date, kind, note, href)
select *
from (
  values
    ('Sněm SPTO', date '2026-09-08', null::date, 'assembly', null::text, null::text),
    ('ZaPsem', date '2026-10-03', null, 'event', null, null),
    ('Štáb SPTO', date '2026-10-13', null, 'staff', null, null),
    ('Štáb SPTO', date '2026-11-10', null, 'staff', null, null),
    ('Štáb SPTO', date '2026-12-08', null, 'staff', null, null),
    ('Sněm SPTO', date '2027-01-12', null, 'assembly', null, null),
    ('Štáb SPTO', date '2027-02-02', null, 'staff', null, null),
    ('Deskové hry', date '2027-02-13', null, 'event', null, '/souteze/deskove-hry'),
    ('Sněm SPTO', date '2027-03-09', null, 'assembly', null, null),
    ('Štáb SPTO', date '2027-04-06', null, 'staff', null, null),
    ('Setonův závod', date '2027-04-24', null, 'event', null, '/souteze/setonuv-zavod'),
    ('Štáb SPTO', date '2027-05-04', null, 'staff', null, null),
    ('Sraz PTO', date '2027-05-21', date '2027-05-23', 'event', null, null),
    ('Sněm SPTO', date '2027-06-15', null, 'assembly', 'Grilovací sněm', null)
) as seed (name, start_date, end_date, kind, note, href)
where not exists (select 1 from public.content_schedule_events);
