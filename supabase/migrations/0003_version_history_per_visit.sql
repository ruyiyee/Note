-- Version history: a snapshot every 30 minutes while editing (taken by the app),
-- and after a visit ends only that visit's latest snapshot is kept.
-- Run once in Supabase → SQL Editor (safe to re-run). Keeps all notes.

-- 1) Snapshots now come from the app, tagged with the visit (session) they belong to.
alter table public.note_versions add column if not exists session_id text;
create index if not exists note_versions_session on public.note_versions(note_id, session_id, created_at desc);

-- 2) Stop the old automatic 10-minute snapshots from the database.
drop trigger if exists notes_snapshot on public.notes;

-- 3) Keep one snapshot (the latest) per earlier visit. Older rows without a visit id
--    are grouped by day. Runs with the caller's permissions, so RLS still applies.
create or replace function public.compact_note_versions(p_note uuid, p_session text)
returns void language sql security invoker set search_path = public as $$
  delete from public.note_versions v
  where v.note_id = p_note
    and v.user_id = auth.uid()
    and coalesce(v.session_id, '') <> coalesce(p_session, '')
    and exists (
      select 1 from public.note_versions w
      where w.note_id = v.note_id
        and coalesce(w.session_id, w.created_at::date::text) = coalesce(v.session_id, v.created_at::date::text)
        and w.created_at > v.created_at);
$$;
grant execute on function public.compact_note_versions(uuid, text) to authenticated;
