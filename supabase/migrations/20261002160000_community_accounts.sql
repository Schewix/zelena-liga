-- Účty vedoucích pro web (tipy na ubytování, půjčování) sdílí tabulku judges s rozhodčími.
-- Práva k bodování ale vznikají jen přiřazením ve judge_assignments, takže účet bez přiřazení nic nemůže.
alter table public.judges
  add column if not exists email_verified_at timestamptz,
  add column if not exists account_type text not null default 'staff'
    check (account_type in ('staff', 'community'));

update public.judges set email_verified_at = coalesce(created_at, now()) where email_verified_at is null;

create table if not exists public.community_sessions (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references public.judges (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_sessions_judge_idx on public.community_sessions (judge_id);

create table if not exists public.community_email_codes (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references public.judges (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_email_codes_judge_idx on public.community_email_codes (judge_id, created_at desc);

-- Neúspěšné pokusy o přihlášení a ověření kódu, pro omezení hádání hesel.
create table if not exists public.community_auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_auth_attempts_key_idx on public.community_auth_attempts (key, created_at desc);

alter table public.community_sessions enable row level security;
alter table public.community_email_codes enable row level security;
alter table public.community_auth_attempts enable row level security;

-- Autor tipu je teď účet z judges, ne uživatel Supabase Auth. Dosavadní testovací řádky autora ztratí.
alter table public.content_lodging_tips drop constraint if exists content_lodging_tips_owner_id_fkey;
alter table public.content_equipment_loans drop constraint if exists content_equipment_loans_owner_id_fkey;
update public.content_lodging_tips set owner_id = null;
update public.content_equipment_loans set owner_id = null;
alter table public.content_lodging_tips
  add constraint content_lodging_tips_owner_id_fkey foreign key (owner_id) references public.judges (id) on delete set null;
alter table public.content_equipment_loans
  add constraint content_equipment_loans_owner_id_fkey foreign key (owner_id) references public.judges (id) on delete set null;
