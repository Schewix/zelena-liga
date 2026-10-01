create table if not exists public.content_lodging_tips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place text,
  lat double precision not null check (lat between 48.5 and 51.1),
  lng double precision not null check (lng between 12.0 and 18.9),
  url text,
  group_size integer check (group_size is null or group_size between 1 and 500),
  communication text,
  rating smallint check (rating is null or rating between 1 and 5),
  review text,
  leader_name text not null,
  leader_contact text not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists content_lodging_tips_published_idx
  on public.content_lodging_tips (published, created_at desc);

alter table public.content_lodging_tips enable row level security;

create table if not exists public.content_equipment_loans (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'games' check (kind in ('games', 'material')),
  title text not null,
  description text,
  place text,
  leader_name text not null,
  leader_contact text not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists content_equipment_loans_published_idx
  on public.content_equipment_loans (published, created_at desc);

alter table public.content_equipment_loans enable row level security;
