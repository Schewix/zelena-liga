-- Keep a separate set of correct answers for 3-option (A-C) and 4-option (A-D) target questions.
alter table public.station_category_answers
  add column if not exists option_count smallint;

update public.station_category_answers a
set option_count = case
  when (select e.target_answer_option_count from public.events e where e.id = a.event_id) = 3 then 3
  else 4
end
where a.option_count is null;

alter table public.station_category_answers
  alter column option_count set default 4,
  alter column option_count set not null;

alter table public.station_category_answers
  drop constraint if exists station_category_answers_option_count_check;
alter table public.station_category_answers
  add constraint station_category_answers_option_count_check check (option_count in (3, 4));

alter table public.station_category_answers
  drop constraint if exists station_category_answers_event_id_station_id_category_key;
alter table public.station_category_answers
  drop constraint if exists station_category_answers_event_station_category_option_key;
alter table public.station_category_answers
  add constraint station_category_answers_event_station_category_option_key
  unique (event_id, station_id, category, option_count);
