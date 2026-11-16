-- Notes app schema. Run once in Supabase → SQL Editor (safe to re-run).
-- Every table is private to its owner via row-level security (RLS).

create extension if not exists pgcrypto;

-- updated_at is always set by the server so it can be used as a sync cursor.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- ---------- folders ----------
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid references public.folders(id) on delete set null,
  name        text not null default 'Untitled folder',
  color       text,
  icon        text,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);
create index if not exists folders_user_updated on public.folders(user_id, updated_at);

-- ---------- notes ----------
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id     uuid references public.folders(id) on delete set null,
  title         text not null default '',
  content       jsonb,                 -- TipTap/ProseMirror JSON document
  content_text  text not null default '', -- plain text for search/snippets
  tags          text[] not null default '{}',
  pinned        boolean not null default false,
  favorite      boolean not null default false,
  archived      boolean not null default false,
  inbox         boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default clock_timestamp(),
  deleted_at    timestamptz            -- soft delete (Trash); purge after 30 days client-side
);
create index if not exists notes_user_updated on public.notes(user_id, updated_at);
create index if not exists notes_fts on public.notes
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_text,'')));

-- ---------- version history ----------
create table if not exists public.note_versions (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  content     jsonb,
  content_text text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists note_versions_note on public.note_versions(note_id, created_at desc);

-- Snapshot the previous content when it changes, at most once per 10 minutes per note.
create or replace function public.snapshot_note_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.content is distinct from new.content or old.title is distinct from new.title)
     and old.content is not null
     and not exists (
       select 1 from public.note_versions v
       where v.note_id = old.id and v.created_at > now() - interval '10 minutes')
  then
    insert into public.note_versions(note_id, user_id, title, content, content_text)
    values (old.id, old.user_id, old.title, old.content, old.content_text);
  end if;
  return new;
end $$;

-- ---------- attachments (files live in the private 'attachments' storage bucket) ----------
create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id     uuid references public.notes(id) on delete set null,
  path        text not null,          -- '<user_id>/<uuid>-<filename>'
  name        text not null,
  mime        text not null default 'application/octet-stream',
  size        bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);
create index if not exists attachments_user_updated on public.attachments(user_id, updated_at);

-- ---------- vocabulary / flashcards (SM-2 spaced repetition) ----------
create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null default 'vocab',  -- 'vocab' | 'qa'
  deck          text not null default 'Vocabulary',
  front         text not null default '',      -- term / question
  back          text not null default '',      -- definition / answer
  example       text not null default '',
  pronunciation text not null default '',
  source_note_id uuid references public.notes(id) on delete set null,
  ease          double precision not null default 2.5,
  interval_days double precision not null default 0,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  due_at        timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default clock_timestamp(),
  deleted_at    timestamptz
);
create index if not exists cards_user_updated on public.cards(user_id, updated_at);

-- ---------- triggers ----------
do $$
declare t text;
begin
  foreach t in array array['folders','notes','attachments','cards'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
drop trigger if exists notes_snapshot on public.notes;
create trigger notes_snapshot before update on public.notes
  for each row execute function public.snapshot_note_version();

-- ---------- row-level security ----------
do $$
declare t text;
begin
  foreach t in array array['folders','notes','attachments','cards','note_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- storage bucket (private) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "own files read"   on storage.objects;
drop policy if exists "own files write"  on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- account deletion ----------
-- Client deletes storage files first, then calls this. Cascades remove all rows.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- keep-alive (used by the GitHub Action so the free project is not paused) ----------
create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$;
grant execute on function public.ping() to anon, authenticated;

-- ---------- realtime (cross-device live updates) ----------
do $$
declare t text;
begin
  foreach t in array array['folders','notes','attachments','cards'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
