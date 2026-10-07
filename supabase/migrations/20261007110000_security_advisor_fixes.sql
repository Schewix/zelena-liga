-- Supabase security advisor fixes.

-- event_station_orders is only accessed server-side with the service role,
-- which bypasses RLS. Enabling RLS without policies denies anon/authenticated.
alter table public.event_station_orders enable row level security;

-- Afterparty leaderboards read only tables that already have anon-readable
-- RLS policies, so they can safely run with the caller's permissions.
alter view public.afterparty_individual_leaderboard set (security_invoker = true);
alter view public.afterparty_troop_leaderboard set (security_invoker = true);

-- Pin search_path on functions flagged as mutable. Looked up by name so the
-- statement does not depend on the exact argument lists.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_content_gallery_albums_updated_at',
        'set_content_articles_updated_at',
        'set_content_league_scores_updated_at',
        'set_content_league_seasons_updated_at',
        'set_content_league_season_troops_updated_at',
        'set_content_league_season_events_updated_at',
        'set_content_league_history_updated_at',
        'set_content_documents_updated_at',
        'set_content_schedule_events_updated_at',
        'current_station_account_id',
        'current_station_id',
        'list_station_tickets',
        'upsert_station_ticket',
        'board_claim_sub_uuid',
        'board_claim_station_uuid',
        'board_points_lower_is_better'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.sig);
  end loop;
end $$;

-- submit_station_record is only called from /api/submit-station-record with
-- the service role. Do not expose it as an RPC to anon/authenticated users.
revoke execute on function public.submit_station_record(
  uuid, uuid, uuid, public.category, timestamptz, integer, integer, text,
  boolean, text, timestamptz, timestamptz, uuid, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.submit_station_record(
  uuid, uuid, uuid, public.category, timestamptz, integer, integer, text,
  boolean, text, timestamptz, timestamptz, uuid, timestamptz, uuid
) to service_role;
