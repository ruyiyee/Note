-- Adds standalone tasks + calendar entries, and personal notes on vocabulary cards.
-- Run once in Supabase → SQL Editor (safe to re-run). Does not touch existing data.

alter table public.cards add column if not exists notes text not null default '';

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'task',   -- 'task' | 'event'
  title       text not null default '',
  date        date,                           -- due date (task) or day (event)
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);
create index if not exists items_user_updated on public.items(user_id, updated_at);

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;
