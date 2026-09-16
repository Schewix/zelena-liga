create table if not exists public.content_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'ostatni'
    check (kind in ('sbornicek', 'propozice', 'zapis-snem', 'zapis-stab', 'prihlaska', 'ostatni')),
  title text not null,
  description text,
  event_date date,
  year integer,
  file_url text,
  file_path text,
  file_name text,
  file_size bigint,
  external_url text,
  cover_url text,
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  published boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_documents_kind_idx
  on public.content_documents (kind);

create index if not exists content_documents_event_date_idx
  on public.content_documents (event_date desc);

create index if not exists content_documents_published_idx
  on public.content_documents (published);

create or replace function public.set_content_documents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_content_documents_updated_at on public.content_documents;
create trigger set_content_documents_updated_at
  before update on public.content_documents
  for each row execute function public.set_content_documents_updated_at();

alter table public.content_documents enable row level security;

-- Bucket na PDF dokumenty a obálky sborníčků. Limit 50 MB kvůli skenovaným sborníčkům.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-documents',
  'content-documents',
  true,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content_documents_public_read" on storage.objects;
create policy "content_documents_public_read" on storage.objects
  for select using (
    bucket_id = 'content-documents'
    and auth.role() in ('anon', 'authenticated', 'service_role')
  );

drop policy if exists "content_documents_admin_insert" on storage.objects;
create policy "content_documents_admin_insert" on storage.objects
  for insert with check (
    bucket_id = 'content-documents'
    and auth.role() = 'service_role'
  );

drop policy if exists "content_documents_admin_update" on storage.objects;
create policy "content_documents_admin_update" on storage.objects
  for update using (
    bucket_id = 'content-documents'
    and auth.role() = 'service_role'
  ) with check (
    bucket_id = 'content-documents'
    and auth.role() = 'service_role'
  );

drop policy if exists "content_documents_admin_delete" on storage.objects;
create policy "content_documents_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'content-documents'
    and auth.role() = 'service_role'
  );
