-- Pozvánky s programem na sněm/štáb a pravidla akcí se mají dát nahrát z redakce, ne jen přibalit do repa.
alter table public.content_documents
  drop constraint if exists content_documents_kind_check;

alter table public.content_documents
  add constraint content_documents_kind_check
    check (kind in (
      'sbornicek',
      'propozice',
      'pozvanka',
      'pravidla',
      'zapis-snem',
      'zapis-stab',
      'prihlaska',
      'ostatni'
    ));

-- Pravidla soutěže nevisí na jednom termínu, ale na soutěži samotné.
-- Slug odpovídá adrese /souteze/<slug>, seznam soutěží je napevno v kódu, proto bez cizího klíče.
alter table public.content_documents
  add column if not exists competition_slug text;

create index if not exists content_documents_competition_slug_idx
  on public.content_documents (competition_slug);
