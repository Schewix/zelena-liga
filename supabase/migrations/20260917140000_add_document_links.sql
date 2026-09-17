-- Pozvánky od pořadatelů obsahují víc odkazů (zápis na autobus, přihlašovna, tabulka na pomoc),
-- jedno pole external_url na to nestačí. Ukládáme pole { label, url } v pořadí, v jakém je redakce zadá.
alter table public.content_documents
  add column if not exists links jsonb not null default '[]'::jsonb;

-- Ať se do sloupce nedostane nic jiného než pole – obsah jednotlivých položek hlídá API.
alter table public.content_documents
  drop constraint if exists content_documents_links_is_array;

alter table public.content_documents
  add constraint content_documents_links_is_array
    check (jsonb_typeof(links) = 'array');

-- Dosavadní jediný odkaz přebíráme jako první položku, ať se po nasazení nic neztratí.
update public.content_documents
set links = jsonb_build_array(jsonb_build_object('label', '', 'url', external_url))
where links = '[]'::jsonb
  and external_url is not null
  and length(trim(external_url)) > 0;
