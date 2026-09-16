-- Propozice a zápisy patří ke konkrétní akci z Plánu akcí, ať se dají ukázat přímo u termínu.
-- Smazání termínu dokument nezahodí, jen ho odpojí — soubor v úložišti má vlastní život.
alter table public.content_documents
  add column if not exists schedule_event_id uuid
    references public.content_schedule_events (id) on delete set null;

create index if not exists content_documents_schedule_event_idx
  on public.content_documents (schedule_event_id);
