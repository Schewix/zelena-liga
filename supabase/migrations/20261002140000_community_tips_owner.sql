alter table public.content_lodging_tips
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

alter table public.content_equipment_loans
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists content_lodging_tips_owner_idx on public.content_lodging_tips (owner_id);
create index if not exists content_equipment_loans_owner_idx on public.content_equipment_loans (owner_id);
