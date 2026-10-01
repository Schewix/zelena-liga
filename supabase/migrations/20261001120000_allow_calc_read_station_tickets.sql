-- Allow calc station (code T) to read all station queue tickets within its event.
-- Used by the admin live station overview to show waiting/serving counts.

drop policy if exists "station_tickets_select_station" on public.station_tickets;
create policy "station_tickets_select_station" on public.station_tickets
  for select using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and auth.jwt()->>'event_id' = event_id::text
      and (
        (
          auth.jwt()->>'station_id' = station_id::text
          and public.is_station_account_assigned(
            event_id,
            station_id,
            public.current_station_account_id()
          )
        )
        or exists (
          select 1
          from public.stations s
          where s.id = public.current_station_id()
            and s.event_id = event_id
            and s.code = 'T'
            and public.is_station_account_assigned(
              event_id,
              s.id,
              public.current_station_account_id()
            )
        )
      )
    )
  );
