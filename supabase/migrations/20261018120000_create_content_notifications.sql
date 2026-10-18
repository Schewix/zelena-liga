-- Evidence obsahu (články, fotoalba), o kterém už odešlo e-mailové upozornění.
-- Zapisuje jen serverová funkce se service role klíčem, proto RLS bez politik.
create table if not exists public.content_notifications (
  item_key text primary key,
  kind text not null check (kind in ('article', 'album')),
  title text not null,
  url text not null,
  notified_at timestamptz not null default now()
);

alter table public.content_notifications enable row level security;
